import { EventEmitter } from 'node:events';
import { resolveAlert } from './alertStrategies.js';
import { Signal, WorkItem, SeverityRank, IncidentState } from './models.js';
import { assertTransition, calculateMttrSeconds } from './stateMachine.js';

const DEBOUNCE_WINDOW_MS = 10_000;
const QUEUE_LIMIT = 50_000;

export class IncidentEngine extends EventEmitter {
  constructor(stores) {
    super();
    this.stores = stores;
    this.queue = [];
    this.processing = false;
    this.workItems = new Map();
    this.activeByComponent = new Map();
    this.aggregations = {};
    this.metrics = { accepted: 0, rejected: 0, processed: 0, lastProcessed: 0 };
  }

  async init() {
    this.workItems = await this.stores.loadWorkItems();
    for (const item of this.workItems.values()) {
      if (item.state !== IncidentState.CLOSED) this.activeByComponent.set(item.componentId, item.id);
    }
  }

  ingest(payload) {
    if (this.queue.length >= QUEUE_LIMIT) {
      this.metrics.rejected += 1;
      throw new Error('backpressure: ingestion queue is full');
    }
    const signal = new Signal(payload);
    signal.validate();
    this.queue.push(signal);
    this.metrics.accepted += 1;
    void this.drain();
    return { signalId: signal.id, queued: this.queue.length };
  }

  async drain() {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const signal = this.queue.shift();
      await this.process(signal);
    }
    this.processing = false;
  }

  async process(signal) {
    await this.stores.appendRawSignal(signal);
    const workItem = this.findOrCreateWorkItem(signal);
    workItem.signalIds.push(signal.id);
    workItem.lastSignalAt = signal.observedAt;
    workItem.updatedAt = new Date().toISOString();
    this.bumpAggregation(signal);
    await this.persistHotPath();
    this.metrics.processed += 1;
    this.emit('processed', workItem);
  }

  findOrCreateWorkItem(signal) {
    const existingId = this.activeByComponent.get(signal.componentId);
    const existing = existingId ? this.workItems.get(existingId) : null;
    if (existing && Date.parse(signal.observedAt) - Date.parse(existing.firstSignalAt) <= DEBOUNCE_WINDOW_MS) {
      return existing;
    }

    const alert = resolveAlert(signal);
    const workItem = new WorkItem({
      componentId: signal.componentId,
      componentType: signal.componentType,
      severity: alert.severity,
      firstSignalAt: signal.observedAt,
      alertChannel: alert.channel
    });
    this.workItems.set(workItem.id, workItem);
    this.activeByComponent.set(signal.componentId, workItem.id);
    console.log(`[alert] ${alert.channel}: ${alert.message}`);
    return workItem;
  }

  async updateState(id, nextState, rca) {
    const workItem = this.workItems.get(id);
    if (!workItem) throw new Error('work item not found');
    assertTransition(workItem, nextState, rca);
    if (rca) {
      workItem.rca = rca;
      workItem.mttrSeconds = calculateMttrSeconds(workItem.firstSignalAt, rca.endTime);
    }
    workItem.state = nextState;
    workItem.updatedAt = new Date().toISOString();
    if (nextState === IncidentState.CLOSED) this.activeByComponent.delete(workItem.componentId);
    await this.persistHotPath();
    return workItem;
  }

  listIncidents() {
    return [...this.workItems.values()].sort((a, b) => {
      const severity = SeverityRank[a.severity] - SeverityRank[b.severity];
      return severity || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
  }

  getIncident(id) {
    return this.workItems.get(id);
  }

  async getSignals(id) {
    const workItem = this.workItems.get(id);
    if (!workItem) throw new Error('work item not found');
    return this.stores.querySignals(workItem.componentId);
  }

  bumpAggregation(signal) {
    const minute = signal.observedAt.slice(0, 16);
    const key = `${minute}|${signal.componentType}`;
    this.aggregations[key] = (this.aggregations[key] || 0) + 1;
  }

  async persistHotPath() {
    await this.stores.persistWorkItems(this.workItems);
    await this.stores.persistDashboard(this.listIncidents());
    await this.stores.persistAggregations(this.aggregations);
  }

  snapshotMetrics() {
    const delta = this.metrics.processed - this.metrics.lastProcessed;
    this.metrics.lastProcessed = this.metrics.processed;
    return { ...this.metrics, signalsPerSecond: delta / 5, queueDepth: this.queue.length };
  }
}

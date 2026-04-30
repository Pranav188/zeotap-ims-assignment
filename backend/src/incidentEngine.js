import { EventEmitter } from 'node:events';
import { resolveAlert } from './alertStrategies.js';
import { Signal, WorkItem, SeverityRank, IncidentState } from './models.js';
import { assertTransition, calculateMttrSeconds } from './stateMachine.js';

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
    this.lock = Promise.resolve();
  }

  async init() {
    this.workItems = await this.stores.loadWorkItems();
    for (const item of this.workItems.values()) {
      if (item.state === IncidentState.CLOSED) continue;
      const currentId = this.activeByComponent.get(item.componentId);
      const current = currentId ? this.workItems.get(currentId) : null;
      if (!current || Date.parse(item.updatedAt) > Date.parse(current.updatedAt)) {
        this.activeByComponent.set(item.componentId, item.id);
      }
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
    try {
      while (this.queue.length > 0) {
        const signal = this.queue.shift();
        try {
          await this.process(signal);
        } catch (error) {
          this.metrics.rejected += 1;
          console.error(`[processor] failed signal=${signal.id}: ${error.message}`);
        }
      }
    } finally {
      this.processing = false;
      if (this.queue.length > 0) void this.drain();
    }
  }

  async process(signal) {
    await this.stores.appendRawSignal(signal);
    return this.withLock(async () => {
      const workItem = this.findOrCreateWorkItem(signal);
      workItem.signalIds.push(signal.id);
      workItem.lastSignalAt = signal.observedAt;
      workItem.updatedAt = new Date().toISOString();
      this.bumpAggregation(signal);
      await this.persistHotPath();
      this.metrics.processed += 1;
      this.emit('processed', workItem);
      return workItem;
    });
  }

  findOrCreateWorkItem(signal) {
    const existingId = this.activeByComponent.get(signal.componentId);
    const existing = existingId ? this.workItems.get(existingId) : null;
    if (existing && existing.state !== IncidentState.CLOSED) {
      // Covers the required 10-second debounce window and keeps a longer outage
      // attached to the same active incident until RCA closure.
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
    return this.withLock(async () => {
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
    });
  }

  listIncidents({ includeClosed = false } = {}) {
    return [...this.workItems.values()].filter(item => includeClosed || item.state !== IncidentState.CLOSED).sort((a, b) => {
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
    return this.stores.querySignalsByIds(workItem.signalIds);
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

  async withLock(operation) {
    const run = this.lock.then(operation, operation);
    this.lock = run.catch(() => {});
    return run;
  }
}

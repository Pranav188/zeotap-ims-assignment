export const IncidentState = Object.freeze({
  OPEN: 'OPEN',
  INVESTIGATING: 'INVESTIGATING',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED'
});

export const SeverityRank = Object.freeze({ P0: 0, P1: 1, P2: 2, P3: 3 });

export class Signal {
  constructor(payload) {
    const now = new Date().toISOString();
    this.id = payload.id || crypto.randomUUID();
    this.componentId = payload.componentId;
    this.componentType = payload.componentType || 'UNKNOWN';
    this.message = payload.message || 'Signal received';
    this.observedAt = payload.observedAt || now;
    this.latencyMs = Number(payload.latencyMs || 0);
    this.errorCode = payload.errorCode || null;
    this.payload = payload.payload || {};
  }

  validate() {
    if (!this.componentId) throw new Error('componentId is required');
    if (!this.componentType) throw new Error('componentType is required');
  }
}

export class WorkItem {
  constructor({ id, componentId, componentType, severity, firstSignalAt, alertChannel }) {
    this.id = id || crypto.randomUUID();
    this.componentId = componentId;
    this.componentType = componentType;
    this.severity = severity;
    this.alertChannel = alertChannel;
    this.state = IncidentState.OPEN;
    this.firstSignalAt = firstSignalAt;
    this.lastSignalAt = firstSignalAt;
    this.signalIds = [];
    this.rca = null;
    this.mttrSeconds = null;
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
  }
}

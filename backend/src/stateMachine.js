import { IncidentState } from './models.js';

const allowedTransitions = {
  [IncidentState.OPEN]: [IncidentState.INVESTIGATING, IncidentState.RESOLVED],
  [IncidentState.INVESTIGATING]: [IncidentState.RESOLVED],
  [IncidentState.RESOLVED]: [IncidentState.CLOSED, IncidentState.INVESTIGATING],
  [IncidentState.CLOSED]: []
};

export function isRcaComplete(rca) {
  return Boolean(
    rca &&
    rca.startTime &&
    rca.endTime &&
    rca.rootCauseCategory &&
    rca.fixApplied &&
    rca.preventionSteps
  );
}

export function assertTransition(workItem, nextState, rca) {
  const allowed = allowedTransitions[workItem.state] || [];
  if (!allowed.includes(nextState)) {
    throw new Error(`invalid transition ${workItem.state} -> ${nextState}`);
  }
  if (nextState === IncidentState.CLOSED && !isRcaComplete(rca || workItem.rca)) {
    throw new Error('complete RCA is required before closing an incident');
  }
}

export function calculateMttrSeconds(firstSignalAt, rcaEndTime) {
  const start = Date.parse(firstSignalAt);
  const end = Date.parse(rcaEndTime);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    throw new Error('RCA endTime must be after incident start');
  }
  return Math.round((end - start) / 1000);
}

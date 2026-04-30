import { IncidentState } from './models.js';

const allowedTransitions = {
  [IncidentState.OPEN]: [IncidentState.INVESTIGATING],
  [IncidentState.INVESTIGATING]: [IncidentState.RESOLVED],
  [IncidentState.RESOLVED]: [IncidentState.CLOSED, IncidentState.INVESTIGATING],
  [IncidentState.CLOSED]: []
};

export function isRcaComplete(rca) {
  return Boolean(
    rca &&
    hasText(rca.startTime) &&
    hasText(rca.endTime) &&
    hasText(rca.rootCauseCategory) &&
    hasText(rca.fixApplied) &&
    hasText(rca.preventionSteps)
  );
}

export function assertTransition(workItem, nextState, rca) {
  if (!Object.values(IncidentState).includes(nextState)) {
    throw new Error(`invalid state ${nextState}`);
  }
  const allowed = allowedTransitions[workItem.state] || [];
  if (!allowed.includes(nextState)) {
    throw new Error(`invalid transition ${workItem.state} -> ${nextState}`);
  }
  if (nextState === IncidentState.CLOSED && !isRcaComplete(rca || workItem.rca)) {
    throw new Error('complete RCA is required before closing an incident');
  }
  if (nextState === IncidentState.CLOSED) validateRcaDates(rca || workItem.rca);
}

export function calculateMttrSeconds(firstSignalAt, rcaEndTime) {
  const start = Date.parse(firstSignalAt);
  const end = Date.parse(rcaEndTime);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    throw new Error('RCA endTime must be after incident start');
  }
  return Math.round((end - start) / 1000);
}

function hasText(value) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function validateRcaDates(rca) {
  const start = Date.parse(rca.startTime);
  const end = Date.parse(rca.endTime);
  if (Number.isNaN(start)) throw new Error('RCA startTime must be a valid date');
  if (Number.isNaN(end)) throw new Error('RCA endTime must be a valid date');
  if (end < start) throw new Error('RCA endTime must be after RCA startTime');
}

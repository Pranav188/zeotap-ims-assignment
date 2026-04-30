import test from 'node:test';
import assert from 'node:assert/strict';
import { IncidentState } from '../src/models.js';
import { assertTransition, isRcaComplete, calculateMttrSeconds } from '../src/stateMachine.js';

test('rejects CLOSED transition without complete RCA', () => {
  const workItem = { state: IncidentState.RESOLVED };
  assert.throws(() => assertTransition(workItem, IncidentState.CLOSED, null), /complete RCA/);
});

test('accepts CLOSED transition with complete RCA', () => {
  const workItem = { state: IncidentState.RESOLVED };
  const rca = {
    startTime: '2026-04-30T07:00:00.000Z',
    endTime: '2026-04-30T07:15:00.000Z',
    rootCauseCategory: 'Database',
    fixApplied: 'Promoted replica',
    preventionSteps: 'Add failover drill'
  };
  assert.equal(isRcaComplete(rca), true);
  assert.doesNotThrow(() => assertTransition(workItem, IncidentState.CLOSED, rca));
});

test('calculates MTTR from first signal to RCA end time', () => {
  assert.equal(calculateMttrSeconds('2026-04-30T07:00:00.000Z', '2026-04-30T07:15:00.000Z'), 900);
});

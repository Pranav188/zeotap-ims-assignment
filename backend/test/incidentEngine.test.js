import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IncidentEngine } from '../src/incidentEngine.js';
import { JsonStores } from '../src/storage.js';
import { IncidentState } from '../src/models.js';

async function createEngine() {
  const dir = await mkdtemp(join(tmpdir(), 'ims-test-'));
  const stores = new JsonStores(dir);
  await stores.init();
  const engine = new IncidentEngine(stores);
  await engine.init();
  return { dir, engine };
}

test('keeps repeated component signals on one active work item until closure', async () => {
  const { dir, engine } = await createEngine();
  try {
    await engine.process({
      id: 'signal-1',
      componentId: 'RDBMS_PRIMARY_01',
      componentType: 'RDBMS',
      message: 'database latency high',
      observedAt: '2026-04-30T08:00:00.000Z',
      latencyMs: 1800,
      errorCode: 'DB_LATENCY_HIGH',
      payload: {}
    });
    await engine.process({
      id: 'signal-2',
      componentId: 'RDBMS_PRIMARY_01',
      componentType: 'RDBMS',
      message: 'database still slow',
      observedAt: '2026-04-30T08:01:00.000Z',
      latencyMs: 1900,
      errorCode: 'DB_LATENCY_HIGH',
      payload: {}
    });

    const [incident] = engine.listIncidents();
    assert.equal(engine.listIncidents().length, 1);
    assert.equal(incident.severity, 'P0');
    assert.deepEqual(incident.signalIds, ['signal-1', 'signal-2']);

    const signals = await engine.getSignals(incident.id);
    assert.deepEqual(signals.map(signal => signal.id), ['signal-1', 'signal-2']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('creates a new work item for the same component after the previous one is closed', async () => {
  const { dir, engine } = await createEngine();
  try {
    const first = await engine.process({
      id: 'signal-1',
      componentId: 'CACHE_CLUSTER_01',
      componentType: 'CACHE',
      message: 'cache spike',
      observedAt: '2026-04-30T08:00:00.000Z',
      latencyMs: 620,
      errorCode: 'CACHE_P99_SPIKE',
      payload: {}
    });
    await engine.updateState(first.id, IncidentState.INVESTIGATING);
    await engine.updateState(first.id, IncidentState.RESOLVED);
    await engine.updateState(first.id, IncidentState.CLOSED, {
      startTime: '2026-04-30T08:00:00.000Z',
      endTime: '2026-04-30T08:05:00.000Z',
      rootCauseCategory: 'Cache',
      fixApplied: 'Restarted saturated shard',
      preventionSteps: 'Add earlier p99 alert'
    });

    const second = await engine.process({
      id: 'signal-2',
      componentId: 'CACHE_CLUSTER_01',
      componentType: 'CACHE',
      message: 'new cache spike',
      observedAt: '2026-04-30T09:00:00.000Z',
      latencyMs: 700,
      errorCode: 'CACHE_P99_SPIKE',
      payload: {}
    });

    assert.notEqual(first.id, second.id);
    assert.equal(engine.listIncidents().length, 1);
    assert.equal(engine.listIncidents()[0].id, second.id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

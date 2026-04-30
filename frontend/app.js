let selectedId = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stateOptions(currentState) {
  const transitions = {
    OPEN: ['INVESTIGATING'],
    INVESTIGATING: ['RESOLVED'],
    RESOLVED: ['CLOSED', 'INVESTIGATING'],
    CLOSED: []
  };
  const options = transitions[currentState] || [];
  return options.length
    ? options.map(state => `<option>${state}</option>`).join('')
    : `<option>${escapeHtml(currentState)}</option>`;
}

function datetimeLocalValue(iso) {
  return iso ? iso.slice(0, 16) : '';
}

async function json(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    ...options
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'request failed');
  return body;
}

function incidentButton(item) {
  const severityClass = item.severity.toLowerCase();
  return `<button class="incident" data-id="${escapeHtml(item.id)}">
    <strong>${escapeHtml(item.componentId)}</strong>
    <span>${escapeHtml(item.componentType)} via ${escapeHtml(item.alertChannel)}</span>
    <span class="meta">
      <span class="pill ${severityClass}">${escapeHtml(item.severity)}</span>
      <span class="pill">${escapeHtml(item.state)}</span>
      <span>${item.signalIds.length} signals</span>
    </span>
  </button>`;
}

async function loadIncidents() {
  const incidents = await json('/api/incidents');
  document.querySelector('#incidents').innerHTML = incidents.length
    ? incidents.map(incidentButton).join('')
    : '<div class="empty">No incidents yet.</div>';
  document.querySelectorAll('.incident').forEach(button => {
    button.addEventListener('click', () => loadDetail(button.dataset.id));
  });
}

async function loadDetail(id) {
  selectedId = id;
  const [incident, signals] = await Promise.all([
    json(`/api/incidents/${id}`),
    json(`/api/incidents/${id}/signals`)
  ]);
  document.querySelector('#selected').textContent = incident.componentId;
  const rca = incident.rca || {};
  document.querySelector('#detailBody').innerHTML = `
    <div class="panel">
      <h2>${escapeHtml(incident.componentId)}</h2>
      <p>${escapeHtml(incident.severity)} ${escapeHtml(incident.state)} - MTTR: ${escapeHtml(incident.mttrSeconds ?? 'pending')} seconds</p>
      <div class="meta"><span>First: ${escapeHtml(incident.firstSignalAt)}</span><span>Last: ${escapeHtml(incident.lastSignalAt)}</span></div>
    </div>
    <form id="stateForm" class="panel">
      <div id="formMessage" class="form-message" hidden></div>
      <div class="grid">
        <label>Status
          <select name="state" ${incident.state === 'CLOSED' ? 'disabled' : ''}>${stateOptions(incident.state)}</select>
        </label>
        <label>Root cause category
          <select name="rootCauseCategory">
            ${['Database', 'Cache', 'Queue', 'Application', 'Network'].map(category => `<option ${rca.rootCauseCategory === category ? 'selected' : ''}>${category}</option>`).join('')}
          </select>
        </label>
        <label>Incident start
          <input name="startTime" type="datetime-local" value="${datetimeLocalValue(rca.startTime || incident.firstSignalAt)}">
        </label>
        <label>Incident end
          <input name="endTime" type="datetime-local" value="${datetimeLocalValue(rca.endTime)}">
        </label>
      </div>
      <label>Fix applied<textarea name="fixApplied">${escapeHtml(rca.fixApplied || '')}</textarea></label>
      <label>Prevention steps<textarea name="preventionSteps">${escapeHtml(rca.preventionSteps || '')}</textarea></label>
      <button type="submit" ${incident.state === 'CLOSED' ? 'disabled' : ''}>Update incident</button>
    </form>
    <div class="panel">
      <h2>Raw signals</h2>
      <pre>${escapeHtml(JSON.stringify(signals, null, 2))}</pre>
    </div>`;
  document.querySelector('#stateForm').addEventListener('submit', submitState);
}

async function submitState(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const needsRca = data.state === 'CLOSED';
  const message = document.querySelector('#formMessage');
  message.hidden = true;
  try {
    await json(`/api/incidents/${selectedId}/state`, {
      method: 'PATCH',
      body: JSON.stringify({
        state: data.state,
        rca: needsRca ? {
          startTime: new Date(data.startTime).toISOString(),
          endTime: data.endTime ? new Date(data.endTime).toISOString() : '',
          rootCauseCategory: data.rootCauseCategory,
          fixApplied: data.fixApplied,
          preventionSteps: data.preventionSteps
        } : null
      })
    });
    await loadIncidents();
    await loadDetail(selectedId);
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
  }
}

document.querySelector('#simulate').addEventListener('click', async () => {
  const failures = [
    { componentId: 'RDBMS_PRIMARY_01', componentType: 'RDBMS', message: 'connection pool exhausted', errorCode: 'DB_POOL_TIMEOUT' },
    { componentId: 'MCP_HOST_02', componentType: 'MCP_HOST', message: 'host heartbeat missed', errorCode: 'MCP_HEARTBEAT' },
    { componentId: 'CACHE_CLUSTER_01', componentType: 'CACHE', message: 'latency spike', latencyMs: 620 }
  ];
  for (let i = 0; i < 120; i += 1) {
    const signal = failures[i % failures.length];
    await json('/api/signals', { method: 'POST', body: JSON.stringify({ ...signal, payload: { sequence: i } }) });
  }
  await loadIncidents();
});

async function checkHealth() {
  try {
    const health = await json('/health');
    document.querySelector('#health').textContent = `${health.status} ${Math.round(health.uptimeSeconds)}s`;
  } catch {
    document.querySelector('#health').textContent = 'offline';
  }
}

setInterval(loadIncidents, 3000);
setInterval(checkHealth, 5000);
await checkHealth();
await loadIncidents();

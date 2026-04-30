import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IncidentEngine } from './incidentEngine.js';
import { JsonStores } from './storage.js';
import { TokenBucket } from './rateLimiter.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '../..');
const frontendDir = join(rootDir, 'frontend');
const port = Number(process.env.PORT || 8080);

const stores = new JsonStores(process.env.DATA_DIR || join(rootDir, 'data'));
await stores.init();
const engine = new IncidentEngine(stores);
await engine.init();
const limiter = new TokenBucket({ capacity: 12_000, refillPerSecond: 10_000 });

setInterval(() => {
  const metrics = engine.snapshotMetrics();
  console.log(`[metrics] accepted=${metrics.accepted} processed=${metrics.processed} rejected=${metrics.rejected} queue=${metrics.queueDepth} rate=${metrics.signalsPerSecond}/sec`);
}, 5000).unref();

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function serveStatic(req, res) {
  const path = req.url === '/' ? '/index.html' : req.url;
  const filePath = join(frontendDir, decodeURIComponent(path.split('?')[0]));
  if (!filePath.startsWith(frontendDir)) return sendJson(res, 403, { error: 'forbidden' });
  try {
    const content = await readFile(filePath);
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
    res.writeHead(200, { 'content-type': types[extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: 'not found' });
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return sendJson(res, 204, {});
    if (req.url === '/health') return sendJson(res, 200, { status: 'ok', uptimeSeconds: process.uptime() });
    if (req.method === 'POST' && req.url === '/api/signals') {
      if (!limiter.allow()) return sendJson(res, 429, { error: 'rate limit exceeded' });
      return sendJson(res, 202, engine.ingest(await readJson(req)));
    }
    if (req.method === 'GET' && req.url === '/api/incidents') return sendJson(res, 200, engine.listIncidents());

    const match = req.url.match(/^\/api\/incidents\/([^/]+)(?:\/signals)?$/);
    if (match && req.method === 'GET') {
      if (req.url.endsWith('/signals')) return sendJson(res, 200, await engine.getSignals(match[1]));
      const incident = engine.getIncident(match[1]);
      return incident ? sendJson(res, 200, incident) : sendJson(res, 404, { error: 'not found' });
    }
    const stateMatch = req.url.match(/^\/api\/incidents\/([^/]+)\/state$/);
    if (stateMatch && req.method === 'PATCH') {
      const body = await readJson(req);
      return sendJson(res, 200, await engine.updateState(stateMatch[1], body.state, body.rca));
    }
    return serveStatic(req, res);
  } catch (error) {
    const status = ['required', 'invalid', 'complete RCA', 'after incident start'].some(text => error.message.includes(text)) ? 400 : 500;
    sendJson(res, status, { error: error.message });
  }
});

server.listen(port, () => console.log(`IMS listening on http://localhost:${port}`));

import { mkdir, readFile, writeFile, appendFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';

const retry = async (fn, attempts = 3) => {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 30 * (i + 1)));
    }
  }
  throw lastError;
};

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export class JsonStores {
  constructor(baseDir = './data') {
    this.baseDir = baseDir;
    this.workItemsPath = `${baseDir}/work-items.json`;
    this.rawSignalsPath = `${baseDir}/raw-signals.jsonl`;
    this.dashboardPath = `${baseDir}/dashboard-state.json`;
    this.aggregationsPath = `${baseDir}/aggregations.json`;
  }

  async init() {
    await mkdir(this.baseDir, { recursive: true });
    await ensureJson(this.workItemsPath, []);
    await ensureJson(this.dashboardPath, []);
    await ensureJson(this.aggregationsPath, {});
  }

  async appendRawSignal(signal) {
    await retry(async () => {
      await mkdir(dirname(this.rawSignalsPath), { recursive: true });
      await appendFile(this.rawSignalsPath, `${JSON.stringify(signal)}\n`);
    });
  }

  async loadWorkItems() {
    const items = await readJson(this.workItemsPath, []);
    return new Map(items.map(item => [item.id, item]));
  }

  async persistWorkItems(workItems) {
    await retry(() => writeFile(this.workItemsPath, JSON.stringify([...workItems.values()], null, 2)));
  }

  async persistDashboard(workItems) {
    await retry(() => writeFile(this.dashboardPath, JSON.stringify(workItems, null, 2)));
  }

  async persistAggregations(aggregations) {
    await retry(() => writeFile(this.aggregationsPath, JSON.stringify(aggregations, null, 2)));
  }

  async querySignalsByIds(signalIds) {
    const wanted = new Set(signalIds);
    try {
      const content = await readFile(this.rawSignalsPath, 'utf8');
      return content
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line))
        .filter(signal => wanted.has(signal.id));
    } catch {
      return [];
    }
  }
}

async function ensureJson(path, fallback) {
  try {
    await access(path);
  } catch {
    await writeFile(path, JSON.stringify(fallback, null, 2));
  }
}

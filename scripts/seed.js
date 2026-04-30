import { readFile } from 'node:fs/promises';

const target = process.env.IMS_URL || 'http://localhost:8080';
const events = JSON.parse(await readFile(new URL('../sample-data/failure-events.json', import.meta.url), 'utf8'));

for (let i = 0; i < 300; i += 1) {
  const event = events[i % events.length];
  const response = await fetch(`${target}/api/signals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...event, payload: { ...event.payload, sequence: i } })
  });
  if (!response.ok) throw new Error(`seed failed: ${response.status} ${await response.text()}`);
}
console.log(`Seeded ${300} signals into ${target}`);

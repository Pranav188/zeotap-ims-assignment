const strategies = {
  RDBMS: signal => ({ severity: 'P0', channel: 'pagerduty-primary', message: `P0 database outage: ${signal.componentId}` }),
  API: signal => ({ severity: 'P1', channel: 'slack-api-oncall', message: `P1 API failure: ${signal.componentId}` }),
  MCP_HOST: signal => ({ severity: 'P1', channel: 'slack-platform-oncall', message: `P1 MCP host failure: ${signal.componentId}` }),
  QUEUE: signal => ({ severity: 'P1', channel: 'slack-async-oncall', message: `P1 queue failure: ${signal.componentId}` }),
  CACHE: signal => ({ severity: 'P2', channel: 'slack-cache-oncall', message: `P2 cache degradation: ${signal.componentId}` }),
  NOSQL: signal => ({ severity: 'P1', channel: 'slack-data-oncall', message: `P1 NoSQL failure: ${signal.componentId}` })
};

export function resolveAlert(signal) {
  const strategy = strategies[signal.componentType] || (() => ({
    severity: 'P3',
    channel: 'slack-observability',
    message: `P3 unknown component signal: ${signal.componentId}`
  }));
  return strategy(signal);
}

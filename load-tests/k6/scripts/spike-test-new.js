// Spike Test - Sudden traffic surge
// Duration: 5 minutes
// VUs: Sudden jump from 10 to 300
// Purpose: Test autoscaler responsiveness and burst handling

import http from 'k6/http';
import { check, sleep } from 'k6';
import { getConfig } from '../utils/config.js';

const config = getConfig();

export const options = {
  stages: [
    { duration: '30s', target: 10 },    // Baseline
    { duration: '30s', target: 300 },   // SPIKE! (10x sudden increase)
    { duration: '2m', target: 300 },    // Sustain spike
    { duration: '30s', target: 10 },    // Drop back to baseline
    { duration: '1m', target: 0 },      // Cool down
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],      // Allow 10% errors during spike
    http_req_duration: ['p(90)<3000'],   // 90% under 3s during spike
  },
};

export default function () {
  const res = http.get(`${config.baseUrl}/health`);
  
  check(res, {
    'survived spike': (r) => r.status === 200 || r.status === 429 || r.status === 503,
    'response eventually received': (r) => r.timings.duration < 10000, // 10s max wait
  });

  sleep(Math.random() * 0.5); // Aggressive - 0-500ms
}

export function handleSummary(data) {
  console.log(`\n⚡ Spike Test Summary for ${config.description}`);
  console.log(`   Base URL: ${config.baseUrl}`);
  console.log(`   Total Requests: ${data.metrics.http_reqs.values.count}`);
  console.log(`   Failed Requests: ${data.metrics.http_req_failed.values.passes || 0}`);
  console.log(`   Avg Response Time: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms`);
  console.log(`   p90 Response Time: ${data.metrics.http_req_duration.values['p(90)'].toFixed(2)}ms`);
  console.log(`   Max Response Time: ${data.metrics.http_req_duration.values.max.toFixed(2)}ms`);
  
  console.log(`\n🎯 Check if:`);
  console.log(`   - HPA scaled pods quickly enough`);
  console.log(`   - Circuit breakers triggered appropriately`);
  console.log(`   - No cascading failures occurred`);
  console.log(`   - System recovered after spike ended`);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const resultFile = `./results/spike-test-${timestamp}.json`;
  console.log(`\\n   Results saved to: ${resultFile}`);
  
  return {
    'stdout': JSON.stringify(data, null, 2),
    [resultFile]: JSON.stringify(data, null, 2),
  };
}
}


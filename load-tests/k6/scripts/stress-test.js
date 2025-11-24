// Stress Test - Push beyond normal capacity to find breaking point
// Duration: 10 minutes
// VUs: Up to 200 concurrent users
// Purpose: Find system limits, test autoscaling, identify bottlenecks

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { getConfig } from '../utils/config.js';

const config = getConfig();

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '2m', target: 50 },    // Warm up
    { duration: '2m', target: 100 },   // Approach normal load
    { duration: '2m', target: 200 },   // Stress - beyond normal capacity
    { duration: '2m', target: 300 },   // Heavy stress - find breaking point
    { duration: '2m', target: 0 },     // Recovery - ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],      // Allow up to 5% errors under stress
    http_req_duration: ['p(95)<2000'],   // 95% under 2s (degraded but acceptable)
  },
};

export default function () {
  const res = http.get(`${config.baseUrl}/health`);
  
  const checkResult = check(res, {
    'status is 200 or 429 (rate limited)': (r) => r.status === 200 || r.status === 429,
    'response time acceptable': (r) => r.timings.duration < 3000,
  });

  errorRate.add(!checkResult);

  // Under stress, users might retry faster
  sleep(Math.random() * 1 + 0.5); // 0.5-1.5 seconds
}

export function handleSummary(data) {
  console.log(`\n🔥 Stress Test Summary for ${config.description}`);
  console.log(`   Base URL: ${config.baseUrl}`);
  console.log(`   Total Requests: ${data.metrics.http_reqs.values.count}`);
  console.log(`   Peak Request Rate: ${data.metrics.http_reqs.values.rate.toFixed(2)} req/s`);
  console.log(`   Failed Requests: ${data.metrics.http_req_failed.values.passes || 0}`);
  console.log(`   Avg Response Time: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms`);
  console.log(`   p95 Response Time: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`);
  console.log(`   p99 Response Time: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms`);
  console.log(`   Max Response Time: ${data.metrics.http_req_duration.values.max.toFixed(2)}ms`);
  
  console.log(`\n💡 Monitor Grafana for:`);
  console.log(`   - GC pressure and frequency`);
  console.log(`   - Memory growth patterns`);
  console.log(`   - ThreadPool saturation`);
  console.log(`   - Pod CPU/Memory usage (kubectl top pods)`);
  console.log(`   - HPA scaling events (kubectl get hpa --watch)`);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const resultFile = `./results/stress-test-${timestamp}.json`;
  console.log(`\n   Results saved to: ${resultFile}`);
  
  return {
    'stdout': JSON.stringify(data, null, 2),
    [resultFile]: JSON.stringify(data, null, 2),
  };
}

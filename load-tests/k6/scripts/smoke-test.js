// Smoke Test - Verify test scripts work with minimal load
// Duration: 1 minute
// VUs: 1-3
// Purpose: Quick validation that endpoints are accessible and responding

import http from 'k6/http';
import { check, sleep } from 'k6';
import { getConfig } from '../utils/config.js';

const config = getConfig();

export const options = {
  stages: [
    { duration: '30s', target: 2 },  // Ramp up to 2 users
    { duration: '30s', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],     // HTTP errors should be less than 1%
    http_req_duration: ['p(95)<1000'],  // 95% of requests should be below 1s
  },
};

export default function () {
  // Test health endpoint
  let healthRes = http.get(`${config.baseUrl}/health`);
  check(healthRes, {
    'health check status is 200': (r) => r.status === 200,
    'health check responds quickly': (r) => r.timings.duration < 500,
  });

  sleep(1);

  // Test Swagger endpoint
  let swaggerRes = http.get(`${config.baseUrl}/swagger/v1/swagger.json`);
  check(swaggerRes, {
    'swagger endpoint accessible': (r) => r.status === 200,
    'swagger returns JSON': (r) => r.headers['Content-Type']?.includes('application/json'),
  });

  sleep(1);
}

export function handleSummary(data) {
  console.log(`\n✅ Smoke Test Complete for ${config.description}`);
  console.log(`   Base URL: ${config.baseUrl}`);
  console.log(`   Total Requests: ${data.metrics.http_reqs.values.count}`);
  console.log(`   Failed Requests: ${data.metrics.http_req_failed.values.passes || 0}`);
  console.log(`   Avg Response Time: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms`);
  
  return {
    'stdout': JSON.stringify(data, null, 2),
  };
}

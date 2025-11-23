// Load Test - Simulate normal expected traffic
// Duration: 5 minutes
// VUs: 50 concurrent users
// Purpose: Validate performance under typical load

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { getConfig } from '../utils/config.js';

const config = getConfig();

// Custom metrics
const errorRate = new Rate('errors');
const customDuration = new Trend('custom_duration');

export const options = {
  stages: [
    { duration: '1m', target: 20 },   // Ramp up to 20 users
    { duration: '3m', target: 50 },   // Stay at 50 users for 3 minutes
    { duration: '1m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],      // HTTP errors should be less than 1%
    http_req_duration: ['p(95)<500'],    // 95% of requests should be below 500ms
    http_req_duration: ['p(99)<1000'],   // 99% of requests should be below 1s
    errors: ['rate<0.01'],               // Custom error rate
  },
};

export default function () {
  const endpoints = [
    { url: '/health', weight: 1 },
    { url: '/api/health', weight: 1 },
    // Add your API endpoints here as they become available
    // { url: '/ui/games', weight: 5 },
    // { url: '/ui/leagues', weight: 3 },
  ];

  // Randomly select an endpoint (weighted)
  const totalWeight = endpoints.reduce((sum, ep) => sum + ep.weight, 0);
  let random = Math.random() * totalWeight;
  let selectedEndpoint = endpoints[0];
  
  for (const endpoint of endpoints) {
    random -= endpoint.weight;
    if (random <= 0) {
      selectedEndpoint = endpoint;
      break;
    }
  }

  const startTime = Date.now();
  const res = http.get(`${config.baseUrl}${selectedEndpoint.url}`);
  const duration = Date.now() - startTime;

  customDuration.add(duration);

  const checkResult = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'response has content': (r) => r.body.length > 0,
  });

  errorRate.add(!checkResult);

  // Think time - simulate user reading/processing
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

export function handleSummary(data) {
  console.log(`\n📊 Load Test Summary for ${config.description}`);
  console.log(`   Base URL: ${config.baseUrl}`);
  console.log(`   Total Requests: ${data.metrics.http_reqs.values.count}`);
  console.log(`   Request Rate: ${data.metrics.http_reqs.values.rate.toFixed(2)} req/s`);
  console.log(`   Failed Requests: ${data.metrics.http_req_failed.values.passes || 0}`);
  console.log(`   Avg Response Time: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms`);
  console.log(`   p95 Response Time: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`);
  console.log(`   p99 Response Time: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms`);
  
  const thresholdsPassed = Object.entries(data.metrics)
    .filter(([_, metric]) => metric.thresholds)
    .every(([_, metric]) => !metric.thresholds || Object.values(metric.thresholds).every(t => t.ok));
  
  console.log(`\n   ${thresholdsPassed ? '✅ All thresholds passed' : '❌ Some thresholds failed'}`);
  
  return {
    'stdout': JSON.stringify(data, null, 2),
  };
}

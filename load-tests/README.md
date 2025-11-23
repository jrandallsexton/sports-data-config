# Load Testing with k6

This directory contains k6 load testing scripts for validating cluster performance and horizontal scaling behavior.

## Installation

### Windows (via Chocolatey)
```powershell
choco install k6
```

### Windows (via winget)
```powershell
winget install k6 --source winget
```

### Manual Download
Download from: https://k6.io/docs/get-started/installation/

## Quick Start

### 1. Smoke Test (Verify tests work)
```bash
k6 run scripts/smoke-test.js
```

### 2. Load Test (Normal traffic simulation)
```bash
k6 run scripts/load-test.js
```

### 3. Stress Test (Find breaking point)
```bash
k6 run scripts/stress-test.js
```

### 4. Spike Test (Sudden traffic burst)
```bash
k6 run scripts/spike-test.js
```

## Environment-Specific Testing

### Test against DEV
```bash
k6 run scripts/load-test.js --env ENVIRONMENT=dev
```

### Test against PROD (internal API)
```bash
k6 run scripts/load-test.js --env ENVIRONMENT=prod-internal
```

### Test against PROD (through APIM)
```bash
k6 run scripts/load-test.js --env ENVIRONMENT=prod-external
```

## Monitoring During Tests

### Watch Grafana Dashboard
1. Open: https://admin.sportdeets.com/grafana
2. Navigate to ".NET OpenTelemetry Metrics" dashboard
3. Select the `api-service` from dropdown
4. Monitor:
   - HTTP request duration (p95, p99)
   - GC collections rate
   - Memory usage
   - ThreadPool threads

### Watch Kubernetes Pods
```bash
# Watch pod resource usage
kubectl top pods -n default -l app=api-all --watch

# Watch pod scaling (if HPA configured)
kubectl get hpa -n default --watch

# Watch pod logs
kubectl logs -n default -l app=api-all -f
```

### Watch Prometheus Targets
```bash
# Check if API is healthy during load test
kubectl exec -n monitoring svc/kube-prometheus-stack-kps-prometheus -c prometheus -- \
  wget -q -O- 'http://localhost:9090/api/v1/targets' | ConvertFrom-Json
```

## Test Scenarios

### Read-Heavy Workload
Simulates users browsing data (games, leagues, standings)
```bash
k6 run scenarios/read-heavy.js
```

### Write-Heavy Workload
Simulates users creating picks, leagues, etc.
```bash
k6 run scenarios/write-heavy.js
```

### Realistic User Journey
Simulates actual user behavior: login → browse → create picks
```bash
k6 run scenarios/user-journey.js
```

## Configuration

Test configurations are in `config/`:
- `dev.json` - Development cluster (local or dev environment)
- `prod-internal.json` - Production cluster (api-int.sportdeets.com)
- `prod-external.json` - Production through APIM (api.sportdeets.com)

## Results

Test results are saved to `results/` directory (git-ignored).

View HTML report:
```bash
k6 run scripts/load-test.js --out json=results/test-results.json
# Then use k6 cloud to visualize, or export to Prometheus
```

## Thresholds

Tests include pass/fail thresholds:
- ✅ HTTP errors < 1%
- ✅ p95 response time < 500ms
- ✅ p99 response time < 1000ms

If thresholds fail, k6 exits with non-zero code.

## Tips

1. **Start small**: Run smoke test first to verify everything works
2. **Monitor Grafana**: Keep dashboard open during tests
3. **Check rate limits**: External APIM has 5000 req/min limit
4. **Scale expectations**: Internal API should handle more load than external
5. **Look for memory leaks**: Sustained load tests reveal memory issues
6. **Test HPA**: Stress tests validate horizontal pod autoscaling

## Next Steps

1. Configure HPA for automatic pod scaling
2. Set up Prometheus remote write to persist k6 metrics
3. Integrate with CI/CD for automated load testing
4. Create custom Grafana dashboard for k6 metrics

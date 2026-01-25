# Blue/Green Deployment Strategy

## Overview

Blue/green deployment enables zero-downtime releases by maintaining two identical production environments (blue and green) and switching traffic between them. This document outlines the strategy for implementing blue/green deployments in the SportsData platform.

## Motivation

**Current Pain Points:**
- No safe way to test production deployments before exposing to users
- Breaking changes (like .NET 10 chiseled image ICU issue) cause immediate outages
- Rollback requires rebuilding and redeploying images
- No production validation before traffic shift

**Benefits:**
- Test new deployments in production-like environment before going live
- Instant rollback by switching traffic back to previous namespace
- Zero downtime during deployments
- Reduced risk of production incidents

## Cluster Capacity Analysis

**Current Resources:**
- **4 worker nodes**: AMD Ryzen 5 7640HS (6-core/12-thread @ 5.0GHz) each
- **126GB total cluster RAM** (~31.5GB per node)
- **24 cores / 48 threads** total
- **Dedicated PostgreSQL node** (isolated from k8s workloads)

**Current Workload Estimate:**
- 9 services × ~1-2GB RAM = ~15-20GB RAM used
- Prometheus/Grafana/Loki/Tempo/Traefik overhead: ~10-15GB

**Blue/Green Impact:**
- Doubling app workload: ~30-40GB total for both environments
- **Total usage with blue/green: ~50-60GB of 126GB available**
- **Verdict: Cluster can easily handle blue/green deployments**

## Architecture

### Namespace Strategy

**Two production namespaces that alternate as active/inactive:**
```
production-blue   ← Currently serving traffic (active)
production-green  ← Deployment target (inactive/dark)
```

After successful deployment and validation:
```
production-blue   ← Becomes inactive/dark
production-green  ← Now serving traffic (active)
```

Next deployment flips back to blue, creating a continuous flip-flop pattern.

### Traefik Traffic Switching

**Single IngressRoute that gets updated to point to active namespace:**

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: api-live
  namespace: monitoring  # Or dedicated routing namespace
spec:
  entryPoints:
    - websecure
  routes:
  - match: Host(`api.sportdeets.com`)
    kind: Rule
    services:
    - name: api-service
      namespace: production-blue  # ← Switch this to flip traffic
      port: 8080
  tls:
    certResolver: letsencrypt
```

**To flip traffic:**
1. Update `namespace: production-blue` → `namespace: production-green`
2. Apply the updated IngressRoute
3. Traefik immediately routes all new requests to green namespace

### Database Strategy Options

#### Option 1: Shared Database (Recommended for Initial Implementation)

**Approach:**
- Both blue and green environments connect to the **same PostgreSQL database**
- Simplest implementation, no data synchronization needed

**Requirements:**
- Database migrations **must be backward-compatible**
- New schema changes cannot break old code
- Use expand-contract pattern for schema evolution:
  1. **Expand**: Add new columns/tables without removing old ones
  2. **Deploy**: Roll out application changes
  3. **Contract**: Remove old columns/tables after full deployment

**Pros:**
- Simple configuration (no database duplication)
- No data sync issues
- Immediate consistency across environments

**Cons:**
- Requires strict migration discipline
- Breaking schema changes require coordinated deployment
- Both environments see same data immediately

**Best for:**
- Initial blue/green implementation
- Applications with stable schemas
- Teams with strong migration discipline

#### Option 2: Database per Environment

**Approach:**
- Maintain separate databases: `sportdeets_blue` and `sportdeets_green`
- Sync data before traffic flip

**Pros:**
- Complete isolation between environments
- Can test breaking schema changes safely
- True "dark" environment testing

**Cons:**
- Double storage requirements
- Data synchronization complexity
- Potential data loss if writes occur during sync

**Best for:**
- High-risk schema migrations
- Applications requiring complete isolation
- When storage capacity allows

#### Option 3: Clone-on-Deploy

**Approach:**
- Maintain one production database
- Before deploying to dark environment:
  1. Clone production DB → `sportdeets_staging`
  2. Dark environment uses staging DB for validation
  3. After traffic flip, drop staging DB
  4. Both environments point to production DB

**Pros:**
- Test with real production data
- Safe schema migration testing
- No permanent storage doubling

**Cons:**
- Brief sync/switchover needed during flip
- Clone operation time scales with DB size

**Best for:**
- Validating migrations with production data
- Balance between safety and resource usage

## Resource-Optimized Pipeline Strategy (Recommended)

**Approach: Scale dark environment only during deployment window**

This strategy minimizes resource consumption while maintaining blue/green benefits by keeping the inactive (dark) environment scaled to zero until deployment time.

### Pipeline Architecture

**Three automated pipelines:**

#### Pipeline 1: Deploy to Dark Environment

**Trigger:** New Docker images available (Azure DevOps build completion)

**Steps:**
1. **Identify dark namespace**
   ```bash
   ACTIVE=$(kubectl get ingressroute api-live -o jsonpath='{.spec.routes[0].services[0].namespace}')
   if [ "$ACTIVE" == "production-blue" ]; then
     DARK="production-green"
   else
     DARK="production-blue"
   fi
   ```

2. **Update dark namespace with new image tags**
   ```bash
   cd sports-data-config/app/overlays/$DARK
   kustomize edit set image sportdeets.azurecr.io/sportsdataapi:${BUILD_ID}
   kustomize edit set image sportdeets.azurecr.io/sportsdataproducer:${BUILD_ID}
   # ... other images
   git commit -am "Deploy build ${BUILD_ID} to ${DARK}"
   git push
   ```

3. **Scale up dark namespace** (from 0 to production replica counts)
   ```bash
   kubectl scale deployment api-all -n $DARK --replicas=2
   kubectl scale deployment producer-football-ncaa -n $DARK --replicas=1
   kubectl scale deployment provider-football-ncaa -n $DARK --replicas=1
   kubectl scale deployment contest-football-ncaa -n $DARK --replicas=1
   kubectl scale deployment franchise-football-ncaa -n $DARK --replicas=1
   # ... scale all service deployments
   ```

4. **Wait for all pods to be Ready**
   ```bash
   kubectl wait --for=condition=Ready pod --all -n $DARK --timeout=600s
   ```

5. **Run integration tests against dark environment**
   ```bash
   # Port-forward dark environment services for testing
   kubectl port-forward -n $DARK svc/api-service 9090:8080 &
   PF_PID=$!
   
   # Health checks
   curl -f http://localhost:9090/health || exit 1
   curl -f http://localhost:9090/health/ready || exit 1
   
   # API integration tests
   npm run test:integration -- --baseUrl=http://localhost:9090
   
   # Database connectivity
   curl -f http://localhost:9090/api/franchises/lsu-tigers || exit 1
   
   # External API integration (ESPN, etc.)
   curl -f http://localhost:9090/api/contests/latest || exit 1
   
   # Cleanup
   kill $PF_PID
   ```

6. **Notify team: Dark environment ready for manual validation**
   ```bash
   # Send notification via email/Slack/Teams
   echo "Dark environment ${DARK} deployed with build ${BUILD_ID} and passed integration tests"
   echo "Manual validation available at: kubectl port-forward -n ${DARK} svc/api-service 9090:8080"
   ```

**State after Pipeline 1:**
- **Active environment**: Serving production traffic, unchanged
- **Dark environment**: Running with new images, passed automated tests, ready for manual validation
- **Resource usage**: Doubled (both environments running)

#### Pipeline 2: Flip Traffic to Dark

**Trigger:** Manual approval after extended validation period

**Steps:**
1. **Final validation check**
   ```bash
   # Verify dark environment health before flip
   kubectl get pods -n $DARK -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}' | grep -q "False" && exit 1
   
   # Check for recent errors in logs
   ERROR_COUNT=$(kubectl logs -n $DARK -l app=api-all --since=1h | grep -i "error\|exception" | wc -l)
   if [ $ERROR_COUNT -gt 10 ]; then
     echo "Too many errors in logs, aborting flip"
     exit 1
   fi
   ```

2. **Update IngressRoute to point to dark namespace**
   ```bash
   kubectl patch ingressroute api-live -n monitoring --type='json' \
     -p="[{\"op\": \"replace\", \"path\": \"/spec/routes/0/services/0/namespace\", \"value\": \"${DARK}\"}]"
   ```

3. **Monitor new active environment**
   ```bash
   # Watch for errors in first 5 minutes
   kubectl logs -n $DARK -l app=api-all -f --since=5m
   
   # Check metrics
   # - HTTP 5xx error rate
   # - Response times
   # - Database connection pool
   ```

4. **Notify: Traffic flipped**
   ```bash
   echo "Traffic successfully flipped to ${DARK}"
   echo "Previous active ${ACTIVE} still running for rollback capability"
   echo "Will auto-scale down after 24 hours if no issues"
   ```

**State after Pipeline 2:**
- **New active (former dark)**: Serving all production traffic
- **Old active**: Still running, ready for instant rollback
- **Resource usage**: Still doubled (both environments running)

#### Pipeline 3: Scale Down Old Active

**Trigger:** Scheduled 24 hours after traffic flip (or manual approval)

**Steps:**
1. **Verify new active is stable**
   ```bash
   # Check no critical alerts firing
   ALERTS=$(kubectl exec -n monitoring alertmanager-... -- amtool alert query severity=critical | wc -l)
   if [ $ALERTS -gt 0 ]; then
     echo "Critical alerts firing, keeping old environment running"
     exit 1
   fi
   
   # Check error rates are normal
   # Query Prometheus for 5xx rate over last 24h
   ```

2. **Scale down old active to 0**
   ```bash
   kubectl scale deployment --all -n $ACTIVE --replicas=0
   ```

3. **Notify: Cleanup complete**
   ```bash
   echo "Old environment ${ACTIVE} scaled to 0"
   echo "Next deployment will target ${ACTIVE} as dark environment"
   ```

**Final state:**
- **Active environment**: Serving traffic with new version
- **Dark environment**: Scaled to 0, ready for next deployment
- **Resource usage**: Back to single-environment baseline

### Benefits of This Approach

✅ **Resource efficient**: Only run double workload during validation window (hours to days)  
✅ **Extended validation**: Manual testing period before exposing to production traffic  
✅ **Automated testing**: Integration tests run before human validation  
✅ **Safe rollback**: Old environment kept running 24h after flip for instant rollback  
✅ **Flexible timing**: Can extend validation period as long as needed  
✅ **Cost optimized**: ~30-40GB RAM usage normally, ~60-80GB during deployment window  

### Integration Test Suite

**Required tests before traffic flip:**

```bash
#!/bin/bash
# integration-test-suite.sh
# Run against dark environment before allowing traffic flip

DARK_URL="http://localhost:9090"  # Port-forwarded to dark environment
EXIT_CODE=0

echo "=== Starting Integration Tests ==="

# Health checks
echo "Testing health endpoints..."
curl -f $DARK_URL/health || EXIT_CODE=1
curl -f $DARK_URL/health/ready || EXIT_CODE=1

# Database connectivity
echo "Testing database access..."
curl -f $DARK_URL/api/franchises/lsu-tigers || EXIT_CODE=1
curl -f $DARK_URL/api/venues || EXIT_CODE=1

# External API integration
echo "Testing provider integration..."
PROVIDER_HEALTH=$(curl -s http://localhost:9091/health | jq -r '.status')
if [ "$PROVIDER_HEALTH" != "Healthy" ]; then
  echo "Provider unhealthy"
  EXIT_CODE=1
fi

# Producer canonical data
echo "Testing producer API..."
PRODUCER_HEALTH=$(curl -s http://localhost:9092/health | jq -r '.status')
if [ "$PRODUCER_HEALTH" != "Healthy" ]; then
  echo "Producer unhealthy"
  EXIT_CODE=1
fi

# API Gateway HATEOAS
echo "Testing API HATEOAS responses..."
FRANCHISE=$(curl -s $DARK_URL/api/football/ncaa/franchises/lsu-tigers)
SELF_LINK=$(echo $FRANCHISE | jq -r '.links.self')
if [ -z "$SELF_LINK" ]; then
  echo "Missing HATEOAS links"
  EXIT_CODE=1
fi

# Performance baseline
echo "Testing response times..."
RESPONSE_TIME=$(curl -o /dev/null -s -w '%{time_total}' $DARK_URL/api/franchises)
if (( $(echo "$RESPONSE_TIME > 2.0" | bc -l) )); then
  echo "Response time too slow: ${RESPONSE_TIME}s"
  EXIT_CODE=1
fi

# Azure Service Bus connectivity
echo "Testing message queue connectivity..."
# Verify Azure Service Bus connection via health endpoint
SB_HEALTH=$(curl -s $DARK_URL/health | jq -r '.checks[] | select(.name=="ServiceBus") | .status')
if [ "$SB_HEALTH" != "Healthy" ]; then
  echo "Service Bus connectivity failed"
  EXIT_CODE=1
fi

echo "=== Integration Tests Complete ==="
exit $EXIT_CODE
```

**Test execution in pipeline:**
```yaml
- task: Bash@3
  displayName: 'Run Integration Tests'
  inputs:
    filePath: 'scripts/integration-test-suite.sh'
    failOnStderr: true
  env:
    DARK_NAMESPACE: $(DARK_NAMESPACE)
```

## Manual Deployment Workflow

For manual deployments outside of pipelines:

### 1. Identify Active Environment

```bash
# Check which namespace is currently active
kubectl get ingressroute api-live -o jsonpath='{.spec.routes[0].services[0].namespace}'
```

### 2. Deploy to Inactive (Dark) Environment

```bash
# If blue is active, deploy to green
kubectl apply -k app/overlays/production-green
```

**Kustomize overlay for production-green:**
```yaml
# app/overlays/production-green/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: production-green

resources:
  - ../../base/apps/api
  - ../../base/apps/producer
  - ../../base/apps/provider
  # ... other services

images:
  - name: sportdeets.azurecr.io/sportsdataapi
    newTag: "2281"  # ← New image tag
  - name: sportdeets.azurecr.io/sportsdataproducer
    newTag: "1350"
  # ... other images

configMapGenerator:
  - name: app-config
    namespace: production-green
    env: config-green.env
```

### 3. Validate Dark Environment

```bash
# Port-forward to dark environment for testing
kubectl port-forward -n production-green svc/api-service 8080:8080

# Run smoke tests against localhost:8080
curl http://localhost:8080/health
curl http://localhost:8080/api/franchises/lsu-tigers

# Check pod status
kubectl get pods -n production-green

# Check logs for errors
kubectl logs -n production-green -l app=api-all --tail=100
```

**Validation Checklist:**
- [ ] All pods running and healthy
- [ ] Health endpoints responding
- [ ] Database connectivity verified
- [ ] External API integrations working
- [ ] No errors in logs
- [ ] Metrics reporting to Prometheus

### 4. Traffic Flip

**Update IngressRoute to point to validated environment:**

```bash
# Assuming green is validated and ready
kubectl patch ingressroute api-live -n monitoring --type='json' \
  -p='[{"op": "replace", "path": "/spec/routes/0/services/0/namespace", "value": "production-green"}]'
```

**Or via GitOps (recommended):**
Update IngressRoute manifest in git:
```yaml
# sports-data-config/app/base/traefik/api-ingressroute.yaml
services:
- name: api-service
  namespace: production-green  # ← Update this
  port: 8080
```

Commit and push - Flux applies automatically.

### 5. Monitor New Active Environment

```bash
# Watch pod status
kubectl get pods -n production-green -w

# Monitor logs for errors
kubectl logs -n production-green -l app=api-all -f

# Check metrics in Grafana
# https://admin.sportdeets.com/grafana
```

**Monitoring Checklist:**
- [ ] Traffic flowing to new environment (check Traefik dashboard)
- [ ] No 5xx errors in logs
- [ ] Response times normal
- [ ] No alerts firing in AlertManager
- [ ] Database queries performing normally

### 6. Rollback (If Needed)

**Instant rollback by reverting IngressRoute:**

```bash
# Switch back to previous environment
kubectl patch ingressroute api-live -n monitoring --type='json' \
  -p='[{"op": "replace", "path": "/spec/routes/0/services/0/namespace", "value": "production-blue"}]'
```

Traffic immediately routes back to blue environment. No rebuild/redeploy needed.

### 7. Cleanup Old Environment

**After successful validation (24-48 hours):**

```bash
# Scale down old environment to save resources
kubectl scale deployment --all --replicas=0 -n production-blue

# Or delete entirely if confident
kubectl delete all --all -n production-blue
```

## Configuration Management

### Namespace-Specific Configs

**Shared configs via base ConfigMaps:**
```yaml
# app/base/configmaps/app-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  ASPNETCORE_ENVIRONMENT: "Production"
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://tempo.monitoring.svc.cluster.local:4317"
```

**Namespace-specific overrides:**
```yaml
# app/overlays/production-blue/config-blue.env
DB_CONNECTION_STRING=Host=sdprod-psql;Database=sportdeets_prod;

# app/overlays/production-green/config-green.env
DB_CONNECTION_STRING=Host=sdprod-psql;Database=sportdeets_prod;
```

### Secrets

**Secrets must exist in both namespaces:**

```bash
# Copy secrets from active to inactive namespace
kubectl get secret azure-app-config -n production-blue -o yaml | \
  sed 's/namespace: production-blue/namespace: production-green/' | \
  kubectl apply -f -

kubectl get secret azure-identity -n production-blue -o yaml | \
  sed 's/namespace: production-blue/namespace: production-green/' | \
  kubectl apply -f -

kubectl get secret acr-secret -n production-blue -o yaml | \
  sed 's/namespace: production-blue/namespace: production-green/' | \
  kubectl apply -f -
```

**Or use SealedSecrets/External Secrets Operator for GitOps:**
```yaml
# Base secret template - Flux creates in both namespaces
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: azure-app-config
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: azure-keyvault
    kind: SecretStore
  target:
    name: azure-app-config
  data:
  - secretKey: connectionstring
    remoteRef:
      key: AppConfigConnectionString
```

## Automation Considerations

### GitOps with Flux

**Directory structure:**
```
sports-data-config/
├── app/
│   ├── base/
│   │   └── apps/
│   │       ├── api/
│   │       ├── producer/
│   │       └── provider/
│   └── overlays/
│       ├── production-blue/
│       │   ├── kustomization.yaml
│       │   └── config-blue.env
│       └── production-green/
│           ├── kustomization.yaml
│           └── config-green.env
└── clusters/
    └── home/
        └── production-routing.yaml  # IngressRoute pointing to active
```

**Deployment process:**
1. Update image tags in inactive overlay kustomization
2. Commit and push to git
3. Flux automatically applies to inactive namespace
4. Validate dark environment
5. Update IngressRoute in git to point to new active
6. Commit and push - Flux applies traffic flip

### CI/CD Pipeline Integration

**Azure DevOps pipeline additions:**

```yaml
# After building and pushing images
stages:
- stage: DeployToDark
  jobs:
  - job: IdentifyDarkEnvironment
    steps:
    - bash: |
        ACTIVE=$(kubectl get ingressroute api-live -o jsonpath='{.spec.routes[0].services[0].namespace}')
        if [ "$ACTIVE" == "production-blue" ]; then
          echo "##vso[task.setvariable variable=DARK_ENV;isOutput=true]production-green"
        else
          echo "##vso[task.setvariable variable=DARK_ENV;isOutput=true]production-blue"
        fi
      name: setDarkEnv

  - job: UpdateKustomize
    dependsOn: IdentifyDarkEnvironment
    variables:
      DARK_ENV: $[ dependencies.IdentifyDarkEnvironment.outputs['setDarkEnv.DARK_ENV'] ]
    steps:
    - bash: |
        cd sports-data-config/app/overlays/$(DARK_ENV)
        kustomize edit set image sportdeets.azurecr.io/sportsdataapi:$(Build.BuildId)
        git commit -am "Deploy build $(Build.BuildId) to $(DARK_ENV)"
        git push

- stage: ManualValidation
  jobs:
  - job: waitForValidation
    pool: server
    timeoutInMinutes: 1440  # 24 hours
    steps:
    - task: ManualValidation@0
      inputs:
        notifyUsers: 'admin@sportdeets.com'
        instructions: 'Validate dark environment before flipping traffic'

- stage: FlipTraffic
  dependsOn: ManualValidation
  jobs:
  - job: UpdateIngressRoute
    steps:
    # Update IngressRoute and commit to git for Flux
```

## Pros, Cons, and Concerns

### Pros

**Resource Efficiency:**
- ✅ Only consume double resources during deployment window (hours/days vs. 24/7)
- ✅ ~30-40GB baseline, ~60-80GB peak vs. ~60-80GB constant with always-on blue/green
- ✅ Saves ~30-40GB RAM continuously for other workloads

**Safety & Validation:**
- ✅ Automated integration tests gate manual validation
- ✅ Extended validation period (hours to days) before production exposure
- ✅ 24-hour rollback window with old environment still running
- ✅ Instant rollback during 24h window (just flip IngressRoute)

**Operational Flexibility:**
- ✅ Can pause validation indefinitely if issues found
- ✅ No pressure to flip traffic quickly
- ✅ Can run load tests, security scans, manual QA against dark
- ✅ Pipeline-driven = repeatable, auditable

**Cost Optimization:**
- ✅ Your 4-node cluster handles this easily without upgrades
- ✅ No cloud costs for additional infrastructure

### Cons

**Deployment Speed:**
- ❌ **Scale-up delay**: 2-5 minutes for pods to start vs. instant with always-on
- ❌ Not true "instant" rollback if old environment already scaled to 0
- ❌ Database connection pool warmup time during scale-up

**Complexity:**
- ❌ **Three separate pipelines** to coordinate vs. single deployment
- ❌ State tracking: which namespace is active/dark
- ❌ Manual approval steps = potential bottleneck
- ❌ More failure points (scale-up, tests, flip, scale-down)

**Testing Limitations:**
- ❌ **Integration tests != production load**
  - Tests pass but production might reveal issues
  - Can't test real user traffic patterns
  - Load testing in dark is synthetic

**Resource Coordination:**
- ❌ Both namespaces need secrets/configmaps synchronized
- ❌ Database schema must work with both versions during overlap
- ❌ Can't test truly breaking database changes safely

### Concerns

#### 1. Database Migration Handling

**Problem:** Shared database between blue/green during validation window

**Scenarios:**
- **Breaking schema change**: New version expects column that doesn't exist yet
  - Dark fails because migration not run
  - Or migration runs, old version breaks
- **Data migration**: Need to backfill data for new feature
  - When does migration run? Before or after flip?

**Mitigation:**
- Use expand-contract pattern religiously
- Run migrations BEFORE deploying to dark
- Test migrations against database copy first
- Consider read-only replicas for dark environment testing

#### 2. Integration Test Coverage Gaps

**Problem:** Tests pass but production fails

**Scenarios:**
- External API rate limits hit in production but not tests
- Database connection pool exhaustion under real load
- Memory leaks only visible after hours of uptime
- Race conditions in high-concurrency scenarios

**Mitigation:**
- Include realistic load testing in validation
- Monitor dark environment for 1-2 hours minimum before flip
- Capture production traffic replay for testing
- Set up synthetic monitoring against dark

#### 3. Rollback After Scale-Down

**Problem:** After 24h, old environment scaled to 0

**If issues discovered:**
- Need to scale up old environment (2-5 min delay)
- Image might be purged from node cache (pull time)
- Database state has diverged for 24+ hours
- Can't truly "roll back" - would be deploying old code to new data

**Mitigation:**
- **Don't auto-scale down** - make it manual approval
- Keep old environment at 1 replica instead of 0 (minimal cost)
- Have explicit "go/no-go" decision at 24h mark
- Document point-of-no-return clearly

#### 4. Pod Scheduling During Scale-Up

**Problem:** What if nodes can't schedule all dark pods?

**Scenarios:**
- Another workload consuming resources
- Node affinity/anti-affinity rules preventing placement
- PVC binding delays
- Image pull failures

**Mitigation:**
- Pre-pull images to nodes before scale-up
- Set resource requests conservatively
- Monitor node capacity before deployment
- Have timeout/failure handling in pipeline

#### 5. Long-Running Requests During Flip

**Problem:** Traffic flip is instant, but requests in-flight

**Scenarios:**
- Long-running API request to old environment when flip occurs
- WebSocket connections broken
- Database transactions in-flight

**Impact:**
- Some requests fail during flip
- Not truly zero-downtime

**Mitigation:**
- Flip during low-traffic window
- Implement graceful shutdown (30s drain period)
- Use connection draining in Traefik
- Accept brief blip (still better than full outage)

#### 6. Secret/ConfigMap Synchronization

**Problem:** Secrets/ConfigMaps must exist in both namespaces

**Scenarios:**
- Secret rotated in active, forgot to update dark
- ConfigMap changed, dark environment has stale config
- Dark pods fail to start due to missing secrets

**Mitigation:**
- Use External Secrets Operator (syncs from Key Vault to both namespaces)
- Pipeline step to copy secrets before scale-up
- Validation step checking secret existence
- Use shared ConfigMaps where possible

#### 7. Monitoring Blind Spots

**Problem:** How do you monitor dark environment health?

**Scenarios:**
- Prometheus scraping dark pods but separate from active metrics
- Alerts configured for active namespace only
- Grafana dashboards don't show dark environment
- Can't compare active vs. dark easily

**Mitigation:**
- Add namespace label to all metrics
- Create "deployment validation" dashboard
- Configure alerts for dark environment too
- Use canary analysis tools (Flagger, Argo Rollouts)

#### 8. Network Policy Isolation

**Problem:** Network policies might block cross-namespace traffic

**Scenarios:**
- Dark environment can't reach shared services
- Integration tests fail due to network policy
- Service mesh mTLS issues between namespaces

**Mitigation:**
- Document required network policies
- Test connectivity as part of scale-up validation
- Use same service mesh configuration in both namespaces

### Critical Risks

#### ⚠️ Risk 1: Database Divergence Window

**After 24h scale-down, you can't truly roll back**

Timeline:
- **T+0**: Flip to green
- **T+24h**: Scale down blue
- **T+48h**: Issue discovered in green
- **Roll back?**: Blue code is 48h out of sync with database state

**Options if this happens:**
1. **Fix forward** - patch green with hotfix (preferred)
2. **Scale up blue + manual data reconciliation** (dangerous)
3. **Database point-in-time restore** (data loss)

**Recommendation:** Make 24h window a "go/no-go" decision point, not automatic.

#### ⚠️ Risk 2: Integration Test False Positives

**Tests pass but production has different behavior**

**Real-world examples:**
- Tests use mock data, production has edge cases
- Tests hit subset of code paths
- Load characteristics completely different
- External API behaves differently under production load

**Recommendation:** 
- Run dark environment for minimum 2-4 hours with synthetic load
- Use production traffic replay tools
- Monitor error rates, latency p95/p99
- Have explicit checklist beyond just "tests passed"

#### ⚠️ Risk 3: Pipeline Orchestration Complexity

**Three pipelines with dependencies and state**

**What could go wrong:**
- Pipeline 1 fails halfway (dark scaled up but tests didn't run)
- Pipeline 2 triggered when dark isn't ready
- Pipeline 3 runs too early (flip wasn't stable)
- State confusion (which is active?)

**Recommendation:**
- Use pipeline run IDs to track state
- Store active/dark state in ConfigMap or Azure DevOps variable
- Implement pipeline gates/checks
- Make each pipeline idempotent

### Recommendations

**1. Start Simple, Add Complexity:**
- Begin with manual blue/green (no auto scale-down)
- Add automated testing once workflow proven
- Add auto scale-down only when confident

**2. Validation Checklist:**
```
Before flip:
[ ] All integration tests passed
[ ] Dark environment running for 2+ hours
[ ] No errors in logs
[ ] Database connectivity verified
[ ] Metrics look normal (CPU, memory, latency)
[ ] Load test completed successfully
[ ] Manual smoke test completed
```

**3. Go/No-Go at 24h:**
```
After flip:
[ ] No critical alerts in 24h
[ ] Error rate < baseline
[ ] Latency p99 < baseline
[ ] No customer complaints
[ ] Database queries performing normally
→ Approve scale-down of old environment
```

**4. Keep 1 Replica Instead of 0:**
- Faster rollback if needed (1→2 vs 0→2)
- Minimal resource cost (1-2GB per service)
- Pods stay "warm" with connections established

**5. Consider Argo Rollouts First:**
- Simpler than namespace-based blue/green
- Automated canary with traffic shifting
- Built-in analysis and rollback
- Less database complexity
- Try this before building 3-pipeline system

### Final Verdict

**Your approach is solid for your use case, with caveats:**

✅ **Do this if:**
- You need extended manual validation (hours/days)
- You want complete environment isolation
- You're comfortable with pipeline complexity
- You have strong migration discipline

⚠️ **Consider Argo Rollouts instead if:**
- You want faster, automated deployments
- You prefer simpler architecture
- You're okay with progressive rollout (not dark environment)
- You want less operational overhead

**Hybrid approach:**
- Use Argo Rollouts for normal deployments (80% of releases)
- Use blue/green for risky deployments (major migrations, .NET upgrades, etc.)

## Alternative: Argo Rollouts (Canary Deployment)

**Simpler alternative avoiding database complexity:**

### What is Argo Rollouts?

Progressive delivery controller for Kubernetes that provides:
- **Canary deployments**: Gradually shift traffic (10% → 25% → 50% → 100%)
- **Automatic rollback**: Detect errors and revert automatically
- **Analysis-driven progression**: Use metrics to determine deployment health
- **Blue/green support**: Built-in blue/green strategy

### Why Argo Rollouts Instead?

**Advantages over namespace-based blue/green:**
- Single namespace - no database complexity
- Single database - no sync issues
- Automated progressive rollout
- Automatic rollback on errors
- Easier to implement
- Native Prometheus integration

**Example Rollout:**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: api-rollout
  namespace: production
spec:
  replicas: 3
  strategy:
    canary:
      steps:
      - setWeight: 20       # 20% traffic to new version
      - pause: {duration: 5m}
      - setWeight: 40
      - pause: {duration: 5m}
      - setWeight: 60
      - pause: {duration: 5m}
      - setWeight: 80
      - pause: {duration: 5m}
      analysis:
        templates:
        - templateName: success-rate
        startingStep: 2
        args:
        - name: service-name
          value: api-service
  template:
    spec:
      containers:
      - name: api
        image: sportdeets.azurecr.io/sportsdataapi:latest
```

**Analysis Template (auto-rollback on errors):**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate
spec:
  args:
  - name: service-name
  metrics:
  - name: success-rate
    interval: 1m
    successCondition: result >= 0.95  # 95% success rate required
    failureLimit: 3
    provider:
      prometheus:
        address: http://kube-prometheus-stack-kps-prometheus.monitoring:9090
        query: |
          sum(rate(http_requests_total{service="{{args.service-name}}",status!~"5.."}[5m]))
          /
          sum(rate(http_requests_total{service="{{args.service-name}}"}[5m]))
```

**Installation:**

```bash
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml
```

## Recommendation

### Start with Argo Rollouts (Canary)

**For initial implementation:**
1. Install Argo Rollouts
2. Convert Deployments to Rollouts
3. Configure progressive canary strategy
4. Set up Prometheus-based analysis
5. Enable automatic rollback

**Reasons:**
- Simpler than namespace-based blue/green
- No database complexity (shared DB works fine)
- Automated validation via metrics
- Automatic rollback reduces risk
- Easier to maintain

### Migrate to Blue/Green Later (If Needed)

**Consider namespace-based blue/green when:**
- Need to test breaking database migrations
- Require complete isolation between versions
- Want longer dark environment validation periods
- Database clone/sync strategies are well-established

## References

- [Traefik IngressRoute Documentation](https://doc.traefik.io/traefik/routing/providers/kubernetes-crd/)
- [Argo Rollouts Documentation](https://argoproj.github.io/argo-rollouts/)
- [Kustomize Overlays](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/#bases-and-overlays)
- [Blue/Green Deployment Pattern](https://martinfowler.com/bliki/BlueGreenDeployment.html)
- [Expand-Contract Pattern for Databases](https://www.tim-wellhausen.de/papers/ExpandAndContract.pdf)

## Next Steps

1. **Decide on approach**: Argo Rollouts (canary) vs namespace-based blue/green
2. **Create proof-of-concept**: Test with one service (API)
3. **Define validation criteria**: What metrics determine deployment success?
4. **Establish rollback procedures**: Document manual and automatic rollback
5. **Integrate with CI/CD**: Automate deployment to dark environment
6. **Monitor and iterate**: Refine strategy based on real-world experience

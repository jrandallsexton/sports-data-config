# Traefik Setup and Troubleshooting Notes

## Date
November 12, 2025

## Overview
Successfully deployed Traefik v24.0.0 to k3s cluster via Flux GitOps and exposed the dashboard through an IngressRoute.

## Issues Encountered and Solutions

### 1. Flux API Version Incompatibility

**Problem:**
- HelmRelease using deprecated `helm.toolkit.fluxcd.io/v2beta1` API version
- HelmRepository using deprecated `source.toolkit.fluxcd.io/v1beta2` API version
- Flux v2.7.2 only supports `v2` and `v1` respectively
- Resources were silently ignored by controllers (no error messages)

**Solution:**
```yaml
# Updated HelmRelease API version
apiVersion: helm.toolkit.fluxcd.io/v2  # was v2beta1

# Updated HelmRepository API version
apiVersion: source.toolkit.fluxcd.io/v1  # was v1beta2
```

**Files Modified:**
- `app/base/traefik/helmrelease.yaml`
- `clusters/home/flux-system/traefik-helmrepository.yaml`

---

### 2. Traefik API/Dashboard Not Enabled

**Problem:**
- Dashboard configuration via `dashboard: enabled: true` in Helm values wasn't working
- The Traefik API was returning 404 for `/api/*` and `/dashboard/*` endpoints
- Helm chart's `api` configuration wasn't translating to command-line arguments

**Root Cause:**
The Traefik Helm chart requires explicit enabling of the API via command-line arguments, not just Helm values.

**Solution:**
Used `additionalArguments` to pass the flag directly to Traefik:

```yaml
values:
  additionalArguments:
    - "--api.insecure=true"  # Enables API and dashboard without TLS
```

**Note:** The `insecure` flag is acceptable for local development but should be replaced with proper authentication for production.

---

### 3. Port 80 Conflict with IIS

**Problem:**
- IIS running on Hyper-V host was intercepting port 80 traffic
- Default Traefik configuration uses port 80 for the `web` entrypoint

**Solution:**
Configured custom ports for Traefik entrypoints:

```yaml
ports:
  web:
    port: 8080
    expose: true
    exposedPort: 8080
    protocol: TCP
  websecure:
    port: 8443
    expose: true
    exposedPort: 8443
    protocol: TCP
  traefik:
    expose: false  # Don't expose API port externally
    port: 9000
    protocol: TCP
```

---

### 4. IngressRoute Not Appearing in Cluster

**Problem:**
- `kubectl get ingressroute -n kube-system` returned no resources
- IngressRoute was defined and in kustomization but not applied

**Root Cause:**
kubectl context configuration was missing - `contexts: []` was empty in kubeconfig.

**Solution:**
```powershell
kubectl config set-context default --cluster=default --user=default
```

---

### 5. IngressRoute Host Restriction Preventing IP Access

**Problem:**
- Dashboard accessible via hostname (`traefik.localhost:8080/dashboard/`) but not IP
- Browser showing 404 when accessing via `http://192.168.0.112:8080/dashboard/`

**Root Cause:**
IngressRoute rule required specific hostname match:
```yaml
match: Host(`traefik.localhost`) && (PathPrefix(`/dashboard`) || PathPrefix(`/api`))
```

**Solution:**
Removed host restriction for local development:

```yaml
routes:
  - match: PathPrefix(`/dashboard`) || PathPrefix(`/api`)
    kind: Rule
    services:
      - name: api@internal
        kind: TraefikService
```

---

## Final Working Configuration

### HelmRelease (`app/base/traefik/helmrelease.yaml`)

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: traefik
  namespace: kube-system
spec:
  interval: 5m
  chart:
    spec:
      chart: traefik
      version: 24.0.0
      sourceRef:
        kind: HelmRepository
        name: traefik
        namespace: flux-system
  values:
    additionalArguments:
      - "--api.insecure=true"
    ports:
      web:
        port: 8080
        expose: true
        exposedPort: 8080
        protocol: TCP
      websecure:
        port: 8443
        expose: true
        exposedPort: 8443
        protocol: TCP
      traefik:
        expose: false
        port: 9000
        protocol: TCP
    ingressRoute:
      dashboard:
        enabled: false  # Using custom IngressRoute
```

### IngressRoute (`app/base/traefik/traefik-dashboard-ingressroute.yaml`)

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: traefik-dashboard
  namespace: kube-system
spec:
  entryPoints:
    - web
  routes:
    - match: PathPrefix(`/dashboard`) || PathPrefix(`/api`)
      kind: Rule
      services:
        - name: api@internal
          kind: TraefikService
```

### HelmRepository (`clusters/home/flux-system/traefik-helmrepository.yaml`)

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: traefik
  namespace: flux-system
spec:
  interval: 1h
  url: https://traefik.github.io/charts
```

---

## Access URLs

- **Via IP:** `http://192.168.0.112:8080/dashboard/`
- **Via Hostname:** `http://traefik.localhost:8080/dashboard/`

**Note:** Trailing slash (`/`) is required!

---

## Verification Commands

```powershell
# Check HelmRelease status
flux get helmreleases -n kube-system

# Check IngressRoute (use full CRD name)
kubectl get ingressroutes.traefik.io -n kube-system

# Check Traefik service and ports
kubectl get svc -n kube-system traefik

# View Traefik pod arguments
kubectl get deployment traefik -n kube-system -o jsonpath='{.spec.template.spec.containers[0].args}'

# Test API from inside pod
kubectl exec -n kube-system <traefik-pod-name> -- wget -qO- http://localhost:9000/api/overview

# Trigger Flux reconciliation
flux reconcile kustomization flux-system --with-source
```

---

## Lessons Learned

1. **Always check API versions** when upgrading Flux - deprecated APIs are silently ignored
2. **Traefik Helm chart quirks** - Some configuration requires `additionalArguments` instead of values
3. **kubectl context issues** - Empty contexts array in kubeconfig causes cryptic errors
4. **IngressRoute CRD name** - Must use full name `ingressroutes.traefik.io` for some kubectl commands
5. **Host header matching** - IngressRoute rules with `Host()` won't match IP-based requests

---

## Security Notes

⚠️ **Current configuration uses `--api.insecure=true` which is NOT production-ready**

For production deployment, consider:
- Remove `--api.insecure=true`
- Add BasicAuth middleware (see `app/base/traefik/dashboard-basicauth.yaml` example)
- Use TLS with proper certificates
- Restrict IngressRoute to specific hosts
- Limit dashboard access to internal networks only

---

## Next Steps

- [ ] Add authentication to dashboard
- [ ] Configure TLS certificates
- [ ] Set up additional IngressRoutes for applications
- [ ] Configure middlewares (rate limiting, headers, etc.)
- [ ] Set up monitoring/metrics collection

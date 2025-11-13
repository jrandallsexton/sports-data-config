# Reloader Usage Guide

Reloader automatically restarts pods when their ConfigMaps or Secrets change.

## How to Use

Add annotations to your Deployments/StatefulSets to enable auto-reload:

### Option 1: Auto-detect (Recommended)

Automatically watches ALL ConfigMaps and Secrets referenced by the pod:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  annotations:
    reloader.stakater.com/auto: "true"
spec:
  template:
    spec:
      containers:
        - name: my-app
          envFrom:
            - configMapRef:
                name: app-config
            - secretRef:
                name: app-secrets
```

### Option 2: Specific ConfigMaps

Only reload when specific ConfigMaps change:

```yaml
metadata:
  annotations:
    configmap.reloader.stakater.com/reload: "app-config,shared-config"
```

### Option 3: Specific Secrets

Only reload when specific Secrets change:

```yaml
metadata:
  annotations:
    secret.reloader.stakater.com/reload: "db-credentials,api-keys"
```

### Option 4: Mix and Match

```yaml
metadata:
  annotations:
    configmap.reloader.stakater.com/reload: "app-config"
    secret.reloader.stakater.com/reload: "app-secrets"
```

## Example: Update Config and See Auto-Reload

```powershell
# Edit a ConfigMap
kubectl edit configmap app-config -n my-namespace

# Watch pods restart automatically
kubectl get pods -n my-namespace -w
```

Reloader will:
1. Detect the ConfigMap change
2. Update the Deployment's pod template annotation
3. Trigger a rolling restart of pods
4. New pods start with updated configuration

## When to Use

✅ **Use auto-reload for:**
- Application configuration (feature flags, URLs, timeouts)
- Non-critical secrets (API keys for external services)
- ConfigMaps that change frequently during development

❌ **Don't use auto-reload for:**
- Database credentials in production (manual verification recommended)
- Critical infrastructure changes (review before restart)
- Deployments where zero downtime is critical (use manual blue/green instead)

## Monitoring

Reloader includes a ServiceMonitor for Prometheus. Check metrics in Grafana:
- `reloader_reload_executed_total` - Total reloads triggered
- `reloader_reload_executed_duration_seconds` - Time to execute reload

## Configuration

Reloader is configured to:
- **watchGlobally: true** - Watches all namespaces
- **Resources:** 10m CPU / 32Mi RAM (request), 100m CPU / 128Mi RAM (limit)
- **Replicas:** 1 (single controller is sufficient)

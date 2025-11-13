# Cluster Configuration

This file contains environment-specific values that should be customized when forking this repository for a new cluster.

## Quick Start

1. Copy one of the overlay directories (e.g., `00_local_kind`) as a starting point
2. Update the values in `configmap-cluster.yaml` for your environment
3. Update any patches in the overlay to reference your specific IPs/domains

## Configuration Values

### Traefik LoadBalancer
- **TRAEFIK_IP**: The IP address where Traefik is accessible (MetalLB/LoadBalancer IP)
- **TRAEFIK_PORT**: The HTTP port for Traefik (default: 8080)
- **TRAEFIK_BASE_URL**: Full base URL for accessing services through Traefik

### External Services
- **EXTERNAL_SERVICE_IP**: IP address for external endpoints (if using LoadBalancer services for your apps)

## Files That Need Customization

When forking this repo, search for and update these IPs in:

1. `app/base/monitoring/prometheus/configmap.yaml`
   - Grafana domain, root_url
   - Prometheus externalUrl
   - Alertmanager externalUrl

2. `app/base/apps/*/` services (if using external IPs)
   - LoadBalancer externalIPs configurations

## Using Overlays

Each overlay directory can patch the base configurations:

```yaml
# Example: overlays/my-env/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base

patches:
  - target:
      kind: ConfigMap
      name: prometheus-values
    patch: |-
      - op: replace
        path: /data/values.yaml
        value: |
          grafana:
            grafana.ini:
              server:
                domain: my-domain.com
                root_url: https://my-domain.com/grafana/
```

## TODO: Future Improvements

- Consider using external-secrets-operator for sensitive values
- Implement proper multi-tenancy with namespace isolation
- Add validation to ensure all IPs are updated before deployment

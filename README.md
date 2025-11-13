# sports-data-config

Kubernetes infrastructure configuration using GitOps with Flux.

## Overview

This repository contains a complete Kubernetes cluster setup including:

- **GitOps**: Flux for continuous deployment
- **Ingress**: Traefik with dashboard
- **Monitoring**: Prometheus, Grafana, Alertmanager
- **Logging**: Loki with Promtail
- **Tracing**: Tempo for distributed tracing
- **Application Deployments**: Kustomize overlays for different environments

## Quick Start

### Prerequisites

- Kubernetes cluster (k3s, kind, etc.)
- `flux` CLI installed
- `kubectl` configured

### Initial Deployment

1. **Fork this repository** for your own cluster

2. **Configure environment-specific values**
   - See [docs/environment-setup.md](docs/environment-setup.md) for IP addresses and URLs to update

3. **Bootstrap Flux**
   ```powershell
   flux bootstrap github `
     --owner=YOUR-GITHUB-USERNAME `
     --repository=YOUR-REPO-NAME `
     --branch=main `
     --path=clusters/home `
     --personal
   ```

4. **Verify deployment**
   ```powershell
   flux get all -A
   kubectl get pods -A
   ```

### Accessing Services

After deployment (replace `192.168.0.112:8080` with your Traefik IP):

- **Traefik Dashboard**: http://192.168.0.112:8080/dashboard/
- **Grafana**: http://192.168.0.112:8080/grafana/ (admin/admin)
- **Prometheus**: http://192.168.0.112:8080/prometheus/
- **Alertmanager**: http://192.168.0.112:8080/alertmanager/

## Repository Structure

```
├── app/
│   ├── base/              # Base Kubernetes manifests
│   │   ├── apps/          # Application deployments
│   │   ├── monitoring/    # Prometheus, Grafana, Tempo
│   │   ├── logging/       # Loki, Promtail
│   │   ├── traefik/       # Ingress controller
│   │   └── configmaps/    # Shared configurations
│   └── overlays/          # Environment-specific patches
│       ├── 00_local/
│       ├── 00_local_kind/
│       ├── 01_localDev/
│       ├── 02_dev/
│       ├── 03_qa/
│       └── 04_prod/
├── clusters/
│   └── home/
│       └── flux-system/   # Flux configuration
├── bootstrap/             # Bootstrap scripts
└── docs/                  # Documentation

```

## Configuration

See [docs/environment-setup.md](docs/environment-setup.md) for detailed configuration instructions when forking this repository.

## Documentation

- [Environment Setup](docs/environment-setup.md) - Configure for your environment
- [Traefik Setup Notes](docs/traefik-setup-notes.md) - Traefik configuration and troubleshooting
- [Configuration Guide](CONFIGURATION.md) - Advanced configuration options

## Stack Components

### Infrastructure
- **Flux v2.7.2**: GitOps controller
- **Traefik v24.0.0**: Ingress controller and API gateway

### Observability
- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and dashboards
- **Loki**: Log aggregation
- **Promtail**: Log collection agent
- **Tempo**: Distributed tracing
- **Alertmanager**: Alert routing and management

## License

MIT


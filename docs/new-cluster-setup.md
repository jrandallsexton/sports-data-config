# New NUC Cluster Setup

## Hardware Specs
- **5x wo-we Mini PC P8**
  - AMD Ryzen 5 7640HS (6c/12t, 5.0GHz boost)
  - 32GB DDR5 5600MHz
  - 1TB PCIe 4.0 SSD (+ spare M.2 slot)
  - Dual 2.5G Ethernet

## Network Configuration

### IP Allocation
- **k8s nodes:**
  - 192.168.0.200 - sdprod-k8s-00 (control plane)
  - 192.168.0.201 - sdprod-k8s-01 (worker)
  - 192.168.0.202 - sdprod-k8s-02 (worker)
  - 192.168.0.203 - sdprod-k8s-03 (worker)
- **PostgreSQL:**
  - 192.168.0.250 - sdprod-data-0

### Static IP Configuration (All Nodes)
File: `/etc/netplan/50-cloud-init.yaml`

```yaml
network:
  version: 2
  ethernets:
    eno1:
      addresses:
        - 192.168.0.XXX/24  # Replace XXX with node IP
      routes:
        - to: default
          via: 192.168.0.1
      nameservers:
        addresses:
          - 192.168.0.1
          - 1.1.1.1
```

Apply with:
```bash
sudo netplan apply
```

---

## k3s Installation

### 1. Install k3s Control Plane (192.168.0.200)

SSH into sdprod-k8s-00:
```bash
ssh username@192.168.0.200
```

Install k3s:
```bash
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--write-kubeconfig-mode 644" sh -
```

Wait for k3s to be ready:
```bash
sudo systemctl status k3s
kubectl get nodes
```

Get the node token for workers:
```bash
sudo cat /var/lib/rancher/k3s/server/node-token
```

Copy the token - you'll need it for worker nodes.

### 2. Join Worker Nodes (192.168.0.201-203)

SSH into each worker node and run:
```bash
curl -sfL https://get.k3s.io | K3S_URL="https://192.168.0.200:6443" K3S_TOKEN="<paste-token-here>" sh -
```

Verify node joined (from control plane):
```bash
kubectl get nodes
```

Repeat for all 3 worker nodes.

### 3. Configure kubectl on Workstation

From control plane, copy kubeconfig:
```bash
sudo cat /etc/rancher/k3s/k3s.yaml
```

On your Windows workstation (PowerShell):
```powershell
# Create .kube directory if it doesn't exist
mkdir ~\.kube -Force

# Copy kubeconfig (replace with actual content from above)
notepad ~\.kube\config-nuc
```

Paste the kubeconfig content and change `server: https://127.0.0.1:6443` to `server: https://192.168.0.200:6443`.

Set environment variable to use this config:
```powershell
$env:KUBECONFIG = "$HOME\.kube\config-nuc"
kubectl get nodes
```

Or merge with existing config.

---

## Next Steps
- [ ] Install Flux GitOps
- [ ] Deploy infrastructure namespace (monitoring, logging, RabbitMQ)
- [ ] Set up blue/green namespaces
- [ ] Configure Traefik IngressRoutes
- [ ] Migrate PostgreSQL data
- [ ] Update Front Door origin to new cluster

---

## Architecture Notes

### Blue/Green Deployment Strategy
- **blue** namespace: Active production
- **green** namespace: Staged deployment (dark)
- Traffic switched via IngressRoute updates
- Both point to single PostgreSQL instance (migrations must be backward-compatible)

### Namespace Structure
```
blue/              # All services (active prod)
green/             # All services (dark/staged)
infrastructure/    # RabbitMQ, monitoring, logging (shared)
```

### Resource Management for Dark Environment
Use ResourceQuotas to limit "dark" namespace:
```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: green-quota
  namespace: green
spec:
  hard:
    requests.cpu: "4"      # vs blue getting more
    requests.memory: 8Gi
    pods: "20"
```

Or scale down dark replicas (1 per service vs 3 in active).

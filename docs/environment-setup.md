# Environment-Specific Configuration Guide

When forking this repository to create a new cluster, update these values:

## 1. Traefik LoadBalancer IP

**File:** `app/base/monitoring/prometheus/configmap.yaml`

Current value: `192.168.0.112:8080`

Update these lines:
```yaml
domain: 192.168.0.112:8080              # Line ~16
root_url: http://192.168.0.112:8080/grafana/  # Line ~17
externalUrl: http://192.168.0.112:8080/prometheus/  # Line ~55
externalUrl: http://192.168.0.112:8080/alertmanager/  # Line ~63
```

Replace with your Traefik LoadBalancer IP and port.

## 2. External Service IPs (Optional)

**Files:** `app/base/apps/*/` service definitions

Current value: `192.168.0.3`

Only needed if you're using LoadBalancer services with external IPs for your applications.

Example files:
- `app/base/apps/api/api-service.yaml`
- `app/base/apps/season/season-service.yaml`
- etc.

Update the `externalIPs` sections if applicable to your setup.

## 3. Flux Git Repository

**File:** `clusters/home/flux-system/gotk-sync.yaml`

Update the repository URL to point to your forked repo:
```yaml
spec:
  url: https://github.com/YOUR-USERNAME/YOUR-REPO-NAME
```

## Quick Configuration Script

Use this PowerShell script to update IPs across the repo:

```powershell
# Update Traefik IP
$oldIP = "192.168.0.112"
$newIP = "YOUR.NEW.IP.HERE"

# Update monitoring configs
(Get-Content app/base/monitoring/prometheus/configmap.yaml) -replace $oldIP, $newIP | 
    Set-Content app/base/monitoring/prometheus/configmap.yaml

# Update app service IPs if needed
$oldAppIP = "192.168.0.3"
$newAppIP = "YOUR.APP.IP.HERE"

Get-ChildItem app/base/apps -Recurse -Filter "*-service.yaml" | ForEach-Object {
    (Get-Content $_.FullName) -replace $oldAppIP, $newAppIP | Set-Content $_.FullName
}
```

## Verification Checklist

After updating, verify:
- [ ] Grafana accessible at http://YOUR-IP:8080/grafana/
- [ ] Prometheus accessible at http://YOUR-IP:8080/prometheus/
- [ ] Traefik dashboard at http://YOUR-IP:8080/dashboard/
- [ ] Flux reconciled: `flux get all -A`

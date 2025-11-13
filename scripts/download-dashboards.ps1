#!/usr/bin/env pwsh
# Download Grafana dashboards from grafana.com and create ConfigMaps

$dashboards = @(
    @{ id = 15757; revision = 44; name = "k8s-cluster"; title = "Kubernetes Cluster Overview" }
    @{ id = 1860; revision = 37; name = "node-exporter"; title = "Node Exporter Full" }
    @{ id = 17346; revision = 9; name = "traefik"; title = "Traefik Dashboard" }
    @{ id = 15760; revision = 27; name = "k8s-pods"; title = "Kubernetes Pods" }
    @{ id = 13639; revision = 2; name = "loki-logs"; title = "Loki Logs" }
)

$outputDir = "app/base/monitoring/grafana/dashboards"
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

foreach ($dashboard in $dashboards) {
    Write-Host "Downloading $($dashboard.title)..." -ForegroundColor Cyan
    $url = "https://grafana.com/api/dashboards/$($dashboard.id)/revisions/$($dashboard.revision)/download"
    $jsonFile = Join-Path $outputDir "$($dashboard.name).json"
    
    Invoke-WebRequest -Uri $url -OutFile $jsonFile
    Write-Host "  Saved to $jsonFile" -ForegroundColor Green
}

Write-Host "`nDashboards downloaded successfully!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Review the JSON files in $outputDir"
Write-Host "2. Run the create-dashboard-configmaps.ps1 script to create Kubernetes ConfigMaps"

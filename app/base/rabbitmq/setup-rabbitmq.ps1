#!/usr/bin/env pwsh
# Setup script for RabbitMQ on K3s cluster
# Reads configuration from _common-variables.ps1

param(
    [Parameter(Mandatory=$false)]
    [string]$SecretsPath = $env:SPORTDEETS_SECRETS_PATH
)

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "RabbitMQ Setup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Load secrets from _common-variables.ps1
if (-not $SecretsPath) {
    Write-Host "❌ SPORTDEETS_SECRETS_PATH environment variable not set" -ForegroundColor Red
    Write-Host "   Please set it to your secrets directory (e.g., D:\Dropbox\Code\sports-data-provision\_secrets)" -ForegroundColor Yellow
    exit 1
}

$commonVarsPath = Join-Path $SecretsPath "_common-variables.ps1"
if (-not (Test-Path $commonVarsPath)) {
    Write-Host "❌ Cannot find _common-variables.ps1 at: $commonVarsPath" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Loading configuration from: $commonVarsPath" -ForegroundColor Yellow
. $commonVarsPath

# Validate required variables
if (-not $script:rmqUsernameProd) {
    Write-Host "[WARN] `$rmqUsernameProd not set in _common-variables.ps1, using default: sportsdata" -ForegroundColor Yellow
    $script:rmqUsernameProd = "sportsdata"
}

if (-not $script:rmqPasswordProd) {
    Write-Host "❌ Missing `$rmqPasswordProd in _common-variables.ps1" -ForegroundColor Red
    Write-Host "   Add: `$rmqPasswordProd = 'your-secure-password'" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Configuration:" -ForegroundColor White
Write-Host "  Username: $($script:rmqUsernameProd)" -ForegroundColor Gray
Write-Host "  Password: ********" -ForegroundColor Gray
Write-Host ""

# Create Kubernetes secret for RabbitMQ admin credentials
Write-Host "[STEP 1/1] Creating Kubernetes secret for RabbitMQ admin..." -ForegroundColor Cyan
Write-Host ""

# Create namespace if it doesn't exist
kubectl get namespace messaging > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[INFO] Creating messaging namespace..." -ForegroundColor Yellow
    kubectl create namespace messaging
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to create namespace" -ForegroundColor Red
        exit 1
    }
}

kubectl create secret generic rabbitmq-admin `
    --from-literal=username=$script:rmqUsernameProd `
    --from-literal=password=$script:rmqPasswordProd `
    -n messaging `
    --dry-run=client -o yaml | kubectl apply -f -

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to create RabbitMQ admin secret" -ForegroundColor Red
    exit 1
}

Write-Host "✅ RabbitMQ admin secret created" -ForegroundColor Green
Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Commit RabbitMQ manifests to Git (without secret YAML)" -ForegroundColor Gray
Write-Host "  2. Push to trigger Flux deployment" -ForegroundColor Gray
Write-Host "  3. Monitor: flux get helmreleases -n messaging" -ForegroundColor Gray
Write-Host "  4. Verify cluster: kubectl get rabbitmqclusters -n messaging" -ForegroundColor Gray
Write-Host ""

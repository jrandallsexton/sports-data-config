#!/usr/bin/env pwsh
# Setup script for Umami Analytics on K3s cluster
# Reads configuration from _common-variables.ps1

param(
    [Parameter(Mandatory=$false)]
    [string]$SecretsPath = $env:SPORTDEETS_SECRETS_PATH
)

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Umami Analytics Setup" -ForegroundColor Cyan
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
if (-not $script:umamiDbHost) {
    Write-Host "❌ Missing `$umamiDbHost in _common-variables.ps1" -ForegroundColor Red
    Write-Host "   Add: `$umamiDbHost = 'your-postgres-host'" -ForegroundColor Yellow
    exit 1
}

if (-not $script:umamiDbPort) {
    Write-Host "[WARN] `$umamiDbPort not set, using default: 5432" -ForegroundColor Yellow
    $script:umamiDbPort = 5432
}

if (-not $script:umamiDbName) {
    Write-Host "[WARN] `$umamiDbName not set, using default: umami" -ForegroundColor Yellow
    $script:umamiDbName = "umami"
}

if (-not $script:umamiDbUser) {
    Write-Host "❌ Missing `$umamiDbUser in _common-variables.ps1" -ForegroundColor Red
    exit 1
}

if (-not $script:umamiDbPassword) {
    Write-Host "❌ Missing `$umamiDbPassword in _common-variables.ps1" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Configuration:" -ForegroundColor White
Write-Host "  Host: $($script:umamiDbHost)" -ForegroundColor Gray
Write-Host "  Port: $($script:umamiDbPort)" -ForegroundColor Gray
Write-Host "  Database: $($script:umamiDbName)" -ForegroundColor Gray
Write-Host "  User: $($script:umamiDbUser)" -ForegroundColor Gray
Write-Host ""

# Step 1: Create Kubernetes secret for database connection
Write-Host "[STEP 1/2] Creating Kubernetes secret for Umami database..." -ForegroundColor Cyan
Write-Host ""

$databaseUrl = "postgresql://$($script:umamiDbUser):$($script:umamiDbPassword)@$($script:umamiDbHost):$($script:umamiDbPort)/$($script:umamiDbName)"

kubectl create secret generic umami-db-secret `
    --from-literal=database-url=$databaseUrl `
    -n default `
    --dry-run=client -o yaml | kubectl apply -f -

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to create database secret" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Database secret created" -ForegroundColor Green

# Step 2: Create app secret
Write-Host ""
Write-Host "[STEP 2/2] Creating app secret..." -ForegroundColor Cyan

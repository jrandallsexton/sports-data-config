param(
    [string]$GitHubOwner = "jrandallsexton",
    [string]$Repo = "sports-data-config",
    [string]$Branch = "main",
    [string]$GitHubToken = $env:GITHUB_TOKEN
)

if (-not $GitHubToken) {
    Write-Error "You must set the GitHub token in the GITHUB_TOKEN environment variable."
    exit 1
}

Write-Host "Bootstrapping Flux into the cluster..." -ForegroundColor Cyan

flux bootstrap github `
  --owner=$GitHubOwner `
  --repository=$Repo `
  --branch=$Branch `
  --path="clusters/home" `
  --personal `
  --token-auth

Write-Host "✅ Flux bootstrap complete." -ForegroundColor Green

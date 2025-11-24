# Umami Analytics

Web analytics platform for SportDeets.

## Setup

### 1. Add Umami Configuration to _common-variables.ps1

In your secrets file (e.g., `D:\Dropbox\Code\sports-data-provision\_secrets\_common-variables.ps1`), add:

```powershell
# Umami Analytics Database
$script:umamiDbHost = "your-postgres-host"           # e.g., "192.168.1.100" or "postgres.default.svc.cluster.local"
$script:umamiDbPort = 5432
$script:umamiDbName = "umami"
$script:umamiDbUser = "umami"
$script:umamiDbPassword = "your-secure-password"
```

### 2. Create Umami Database

Connect to your PostgreSQL instance and run:

```sql
CREATE DATABASE umami;
CREATE USER umami WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE umami TO umami;
```

### 3. Run Setup Script

The setup script will read from `_common-variables.ps1` and create the necessary Kubernetes secrets:

```powershell
cd c:\Projects\sports-data-config\app\base\monitoring\umami
.\setup-umami.ps1
```

This creates:
- `umami-db-secret` - PostgreSQL connection string
- `umami-secret` - App secret for security

### 4. Deploy Umami

Deploy via Flux (GitOps):
```bash
git add .
git commit -m "Add Umami analytics"
git push
```

Or deploy manually:
```bash
kubectl apply -k app/base/apps/umami/
```

### 5. Initial Login

Once deployed, access Umami at: `https://admin.sportdeets.com/analytics`

**Default credentials:**
- Username: `admin`
- Password: `umami`

**⚠️ Change the password immediately after first login!**

## Configuration

### Add Website to Track

1. Log in to Umami
2. Settings → Websites → Add website
3. Enter:
   - Name: `SportDeets`
   - Domain: `sportdeets.com`
4. Copy the tracking code
5. Add to your React app's `public/index.html`

### Tracking Script

Add this to your website (replace `WEBSITE_ID`):

```html
<script
  async
  defer
  data-website-id="YOUR_WEBSITE_ID"
  src="https://admin.sportdeets.com/analytics/script.js"
></script>
```

## DNS Configuration

Umami is hosted at `https://admin.sportdeets.com/analytics` - no additional DNS needed!

## Monitoring

Check deployment status:
```bash
kubectl get pods -l app=umami
kubectl logs -l app=umami -f
```

## Database Connection

Umami stores analytics data in PostgreSQL. Make sure your database is:
- PostgreSQL 12 or higher
- Accessible from the cluster
- Has the `umami` database created

## Troubleshooting

**Pod not starting:**
```bash
kubectl describe pod -l app=umami
```

**Database connection issues:**
```bash
# Check secret exists
kubectl get secret umami-db-secret

# Verify connection string format
kubectl get secret umami-db-secret -o jsonpath='{.data.database-url}' | base64 -d
```

**View logs:**
```bash
kubectl logs -l app=umami --tail=100
```

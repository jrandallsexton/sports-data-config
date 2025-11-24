# Umami Analytics - Quick Reference

## URLs

- **Production**: https://admin.sportdeets.com/analytics
- **Default Login**: `admin` / `umami` (change immediately!)

## Quick Commands

### Check Status
```bash
kubectl get pods -l app=umami
kubectl logs -l app=umami -f
```

### Get Tracking Script
1. Log into Umami
2. Settings → Websites → Add Website
3. Enter: `sportdeets.com`
4. Copy tracking code

### Add to React App

In `sd-ui/public/index.html`:

```html
<script
  async
  defer
  data-website-id="YOUR_WEBSITE_ID_HERE"
  src="https://admin.sportdeets.com/analytics/script.js"
></script>
```

## Database Access

```bash
# Get connection string from secret
kubectl get secret umami-db-secret -o jsonpath='{.data.database-url}' | base64 -d
```

## Restart Umami

```bash
kubectl rollout restart deployment/umami
```

## Troubleshooting

**Pod CrashLoopBackOff:**
- Check database secret exists: `kubectl get secret umami-db-secret`
- Verify database connection: Check logs for connection errors
- Ensure database is created and user has permissions

**Cannot access admin.sportdeets.com/analytics:**
- Verify admin.sportdeets.com DNS exists
- Check IngressRoute: `kubectl get ingressroute umami-https`
- Verify middleware: `kubectl get middleware umami-strip-prefix`
- Verify cert: `kubectl get certificate -A`

**Build tables not created:**
- Database connection successful but tables missing
- Container will auto-create tables on first run
- Check logs: `kubectl logs -l app=umami | grep -i table`

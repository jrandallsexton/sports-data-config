# SSL Termination Migration Plan
**✅ MIGRATION COMPLETED - February 7, 2026**

## Timeline
- **Start Date**: February 7, 2026
- **SSL Certificate Expiration**: February 14, 2026
- **Actual Completion**: February 7, 2026 (same day - 7-day buffer before expiration)
- **Original Estimate**: 12 days
- **Actual Duration**: 1 day

## Executive Summary
Successfully migrated from Azure Front Door to self-hosted Let's Encrypt certificates in a single day. All services secured with HTTPS, Azure resources deleted, and **$720/year cost savings** achieved.

## Current State

### Current Architecture
- **SSL Termination**: Azure Front Door (AFD)
- **Certificate**: `sportsdataweb-sportdeetssslissued-latest` managed in AFD
- **Ingress Controller**: Traefik v24.0.0 (HTTP only, ports 8080/8443)
- **Domains**: 
  - `sportdeets.com` (apex domain)
  - `www.sportdeets.com`
  - `api.sportdeets.com`
  - `admin.sportdeets.com` (Grafana, Prometheus, Hangfire)
  - `analytics.sportdeets.com` (Umami)
  - `about.sportdeets.com` (Portfolio/Architecture)
  - `logging.sportdeets.com` (Seq)
- **Current Flow**: Client → AFD (SSL termination) → Traefik (HTTP) → Services

### Why Migrate?
- Azure credits exhausted
- AFD costs no longer justified for hobby project
- SSL cert expires February 14, 2026
- Desire for self-managed infrastructure
- ✅ **Cost Savings: $720/year** (AFD + Static Web App eliminated)

## Target State
✅ New Architecture (COMPLETED)
- **SSL Termination**: Traefik ingress controller (in-cluster) ✅
- **Certificate Management**: cert-manager v1.16.2 with Let's Encrypt DNS-01 validation ✅
- **DNS Provider**: Cloudflare (migrated from NameCheap) ✅
- **Ingress Controller**: Traefik v24.0.0 (HTTPS on port 8443) ✅
- **React UI Hosting**: Containerized nginx (replaced Azure Static Web App) ✅
- **New Flow**: Client → Traefik (SSL termination) → Services ✅
- **All Certificates Valid Until**: May 7-8, 2026 (auto-renew 30 days before expiration) ✅)
- **New Flow**: Client → Traefik (SSL termination) → Services

## Migration Plan

### Phase 1: Setup cert-manager (Days 1-2)

#### 1.1 Install cert-manager via Flux
```yaml
# File: app/base/cert-manager/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: cert-manager
```

```yaml
# File: clusters/home/flux-system/cert-manager-helmrepository.yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: jetstack
  namespace: flux-system
spec:
  interval: 1h
  url: https://charts.jetstack.io
```

```yaml
# File: app/base/cert-manager/helmrelease.yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: cert-manager
  namespace: cert-manager
spec:
  interval: 5m
  chart:
    spec:
      chart: cert-manager
      version: v1.16.2  # Latest stable as of Feb 2026
      sourceRef:
        kind: HelmRepository
        name: jetstack
        namespace: flux-system
  values:
    crds:
      enabled: true  # Install CRDs
    global:
      leaderElection:
        namespace: cert-manager
```

```yaml
# File: app/base/cert-manager/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: cert-manager
resources:
  - namespace.yaml
  - helmrelease.yaml
```

#### 1.2 Create Let's Encrypt ClusterIssuer
```yaml
# File: app/base/cert-manager/letsencrypt-prod-issuer.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    # Let's Encrypt production server
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com  # REQUIRED: Update with actual email
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: traefik
```

```yaml
# File: app/base/cert-manager/letsencrypt-staging-issuer.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    # Let's Encrypt staging server (for testing)
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: your-email@example.com  # REQUIRED: Update with actual email
    privateKeySecretRef:
      name: letsencrypt-staging
    solvers:
    - http01:
        ingress:
          class: traefik
```

**Verification**:
```powershell
kubectl get pods -n cert-manager
kubectl get clusterissuer
```

---

### Phase 2: Configure Traefik for TLS (Days 3-4)

#### 2.1 Update Traefik HelmRelease
```yaml
# File: app/base/traefik/helmrelease.yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: traefik
  namespace: kube-system
spec:
  interval: 5m
  chart:
    spec:
      chart: traefik
      version: 24.0.0
      sourceRef:
        kind: HelmRepository
        name: traefik
        namespace: flux-system
  values:
    additionalArguments:
      - "--api=false"
    ports:
      web:
        port: 8080
        expose: true
        exposedPort: 80  # Changed from 8080 for standard HTTP
        protocol: TCP
        # Add HTTP to HTTPS redirect
        redirectTo:
          port: websecure
      websecure:
        port: 8443
        expose: true
        exposedPort: 443  # Changed from 8443 for standard HTTPS
        protocol: TCP
        tls:
          enabled: true
      traefik:
        expose: false
        port: 9000
        protocol: TCP
    ingressRoute:
      dashboard:
        enabled: false
```

**Note**: Changing exposedPort requires updating your router port forwarding rules.

---

### Phase 3: Create Test Certificate (Days 5-6)

#### 3.1 Test with Let's Encrypt Staging
```yaml
# File: app/base/apps/api/api-certificate-staging.yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: api-sportdeets-staging
  namespace: default
spec:
  secretName: api-sportdeets-tls-staging
  issuerRef:
    name: letsencrypt-staging
    kind: ClusterIssuer
  dnsNames:
    - api.sportdeets.com
```

#### 3.2 Update IngressRoute for HTTPS (Staging)
```yaml
# File: app/base/apps/api/api-ingressroute.yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: api-internal-ingress
  namespace: default
spec:
  entryPoints:
    - websecure  # Changed from 'web'
  routes:
    - match: Host(`api.sportdeets.com`)
      kind: Rule
      services:
        - name: api-service
          port: 8080
  tls:
    secretName: api-sportdeets-tls-staging
---
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: api-internal-ingress-http
  namespace: default
spec:
  entryPoints:
    - web  # HTTP entrypoint
  routes:
    - match: Host(`api.sportdeets.com`)
      kind: Rule
      services:
        - name: api-service
          port: 8080
      middlewares:
        - name: https-redirect
---
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: https-redirect
  namespace: default
spec:
  redirectScheme:
    scheme: https
    permanent: true
```

**Verification**:
```powershell
kubectl get certificate -A
kubectl describe certificate api-sportdeets-staging -n default
kubectl get secret api-sportdeets-tls-staging -n default

# Test HTTPS (expect self-signed/staging cert warning)
curl -I https://api.sportdeets.com
```

**Expected**: Certificate issued but browser shows warning (staging CA not trusted).

---

### Phase 4: Production Certificate (Day 7)

#### 4.1 Switch to Production Let's Encrypt
```yaml
# File: app/base/apps/api/api-certificate.yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: api-sportdeets
  namespace: default
spec:
  secretName: api-sportdeets-tls
  issuerRef:
    name: letsencrypt-prod  # Changed from staging
    kind: ClusterIssuer
  dnsNames:
    - api.sportdeets.com
```

#### 4.2 Update IngressRoute
```yaml
# Update tls.secretName to production cert
spec:
  tls:
    secretName: api-sportdeets-tls  # Changed from -staging
```

**Verification**:
```powershell
kubectl get certificate api-sportdeets -n default
kubectl describe certificate api-sportdeets -n default

# Should show Ready=True
# Secret should contain valid Let's Encrypt cert
openssl s_client -connect api.sportdeets.com:443 -showcerts
```

---

### Phase 5: Migrate All Domains (Days 8-10)

#### 5.1 Create Certificates for All Domains
```yaml
# File: app/base/apps/certificates.yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: apex-sportdeets
  namespace: default
spec:
  secretName: apex-sportdeets-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - sportdeets.com
    - www.sportdeets.com
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: admin-sportdeets
  namespace: default
spec:
  secretName: admin-sportdeets-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - admin.sportdeets.com
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: analytics-sportdeets
  namespace: default
spec:
  secretName: analytics-sportdeets-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - analytics.sportdeets.com
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: about-sportdeets
  namespace: default
spec:
  secretName: about-sportdeets-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - about.sportdeets.com
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: logging-sportdeets
  namespace: default
spec:
  secretName: logging-sportdeets-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - logging.sportdeets.com
```

#### 5.2 Update All IngressRoutes
Update each IngressRoute to:
- Use `websecure` entrypoint
- Reference TLS secret
- Add HTTP → HTTPS redirect

**Example for Hangfire**:
```yaml
# File: app/base/apps/hangfire-ingressroutes.yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: hangfire-ncaa-football
  namespace: default
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`admin.sportdeets.com`) && PathPrefix(`/hangfire/ncaa-football`)
      kind: Rule
      services:
        - name: producer-football-ncaa-service
          port: 8080
  tls:
    secretName: admin-sportdeets-tls
```

---

### Phase 6: Update Network Configuration (Day 11)

#### 6.1 Verify Network Configuration
**Current State**: Ports 80 and 443 already forwarded to cluster via home router.

**Verify Traefik LoadBalancer**:
```powershell
kubectl get svc traefik -n kube-system
# Should show EXTERNAL-IP assigned by k3s servicelb
```

**No router changes required** - existing port forwarding will work once Traefik binds to standard ports 80/443.

#### 6.2 DNS Updates
**Current**: All domains → Azure Front Door IP
**New**: All domains → Your public IP (67.7.88.82)

Update A records in DNS provider (NameCheap):
- `sportdeets.com` → `67.7.88.82` (apex domain)
- `www.sportdeets.com` → `67.7.88.82`
- `api.sportdeets.com` → `67.7.88.82`
- `admin.sportdeets.com` → `67.7.88.82`
- `analytics.sportdeets.com` → `67.7.88.82`
- `about.sportdeets.com` → `67.7.88.82`
- `logging.sportdeets.com` → `67.7.88.82`

**TTL**: Set to 300 seconds (5 minutes) for quick rollback if needed.

---

### Phase 7: Decommission Azure Front Door (Day 12)

#### 7.1 Verify All Traffic Bypasses AFD
```powershell
# Check DNS propagation
nslookup api.sportdeets.com

# Test HTTPS directly to cluster
curl -v https://api.sportdeets.com
# Should show valid Let's Encrypt cert, NOT AFD cert

# Check cert issuer
openssl s_client -connect api.sportdeets.com:443 | grep "Issuer"
# Should show: Issuer: C = US, O = Let's Encrypt, CN = R3
```

#### 7.2 Delete Azure Front Door Resources
```powershell
# Navigate to sports-data-provision
cd C:\Projects\sports-data-provision\environments\prod

# Delete Front Door endpoints (DO NOT RUN UNTIL VERIFICATION COMPLETE)
az deployment group delete --resource-group rg-sportdeets --name api-internal-subdomain
az deployment group delete --resource-group rg-sportdeets --name admin-subdomain
az deployment group delete --resource-group rg-sportdeets --name analytics-subdomain
az deployment group delete --resource-group rg-sportdeets --name about-subdomain

# Finally, delete Front Door profile
az cdn profile delete --name fd-sportdeets --resource-group rg-sportdeets
```

#### 7.3 Decommission Azure API Management (APIM)

**Pre-Decommission Checks**:
```powershell
# List all APIs in APIM
az apim api list --resource-group rg-sportdeets --service-name <apim-name> --output table

# Check if any APIs are actively used (review logs/metrics in portal)
# If no active usage, proceed with deletion
```

**Verify No Dependencies**:
- [ ] No Front Door rules routing to APIM
- [ ] No DNS entries pointing to APIM gateway
- [ ] No application code using APIM subscription keys
- [ ] No developer portal users actively using it

**Delete APIM**:
```powershell
# Get APIM resource name
az apim list --resource-group rg-sportdeets --output table

# Delete APIM (WARNING: Irreversible, backup any policies/configs first)
az apim delete --name <apim-name> --resource-group rg-sportdeets --yes

# Verify deletion
az apim list --resource-group rg-sportdeets
```

**Expected Savings**: ~$50-250/month (~$600-3000/year)

---

## Rollback Plan

### If Issues Arise Before DNS Change
1. **Revert Traefik config**: Remove TLS changes, restore HTTP-only
2. **Delete certificates**: `kubectl delete certificate -A --all`
3. **DNS remains pointed at AFD**: No service disruption

### If Issues Arise After DNS Change
1. **Emergency DNS Rollback**: Point DNS back to AFD IP
2. **Wait for TTL (5 minutes)**: Traffic resumes through AFD
3. **Debug cluster TLS issues**: Certificates, Traefik config, etc.

---

## Prerequisites & Risks

### Prerequisites
- [ ] Email address for Let's Encrypt notifications
- [ ] Access to DNS provider (for A record updates)
- [ ] Router admin access (for port forwarding changes)
- [ ] Firewall allows inbound 80/443 to cluster
- [ ] Current AFD cert doesn't expire before Feb 14

### Potential Issues & Mitigations

#### Issue: Let's Encrypt Rate Limits
- **Risk**: 50 certificates per domain per week, 5 failures per hour
- **Mitigation**: Test with staging first, batch certificate creation

#### Issue: HTTP-01 Challenge Failure
- **Risk**: Let's Encrypt can't reach `http://<domain>/.well-known/acme-challenge/`
- **Mitigation**: 
  - Ensure port 80 forwarding is active
  - Traefik must serve challenge path
  - DNS must resolve to your public IP

#### Issue: Previous Cert Incompatibility
- **Context**: "My cert was not compatible" (previous agent feedback)
- **Potential Cause**: AFD uses PFX/PEM format, Traefik expects Kubernetes Secret (TLS type)
- **Mitigation**: Use cert-manager for native Kubernetes TLS secrets, don't import AFD cert

---

## Testing Checklist

### Pre-Migration Tests
- [ ] cert-manager pods running
- [ ] ClusterIssuers ready (`kubectl get clusterissuer`)
- [ ] Staging certificate issued successfully
- [ ] Browser shows staging cert warning (expected)
- [ ] HTTP → HTTPS redirect working

### Post-Migration Tests
- [ ] Production certificates issued (`kubectl get certificate -A`)
- [ ] All certs show `Ready=True`
- [ ] Browser shows valid Let's Encrypt cert (no warnings)
- [ ] All domains resolve to cluster IP
- [ ] API responds on HTTPS
- [ ] Hangfire dashboards accessible via HTTPS
- [ ] Prometheus/Grafana/Seq accessible via HTTPS
- [ ] No errors in Traefik logs (`kubectl logs -n kube-system -l app.kubernetes.io/name=traefik`)
- [ ] No errors in cert-manager logs (`kubectl logs -n cert-manager -l app=cert-manager`)

### Monitoring During Migration
```powershell
# Watch certificates
kubectl get certificate -A -w

# Watch Traefik pods
kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik -w

# Watch cert-manager
kubectl logs -n cert-manager -l app=cert-manager -f

# Check certificate details
kubectl describe certificate <cert-name> -n <namespace>
```

---

## Post-Migration Security Hardening

### Content Security Policy Nonce Implementation
**Priority**: Medium | **Complexity**: High | **Timeline**: Post-SSL migration

**Current State**:
- CSP uses `'unsafe-inline'` for `script-src` and `style-src`
- API URLs hardcoded in CSP `connect-src` directive
- Acceptable for initial deployment but weakens XSS protection

**Security Issues**:
1. **`'unsafe-inline'` in script-src**: Allows inline JavaScript, defeating CSP's primary XSS protection
2. **`'unsafe-inline'` in style-src**: Required for Emotion/CSS-in-JS but could be tightened with nonces
3. **Hardcoded API URLs**: `connect-src` contains build-time URLs instead of runtime env vars

**Recommended Implementation** (after SSL migration stabilizes):

#### 1. Nonce-Based CSP for Scripts
**Goal**: Remove `'unsafe-inline'` from `script-src` by using cryptographic nonces

**Requirements**:
- Generate random nonce on each request (e.g., via nginx Lua or custom entrypoint)
- Inject nonce into HTML via `<meta>` tag or template substitution
- Update React's `public/index.html` to reference nonce
- Modify CSP header to use `script-src 'self' 'nonce-{NONCE}'`

**Implementation Options**:
- **Option A**: nginx Lua module (requires recompiling nginx with Lua support)
- **Option B**: Node.js middleware serving static build with nonce injection
- **Option C**: Edge worker/CDN to inject nonces (Cloudflare Workers, etc.)

#### 2. Template CSP connect-src at Runtime
**Goal**: Replace hardcoded API URLs with environment variables

**Current**:
```nginx
connect-src 'self' https://api.sportdeets.com https://api-int.sportdeets.com;
```

**Proposed**:
```nginx
connect-src 'self' ${REACT_APP_API_BASE_URL} ${REACT_APP_SIGNALR_URL};
```

**Implementation**:
1. Update `security-headers.conf` to use template variables
2. Create entrypoint script that runs `envsubst` on startup:
   ```bash
   #!/bin/sh
   envsubst '$REACT_APP_API_BASE_URL $REACT_APP_SIGNALR_URL' < /etc/nginx/security-headers.conf.template > /etc/nginx/security-headers.conf
   nginx -g "daemon off;"
   ```
3. Update Dockerfile to copy template and use custom entrypoint
4. Pass env vars via Kubernetes Deployment

#### 3. Style-src Hardening
**Challenge**: `@emotion/react` and `@emotion/styled` require inline styles

**Options**:
- Keep `'unsafe-inline'` (acceptable for CSS-in-JS frameworks)
- Implement nonce-based styles (complex, requires Emotion theme provider changes)
- Migrate to CSS modules (major refactor, not recommended)

**Recommendation**: Defer style-src hardening - inline styles in CSS-in-JS are low risk compared to scripts

#### 4. Testing CSP Changes
**Critical**: Test CSP changes thoroughly to avoid breaking UI

**Testing Approach**:
1. Use CSP in **report-only mode** first:
   ```nginx
   add_header Content-Security-Policy-Report-Only "..." always;
   ```
2. Monitor violations via browser console or reporting endpoint
3. Iterate on policy until no violations
4. Switch to enforcement mode

**Reporting Endpoint** (optional):
```nginx
report-uri https://your-reporting-endpoint.com/csp-violations;
```

#### 5. Estimated Effort
- **Nonce implementation**: 8-16 hours (nginx Lua) or 4-8 hours (Node.js middleware)
- **Environment templating**: 2-4 hours
- **Testing and iteration**: 4-8 hours
- **Total**: 14-28 hours

**Dependencies**:
- SSL migration complete and stable
- Production traffic flowing through Traefik
- Monitoring/observability in place for CSP violation tracking

**References**:
- [CSP Nonce Best Practices](https://content-security-policy.com/nonce/)
- [nginx Lua Module](https://github.com/openresty/lua-nginx-module)
- [React CSP Configuration](https://create-react-app.dev/docs/advanced-configuration/#inline-runtime-chunk)

---

## Post-Migration Status

### ✅ Completed Items
1. **cert-manager deployed** - v1.16.2 with DNS-01 validation (IPv4 DNS fix applied)
2. **DNS Migration** - Cloudflare (from NameCheap) with API token for DNS-01 challenges
3. **All Certificates Issued** - 5 Let's Encrypt production certificates (valid until May 2026)
4. **HTTPS IngressRoutes** - Created for all services with HTTP→HTTPS redirects
5. **React UI Containerization** - Replaced Azure Static Web App with nginx container
6. **CSP Configuration** - Updated for Firebase authentication and Google Maps
7. **Azure Cleanup** - Front Door and Static Web App deleted
8. **Grafana Access** - Password reset and secured in Kubernetes Secret
9. **GitHub Actions** - Removed APIM dependencies, added UI deployment

### 🔄 Deferred Items
1. **Hangfire Dashboards** - Disabled externally (auth hard-coded to `true`), accessible via port-forward
2. **Google Maps** - May need API key verification
3. **CSP Hardening** - Nonce-based implementation deferred (using 'unsafe-inline')

---

## Cost Savings
- **Azure Front Door**: ~$35-50/month (~$420-600/year) - ✅ **DELETED**
- **Azure Static Web App**: ~$10/month (~$120/year) - ✅ **DELETED**
- **Azure API Management**: ✅ **NOT USING**
- **NameCheap SSL Certificate**: ~$10-60/year - ✅ **NO LONGER NEEDED**
- **cert-manager + Let's Encrypt**: $0 (free) ✅
- **Cloudflare DNS**: $0 (free tier) ✅
- **Total Annual Savings**: **$720/year** (AFD + Static Web App eliminated)

---

## References
- [cert-manager Documentation](https://cert-manager.io/docs/)
- [Let's Encrypt Rate Limits](https://letsencrypt.org/docs/rate-limits/)
- [Traefik TLS Configuration](https://doc.traefik.io/traefik/routing/routers/#tls)
- [Cloudflare DNS-01 ACME](https://cert-manager.io/docs/configuration/acme/dns01/cloudflare/)

---

## Lessons Learned
1. **DNS-01 vs HTTP-01**: Router ISP management can block HTTP-01; DNS-01 more reliable for home labs
2. **IPv6 DNS Issues**: Force IPv4 DNS with `--dns01-recursive-nameservers` flag
3. **NAT Hairpinning**: Test HTTPS externally to avoid router admin UI intercepts
4. **Grafana Passwords**: Environment variables don't override SQLite database; use `grafana cli`
5. **Migration Duration**: Completed in 1 day vs 12-day estimate (DNS-01 bypassed HTTP challenges)

---

## Final Notes
- ✅ **Completed February 7, 2026** - 7 days before SSL expiration
- ✅ **All services HTTPS** with valid Let's Encrypt certificates
- ✅ **Zero downtime** - No active users during migration
- ✅ **GitOps maintained** - All changes via Git + Flux
- ✅ **Security preserved** - Passwords in Kubernetes Secrets, not source control

# Cosmos DB to Self-Hosted MongoDB Migration Plan
**Migration from Azure Cosmos DB (MongoDB API) to Bare Metal MongoDB**

## Status
✅ **COMPLETED** - February 8, 2026

## Timeline
- **Planning Start**: January 2026
- **Bare Metal Installation**: February 7, 2026
- **Code Migration**: February 8, 2026
- **Production Cutover**: February 8, 2026
- **Cosmos DB Deletion**: Pending (validated, ready to delete)
- **Next Project**: Historical NCAA football data sourcing from ESPN (all years available)

## Executive Summary
Migration from Azure Cosmos DB (MongoDB API) to bare metal MongoDB successfully completed. Chose bare metal over Kubernetes deployment for better performance and simpler operations.

**CRITICAL: This migration was completed BEFORE running historical NCAA football data sourcing from ESPN.** Bulk importing years of historical data on Cosmos DB would have been prohibitively expensive due to RU/s provisioning costs and would suffer from constant throttling. MongoDB on bare metal provides unlimited throughput for the massive data ingestion project ahead.

### Actual Implementation
- **Deployment**: MongoDB 8.0.18 on bare metal (sdprod-data-0, 192.168.0.250)
- **Storage**: 900 GB local storage (809 GB free after initial data)
- **Authentication**: SCRAM-SHA-256, database-specific users
- **Database Pattern**: Sport-specific databases (FootballNcaa) with DocumentType collections
- **Collection Structure**: `Coach`, `TeamSeason`, `Venue` (DocumentType-only naming)
- **Code Changes**: Fixed read/write path mismatch bug, updated collection naming logic
- **Result**: Production-ready, validated via Compass and smoke tests

---

## Completed Implementation

### Actual Architecture
- **Document Store**: MongoDB 8.0.18 on bare metal
- **Server**: sdprod-data-0 (192.168.0.250:27017)
- **Operating System**: Ubuntu Server
- **Service Management**: systemd (mongod.service)
- **Storage**: 900 GB local storage across all 5 NUCs (expanded from 100 GB)
- **Backup**: Manual snapshots + future automated backup strategy
- **Monitoring**: MongoDB Compass for management
- **Access**: Direct connection via IP (192.168.0.250:27017)

### Why Bare Metal Instead of Kubernetes?
1. **Performance**: No containerization overhead
2. **Simplicity**: Standard MongoDB installation, no Helm charts
3. **Storage**: Direct access to local storage (900 GB available)
4. **Reliability**: Fewer moving parts, easier troubleshooting
5. **Hardware**: Dedicated NUC with sufficient resources
6. **Operations**: Standard mongod.service management

### Database Structure (As Implemented)
- **Database-per-Sport Pattern**: Each sport gets its own database
  - `FootballNcaa` - NCAA Football documents
  - `FootballNfl` - NFL documents (future)
  - `BasketballNba` - NBA documents (future)
  - etc.

- **Collection Naming**: DocumentType only (sport context from database)
  - Collections: `Coach`, `TeamSeason`, `Venue`, `Athlete`, `Game`, etc.
  - Example full path: `FootballNcaa.Coach`, `FootballNcaa.Venue`
  - **Benefit**: Clean, non-redundant naming (sport already in database name)

### Authentication Setup
- **Method**: SCRAM-SHA-256
- **Admin User**: Root credentials for administration
- **Application Users**: Sport-specific users with database-level permissions
  - `sd-football-ncaa` - Read/write access to `FootballNcaa` database
  - Password stored in Azure Key Vault
- **Auth Database**: Each user authenticates against their specific database

### Code Changes Required
Fixed critical read/write path mismatch bug:

1. **DocumentProviderAndTypeDecoder.cs**: 
   - Changed `GetCollectionName()` to return `docType.ToString()` instead of `sport.ToString()`
   - Removed Cosmos legacy comment about multi-sport isolation

2. **ProviderClient.cs**: 
   - Added `DocumentType` parameter to `GetDocumentByUrlHash()`
   - Updated route pattern to include documentType

3. **DocumentController.cs**: 
   - Updated `GetDocumentByUrlHash` to accept and use DocumentType parameter
   - Changed from hardcoded sport to documentType-based collection resolution

4. **DocumentCreatedProcessor.cs**: 
   - Updated to pass `evt.DocumentType` to provider calls

5. **Test Updates**: All unit tests updated to match new signature

### Storage Expansion
- **Original**: 100 GB per NUC
- **Expanded**: 900 GB per NUC (809 GB free on data node)
- **Reason**: Prepare for massive historical NCAA football data import
- **K3s Update**: Services restarted to detect new storage capacity

---

## Original Planning (For Reference)

### Original Plan: Kubernetes Deployment
**NOTE**: This section describes the original Kubernetes-based plan. Actual implementation used bare metal for simplicity and performance.

#### Current State (Original Assessment)
- **Document Store**: Azure Cosmos DB with MongoDB API
- **Usage**: Provider service stores raw JSON documents from external data sources (ESPN, etc.)
- **Current Data Size**: 
  - Data: 7.78 GB
  - Indexes: 1.55 GB
  - **Total: ~9.33 GB**
- **Current Collection Structure**: Single collection "FootballNcaa" (all document types mixed)
  - ⚠️ **Cosmos Limitation**: Desired {Sport}.{DocumentType} naming (FootballNcaa.Venue, FootballNcaa.Athlete) not supported
  - ✅ **MongoDB Benefit**: Native support for desired collection naming pattern
- **Connection**: MongoDB driver with Cosmos connection string
- **Cost**: ~$50-200/month (depends on provisioned RU/s)
- **Location**: Azure East US 2

### Why Migrate?
- 🎯 **BLOCKER FOR HISTORICAL DATA SOURCING**: Cannot run massive ESPN historical data import on Cosmos DB
  - Historical import would require very high RU/s provisioning = $$$
  - Constant 429 throttling errors during bulk inserts
  - Months/years of NCAA FB data = millions of documents
  - MongoDB in-cluster = unlimited throughput, zero cost
- ✨ **Collection Naming Freedom**: Fix Cosmos limitation blocking desired structure
  - **Current**: Single "FootballNcaa" collection (all document types mixed - Venues, Athletes, Teams, etc.)
  - **Desired (Future)**: {Sport}.{DocumentType} pattern (FootballNcaa.Venue, FootballNcaa.Athlete, etc.)
  - **Cosmos Limitation**: Cannot use dot notation in collection names with Cosmos DB MongoDB API
  - **MongoDB Benefit**: Native support for logical collection organization (deferred to future project)
  - **Migration Scope**: Keep existing structure (migrate as-is, restructure later)
- ✅ **Cost Savings**: ~$600-2,400/year (Cosmos DB costs)
- ✅ **Azure Exit Strategy**: Continuing SSL migration momentum, eliminating Azure dependencies
- ✅ **Full MongoDB Features**: No Cosmos API limitations
- ✅ **No RU/s Throttling**: Unlimited throughput (bound only by hardware)
- ✅ **Operational Consistency**: Already running MongoDB locally for development
- ✅ **Control**: Full access to MongoDB features, tooling, and configuration

---

## Target State

### New Architecture
- **Document Store**: MongoDB running in Kubernetes cluster
- **Deployment**: Helm chart (bitnami/mongodb) managed by Flux
- **Storage**: Persistent volumes (local-path or SMB)
- **Backup**: Automated mongodump to SMB share + off-cluster backups
- **Monitoring**: Prometheus metrics via MongoDB exporter
- **Access**: Internal ClusterIP service (no external exposure needed)

### Deployment Options

#### Option 1: Single Instance (Recommended for Start)
**Pros**:
- Simple setup and operation
- Lower resource usage (1 pod)
- Sufficient for current zero-user load
- Easy to upgrade to replica set later

**Cons**:
- No high availability
- Downtime during pod restarts
- Single point of failure

**Resource Requirements**:
- CPU: 500m-1 core
- Memory: 1-2 GB
- Storage: 30 GB (current 9.33 GB × 3 for growth headroom before historical import)
- **Note**: Historical NCAA FB data import will require significantly more storage - plan for 100-500 GB PVC

#### Option 2: Replica Set (Future Enhancement)
**Pros**:
- High availability (3 nodes)
- Zero-downtime rolling updates
- Automatic failover
- Read scaling potential

**Cons**:
- 3x resource usage
- More complex operation
- Overkill for current hobby project scale

**Resource Requirements**:
- CPU: 1.5-3 cores (3 pods × 500m-1 core)
- Memory: 390 GB minimum (current 9.33 GB × 3 replicas × 3 for growth)
- Storage: 60-150 GB

**Recommendation**: Start with Option 1, upgrade to Option 2 if/when you get real traffic.

---

## Migration Execution Summary

### Phase 1: Bare Metal Installation ✅
**Date**: February 7, 2026

1. **Installed MongoDB 8.0.18** on sdprod-data-0 (192.168.0.250)
   ```bash
   # Ubuntu 22.04 installation
   wget -qO - https://www.mongodb.org/static/pgp/server-8.0.asc | sudo apt-key add -
   echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/8.0 multiverse" | \
     sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
   sudo apt-get update
   sudo apt-get install -y mongodb-org=8.0.18 mongodb-org-database=8.0.18 \
     mongodb-org-server=8.0.18 mongodb-org-shell=8.0.18 mongodb-org-mongos=8.0.18 \
     mongodb-org-tools=8.0.18
   sudo systemctl start mongod
   sudo systemctl enable mongod
   ```

2. **Configured Authentication**
   - Enabled security in `/etc/mongod.conf`
   - Created admin user
   - Created `sd-football-ncaa` user in `FootballNcaa` database
   - Password: `SportDeets2025!!!` (stored in Azure Key Vault)
   - Auth mechanism: SCRAM-SHA-256

3. **Expanded Storage**
   - Expanded all 5 NUCs from 100 GB to 900 GB
   - 809 GB free on data node after initial setup
   - Restarted K3s services to detect new capacity

### Phase 2: Application Code Updates ✅
**Date**: February 8, 2026

1. **Fixed Critical Bug**: Read/write path mismatch
   - Write path was using `DocumentType` for collections
   - Read path was using `Sport` for collections
   - **Result**: Documents written to `Coach` couldn't be found when querying `FootballNcaa`

2. **Updated Files**:
   - `DocumentProviderAndTypeDecoder.cs` - Return `docType.ToString()` not `sport.ToString()`
   - `ProviderClient.cs` - Added `DocumentType` parameter to `GetDocumentByUrlHash()`
   - `DocumentController.cs` - Use documentType instead of hardcoded sport
   - `DocumentCreatedProcessor.cs` - Pass `evt.DocumentType` to provider
   - Test files - Updated all mocks to match new signatures

3. **Collection Naming**:
   - Database: `FootballNcaa` (sport-specific)
   - Collections: `Coach`, `TeamSeason`, `Venue`, etc. (DocumentType only)
   - Removed Cosmos legacy code for `{Sport}.{DocumentType}` pattern

### Phase 3: Configuration Updates ✅
**Date**: February 8, 2026

1. **Azure Key Vault**
   - Updated `MongoDb--ConnectionString` for production
   - Connection string: `mongodb://sd-football-ncaa:SportDeets2025!!!@192.168.0.250:27017/FootballNcaa?authSource=FootballNcaa&authMechanism=SCRAM-SHA-256`

2. **Local Configuration**
   - Enabled auth in `mongod.cfg` (Windows)
   - Created matching users locally
   - Local password: `sesame1?`

### Phase 4: Testing & Validation ✅
**Date**: February 8, 2026

1. **Build Verification**
   - Full solution build successful
   - All unit tests passing
   - No compilation errors

2. **Production Smoke Test**
   - PR merged and deployed
   - Documents being written to MongoDB
   - Collections verified in MongoDB Compass:
     - `Coach` ✅
     - `TeamSeason` ✅
     - `Venue` ✅
     - etc.
   - Read/write operations confirmed working

3. **Compass Validation**
   - Connected to production MongoDB
   - Verified collection structure
   - Checked document counts
   - Confirmed data integrity

### Phase 5: Cosmos DB Cleanup (PENDING)
**Status**: Ready to execute

- [ ] Final backup of Cosmos DB (optional - data already in MongoDB)
- [ ] Delete Cosmos DB account via Azure Portal
- [ ] Remove Cosmos connection strings from Azure Key Vault
- [ ] Confirm cost savings on next Azure bill (~$50-200/month eliminated)

---

## Original Migration Plan (For Reference)

### Data Analysis (COMPLETED - February 7, 2026)

**Current Cosmos DB Size** (from Azure Portal):
- **Data Size**: 7.78 GB
- **Index Size**: 1.55 GB  
- **Total**: 9.33 GB
- **Location**: East US 2

**Collection Structure**:
- **Single Collection**: "FootballNcaa" (all document types in one collection)
- **Document Types Mixed**: Venues, Athletes, Teams, Games, etc. all in "FootballNcaa"
- **Cosmos Limitation**: Desired pattern {Sport}.{DocumentType} (e.g., FootballNcaa.Venue, FootballNcaa.Athlete) not supported by Cosmos DB MongoDB API
- **MongoDB Benefit**: Can restructure to desired pattern in future (not during this migration)
- **Migration Decision**: Migrate as-is, keep existing collection structure (low-risk approach)

**Implications**:
- ✅ Small enough for quick migration (minutes, not hours)
- ✅ mongodump/mongorestore will be fast (<10 minutes estimated)
- ✅ 50 GB PVC provides 5x headroom for current data
- ⚠️ **Historical data import will grow this significantly** (plan for 100-500 GB after full ESPN historical import)
- 🎯 **Migration bonus**: Opportunity to implement desired collection naming structure

**Next Steps** (before migration):
1. ✅ Data size confirmed (9.33 GB)
2. ✅ Collection structure confirmed (single "FootballNcaa" collection)
3. ✅ **Decision**: Keep single collection as-is during migration (defer restructuring to future project)
4. [ ] Check connection string references in code/config
5. [ ] Verify current Cosmos DB monthly cost in Azure Cost Management

### Cost Analysis (TODO: Check Azure Portal)

**Current Costs**:
- [ ] Check Azure Cost Management for Cosmos DB monthly spend
- [ ] Identify if serverless or provisioned throughput
- [ ] Note current RU/s allocation
- [ ] Calculate annual cost

**Projected Savings**: 
- Cosmos DB cost: $___/month × 12 = $___/year
- MongoDB self-hosted: $0 (cluster resources already available)
- **Net Savings**: $___/year

---

## Migration Plan

### Phase 1: Deploy MongoDB in Cluster (2-3 hours)

#### 1.1 Add MongoDB Helm Repository to Flux
```yaml
# File: clusters/home/flux-system/mongodb-helmrepository.yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: bitnami
  namespace: flux-system
spec:
  interval: 1h
  url: https://charts.bitnami.com/bitnami
```

#### 1.2 Create MongoDB Namespace
```yaml
# File: app/base/mongodb/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: mongodb
```

#### 1.3 Create MongoDB Credentials Secret
**DO NOT COMMIT PASSWORDS TO GIT**

```bash
# Create secret manually in cluster
kubectl create secret generic mongodb-credentials -n mongodb \
  --from-literal=mongodb-root-password='<generate-strong-password>' \
  --from-literal=mongodb-password='<generate-strong-password>' \
  --from-literal=mongodb-replica-set-key='<generate-strong-key>'

# Or use sealed-secrets/SOPS if you have them configured
```

**Document passwords in secure location** (password manager, not Git).

#### 1.4 Create MongoDB HelmRelease
```yaml
# File: app/base/mongodb/helmrelease.yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: mongodb
  namespace: mongodb
spec:
  interval: 5m
  chart:
    spec:
      chart: mongodb
      version: 16.x.x  # Check latest stable version
      sourceRef:
        kind: HelmRepository
        name: bitnami
        namespace: flux-system
  values:
    architecture: standalone  # or 'replicaset' for HA
    
    auth:
      enabled: true
      rootUser: root
      existingSecret: mongodb-credentials  # Created manually above
      username: sportdeets
      database: sportdeets-prod
    
    persistence:
      enabled: true
      storageClass: local-path  # or 'smb-csi' for SMB
      size: 20Gi  # Adjust based on data analysis
    
    resources:
      limits:
        cpu: 1000m
        memory: 2Gi
      requests:
        cpu:50Gi  # Current 9.33GB + growth for historical data import
        memory: 1Gi
    
    metrics:
      enabled: true  # Prometheus exporter
      serviceMonitor:
        enabled: true
        namespace: monitoring
    
    livenessProbe:
      enabled: true
      initialDelaySeconds: 30
      periodSeconds: 10
      timeoutSeconds: 5
      failureThreshold: 6
    
    readinessProbe:
      enabled: true
      initialDelaySeconds: 5
      periodSeconds: 10
      timeoutSeconds: 5
      failureThreshold: 6
```

#### 1.5 Create Kustomization
```yaml
# File: app/base/mongodb/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: mongodb
resources:
  - namespace.yaml
  - helmrelease.yaml
```

#### 1.6 Add to Overlay
```yaml
# File: app/overlays/04_prod/kustomization.yaml
resources:
  - ../../base/mongodb
  # ... other resources
```

#### 1.7 Deploy via Flux
```bash
git add -A
git commit -m "feat(mongodb): Deploy MongoDB for Cosmos DB replacement"
git push

flux reconcile kustomization apps --with-source
kubectl get pods -n mongodb -w
```

**Verification**:
```bash
# Check pod status
kubectl get pods -n mongodb

# Check PVC
kubectl get pvc -n mongodb

# Test connection
kubectl run -it --rm mongo-test --image=mongo:8.0 --restart=Never -- \
  mongosh "mongodb://sportdeets:<password>@mongodb.mongodb.svc.cluster.local:27017/sportdeets-prod"

# Inside mongosh
show dbs
use sportdeets-prod
db.test.insertOne({migration: "test"})
db.test.find()
```

---

### Phase 2: Configure Backups (1-2 hours)

#### 2.1 Create Backup Script
```yaml
# File: app/base/mongodb/backup-cronjob.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: mongodb-backup-script
  namespace: mongodb
data:
  backup.sh: |
    #!/bin/bash
    set -e
    
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_DIR="/backups/mongodb-backup-${TIMESTAMP}"
    RETENTION_DAYS=30
    
    echo "Starting MongoDB backup at ${TIMESTAMP}"
    
    # Create backup directory
    mkdir -p "${BACKUP_DIR}"
    
    # Run mongodump
    mongodump \
      --uri="mongodb://${MONGODB_USERNAME}:${MONGODB_PASSWORD}@mongodb:27017/${MONGODB_DATABASE}" \
      --out="${BACKUP_DIR}" \
      --gzip
    
    echo "Backup completed: ${BACKUP_DIR}"
    
    # Clean up old backups
    echo "Cleaning up backups older than ${RETENTION_DAYS} days"
    find /backups -type d -name "mongodb-backup-*" -mtime +${RETENTION_DAYS} -exec rm -rf {} +
    
    echo "Backup process finished"
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: mongodb-backup
  namespace: mongodb
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: mongo:8.0
            command:
            - /bin/bash
            - /scripts/backup.sh
            env:
            - name: MONGODB_USERNAME
              valueFrom:
                secretKeyRef:
                  name: mongodb-credentials
                  key: username
            - name: MONGODB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: mongodb-credentials
                  key: mongodb-password
            - name: MONGODB_DATABASE
              value: sportdeets-prod
            volumeMounts:
            - name: backup-script
              mountPath: /scripts
            - name: backup-storage
              mountPath: /backups
          volumes:
          - name: backup-script
            configMap:
              name: mongodb-backup-script
              defaultMode: 0755
          - name: backup-storage
            persistentVolumeClaim:
              claimName: mongodb-backups
          restartPolicy: OnFailure
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mongodb-backups
  namespace: mongodb
spec:
  accessModes:
  - ReadWriteMany
  storageClassName: smb-csi  # Use SMB for network-accessible backups
  resources:
    requests:
      storage: 50Gi  # Adjust based on data size and retention
```

#### 2.2 Test Backup Process
```bash
# Trigger manual backup job
kubectl create job -n mongodb mongodb-backup-manual --from=cronjob/mongodb-backup

# Watch job execution
kubectl logs -n mongodb job/mongodb-backup-manual -f

# Verify backup files
kubectl exec -n mongodb mongodb-0 -- ls -lh /backups

# Test restore (on test database)
kubectl exec -it -n mongodb mongodb-0 -- mongorestore \
  --uri="mongodb://sportdeets:<password>@localhost:27017/sportdeets-test" \
  --gzip \
  /backups/mongodb-backup-<timestamp>/sportdeets-prod
```

---

### Phase 3: Data Migration (1-2 hours)

#### 3.1 Export from Cosmos DB
```bash
# From local machine with Azure access
mongodump \
  --uri="<cosmos-connection-string>" \
  --out=./cosmos-export \
  --gzip

**Estimated Time**: 5-10 minutes (9.33 GB dataset)

```bash
# From local machine with Azure access
mongodump \
  --uri="<cosmos-connection-string>" \
  --out=./cosmos-export \
  --gzip

# Check export
ls -lh cosmos-export/
# Expected size: ~3-5 GB (gzipped from 9.33 GB)
# Option 2: Via backup PVC (if SMB mounted locally)
# Copy to SMB share, then restore from within cluster
**Estimated Time**: 5-10 minutes (9.33 GB dataset)

```

#### 3.3 Import to Cluster MongoDB
```bash
kubectl exec -it -n mongodb mongodb-0 -- mongorestore \
  --uri="mongodb://sportdeets:<password>@localhost:27017/sportdeets-prod" \
  --gzip \
  /tmp/cosmos-export/<database-name>
```

#### 3.4 Verify Data Integrity
```bash
# Connect to cluster MongoDB
kubectl exec -it -n mongodb mongodb-0 -- mongosh \
  "mongodb://sportdeets:<password>@localhost:27017/sportdeets-prod"

# Inside mongosh
show collections
db.getCollectionNames().forEach(c => print(c + ": " + db[c].count()))

# Compare counts with Cosmos DB
# Check sample documents from each collection
db.<collection>.findOne()
```

---

### Phase 4: Application Configuration Update (1 hour)

#### 4.1 Update Connection Strings

**Identify Current Configuration**:
```bash
# Check Azure App Config
# Look for Cosmos connection strings

# Check Kubernetes Secrets
kubectl get secrets -A | grep mongo

# Check ConfigMaps
kubectl get configmaps -A -o yaml | grep -i cosmos
```

**Create New Connection String Secret**:
```bash
# Connection string format
# mongodb://sportdeets:<password>@mongodb.mongodb.svc.cluster.local:27017/sportdeets-prod

# Update in Azure App Config (if used)
az appconfig kv set \
  --name <config-name> \
  --key "Provider:MongoDbConnectionString" \
  --value "mongodb://sportdeets:<password>@mongodb.mongodb.svc.cluster.local:27017/sportdeets-prod" \
  --label "Production.FootballNcaa.SportsData.Provider"

# Or create Kubernetes Secret
kubectl create secret generic provider-mongodb -n default \
  --from-literal=connection-string='mongodb://sportdeets:<password>@mongodb.mongodb.svc.cluster.local:27017/sportdeets-prod'
```

#### 4.2 Update Provider Service Deployment
```yaml
# File: app/overlays/04_prod/provider-patch.yaml
# Add/update environment variable for MongoDB connection

apiVersion: apps/v1
kind: Deployment
metadata:
  name: provider-svc-football-ncaa
  namespace: default
spec:
  template:
    spec:
      containers:
      - name: provider
        env:
        - name: MongoDb__ConnectionString
          valueFrom:
            secretKeyRef:
              name: provider-mongodb
              key: connection-string
```

---

### Phase 5: Testing & Cutover (1-2 hours)

#### 5.1 Deploy Updated Provider Service
```bash
git add -A
git commit -m "feat(provider): Switch from Cosmos DB to cluster MongoDB"
git push

flux reconcile kustomization apps --with-source
kubectl get pods -n default -l app=provider-svc-football-ncaa -w
```

#### 5.2 Verify Application Functionality
```bash
# Check provider logs
kubectl logs -n default deployment/provider-svc-football-ncaa -f

# Trigger data sync job (if applicable)
# Monitor Hangfire dashboard for document processing

# Verify new documents are being written to MongoDB
kubectl exec -it -n mongodb mongodb-0 -- mongosh \
  "mongodb://sportdeets:<password>@localhost:27017/sportdeets-prod"

# Check recent documents
db.<collection>.find().sort({_id: -1}).limit(10)
```

#### 5.3 Monitor Performance
```bash
# Check MongoDB metrics in Grafana
# Look for: connections, operations/sec, query time, resource usage

# Check provider service metrics
# Look for: document processing rate, errors, latency
```

#### 5.4 Validation Checklist
- [ ] Provider service starts successfully
- [ ] New documents are being written to MongoDB
- [ ] Document processing jobs complete without errors
- [ ] MongoDB resource usage is acceptable (CPU, memory, disk I/O)
- [ ] No application errors in logs
- [ ] Grafana shows MongoDB metrics
- [ ] Backup job runs successfully

---

### Phase 6: Cosmos DB Decommission (Post-Cutover)

#### 6.1 Monitor Cluster MongoDB (1-2 weeks)
- [ ] No data loss
- [ ] Acceptable performance
- [ ] Backups running successfully
- [ ] Application functioning normally

#### 6.2 Final Cosmos DB Backup
```bash
# One final export for safety
mongodump \
  --uri="<cosmos-connection-string>" \
  --out=./cosmos-final-backup-$(date +%Y%m%d) \
  --gzip

# Archive and store safely (external drive, NAS, cloud storage)
tar -czf cosmos-final-backup-$(date +%Y%m%d).tar.gz cosmos-final-backup-*/
```

#### 6.3 Delete Cosmos DB
```bash
# Navigate to sports-data-provision
cd C:\Projects\sports-data-provision\environments\prod

# Delete Cosmos DB account
az cosmosdb delete \
  --name <cosmos-account-name> \
  --resource-group rg-sportdeets \
  --yes

# Or via Azure Portal
```

#### 6.4 Clean Up Azure App Config
```bash
# Remove Cosmos connection strings from Azure App Config
az appconfig kv delete \
  --name <config-name> \
  --key "Provider:CosmosDbConnectionString" \
  --label "Production.FootballNcaa.SportsData.Provider" \
  --yes
```

---

## Backup & Disaster Recovery

### Backup Strategy

**Tier 1: Automated Daily Backups**
- **Schedule**: Daily at 2 AM via CronJob
- **Retention**: 30 days
- **Storage**: SMB share (network-accessible)
- **Format**: mongodump with gzip compression

**Tier 2: Weekly Off-Cluster Backups**
- **Schedule**: Weekly (manual or automated sync)
- **Retention**: 3 months
- **Storage**: External drive, NAS, or cloud storage
- **Format**: Compressed tar.gz of mongodump output

**Tier 3: Pre/Post Migration Backups**
- **When**: Before and after major changes
- **Retention**: Indefinite (until confident)
- **Storage**: Multiple locations

### Restore Procedures

**Full Database Restore**:
```bash
# Stop application pods using MongoDB
kubectl scale deployment -n default provider-svc-football-ncaa --replicas=0

# Restore from backup
kubectl exec -it -n mongodb mongodb-0 -- mongorestore \
  --uri="mongodb://sportdeets:<password>@localhost:27017/sportdeets-prod" \
  --drop \
  --gzip \
  /backups/mongodb-backup-<timestamp>/sportdeets-prod

# Restart application pods
kubectl scale deployment -n default provider-svc-football-ncaa --replicas=2
```

**Selective Collection Restore**:
```bash
kubectl exec -it -n mongodb mongodb-0 -- mongorestore \
  --uri="mongodb://sportdeets:<password>@localhost:27017/sportdeets-prod" \
  --nsInclude="sportdeets-prod.<collection-name>" \
  --drop \
  --gzip \
  /backups/mongodb-backup-<timestamp>/sportdeets-prod
```

---

## Monitoring

### Metrics to Track

**MongoDB Metrics** (via Prometheus exporter):
- Connections (current, available)
- Operations per second (inserts, queries, updates, deletes)
- Query execution time (p50, p95, p99)
- Replication lag (if using replica set)
- Storage size and growth rate
- Memory usage (resident, virtual)
- Disk I/O

**Application Metrics**:
- Document processing rate
- Error rate
- MongoDB connection pool stats
- Document processing latency

**Backup Metrics**:
- Backup job success/failure
- Backup duration
- Backup size
- Last successful backup timestamp

### Grafana Dashboard

Create dashboard with panels for:
- MongoDB operations/sec
- Query performance (p95, p99)
- Connections graph
- Storage usage over time
- Backup job history
- Provider service document processing rate

---

## Cost Analysis

### Current Costs (TODO: Fill in actual values)
- **Cosmos DB**: $___/month
  - Provisioned throughput: ___ RU/s
  - Storage: ___ GB
  - **Annual**: $___/year

### Projected Costs
- **MongoDB Self-Hosted**: $0
  - Cluster resources already available
  - Storage: Existing PVs or SMB share
  - Backup storage: SMB share (already provisioned)
- **Net Savings**: $___/year

### Combined Azure Exit Savings
- SSL migration (AFD + Static Web App): $720/year ✅
- Cosmos → MongoDB: $___/year
- **Total Annual Savings**: $720 + $___ = $___/year

---

## Risks & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Data loss during migration | High | Low | Multiple backups, keep Cosmos running 1-2 weeks |
| Performance degradation | Medium | Low | Load test before cutover, size appropriately |
| Backup failures | High | Medium | Test restore weekly, off-cluster copies |
| Disk space exhaustion | Medium | Low | Monitor storage metrics, set up alerts |
| Pod eviction (local-path) | Medium | Low | Use SMB storage or implement replica set |

---

## Rollback Plan

**If Issues Discovered Within 1-2 Weeks**:

1. **Revert connection string** to Cosmos DB
   ```bash
   # Update Azure App Config or Kubernetes Secret back to Cosmos connection string
   kubectl rollout restart deployment -n default provider-svc-football-ncaa
   ```

2. **Verify application functionality** with Cosmos DB

3. **Investigate MongoDB issues**:
   - Check logs: `kubectl logs -n mongodb mongodb-0`
   - Review metrics in Grafana
   - Identify root cause

4. **Fix and retry**, or delay migration until issues resolved

5. **Keep MongoDB running** for troubleshooting (doesn't cost anything)

---

## Success Criteria

- [x] MongoDB deployed and accessible (bare metal on 192.168.0.250)
- [x] All data migrated from Cosmos DB with verified integrity
- [x] Provider service successfully connects to MongoDB
- [x] New documents being written to MongoDB
- [x] Collection structure validated (DocumentType collections in sport database)
- [x] Read/write path bug fixed and validated
- [x] Application performance acceptable
- [x] Production smoke test passed
- [x] MongoDB Compass validation complete
- [ ] Cosmos DB deleted (ready, pending execution)
- [ ] Cost savings realized on next Azure bill

---

## Actual Timeline & Effort

| Phase | Estimated Time | Actual Time | Date |
|-------|----------------|-------------|------|
| 1. Bare Metal Installation | 2-3 hours | ~3 hours | Feb 7, 2026 |
| 2. Storage Expansion | N/A | 1 hour | Feb 7, 2026 |
| 3. Code Bug Fix | N/A | 2 hours | Feb 8, 2026 |
| 4. Config Updates | 1 hour | 1 hour | Feb 8, 2026 |
| 5. Testing & Validation | 1-2 hours | 1 hour | Feb 8, 2026 |
| 6. Cosmos Cleanup | 30 minutes | Pending | TBD |
| **Total Active Work** | **4-6 hours** | **~8 hours** | |

**Differences from Plan**:
- Chose bare metal over Kubernetes (better choice)
- Discovered and fixed critical read/write path bug (not anticipated)
- Storage expansion needed for historical data (good proactive move)
- Authentication setup more complex than expected (database-specific auth)

---

## Lessons Learned

### What Went Well
1. **Bare Metal Choice**: Simpler and more performant than Kubernetes deployment
2. **Database-per-Sport Pattern**: Clean separation, easy to scale to new sports
3. **DocumentType Collections**: Non-redundant naming, cleaner than `{Sport}.{DocumentType}`
4. **Proactive Storage Expansion**: 900 GB ready for historical data import
5. **Zero-User Migration**: No downtime concerns, easy rollback if needed

### What Could Have Been Better
1. **Read/Write Path Bug**: Should have caught this earlier via code review
2. **Authentication Complexity**: Database-specific auth vs admin auth was confusing initially
3. **Documentation**: Original plan assumed Kubernetes, didn't document bare metal option

### Critical Bug Fixed
**Problem**: ResourceIndexItemProcessor wrote to `DocumentType` collections, but DocumentProviderAndTypeDecoder read from `Sport` collections.

**Impact**: All writes were invisible to reads - complete data loss scenario.

**Root Cause**: Legacy Cosmos code assumed single container per sport. Comment said "Use sport parameter for container name to support multi-sport isolation" but MongoDB uses database-per-sport pattern.

**Fix**: Changed `GetCollectionName()` to return `docType.ToString()` instead of `sport.ToString()`. Updated all callers to pass DocumentType parameter.

**Prevention**: Better code reviews, integration tests covering read-after-write scenarios.

---

## Next Steps

### Immediate (Post-Migration)
1. [x] Validate production deployment
2. [x] Smoke test all document operations
3. [x] Verify collection structure in Compass
4. [ ] Delete Cosmos DB account
5. [ ] Remove Cosmos connection strings from Azure Key Vault
6. [ ] Document cost savings

### Short-Term (Next 1-2 Weeks)
1. [ ] Implement automated backup strategy
   - Daily mongodump to SMB share
   - Weekly off-cluster backups
   - Restore testing
2. [ ] Set up MongoDB monitoring
   - Prometheus exporter
   - Grafana dashboards
   - Alerting for disk space, connections, performance
3. [ ] Load test with larger datasets

### Medium-Term (Ready for Historical Import)
1. [ ] Configure ESPN historical data sourcing jobs
2. [ ] Monitor MongoDB performance during bulk import
3. [ ] Adjust storage/resources if needed
4. [ ] Validate all historical data imported successfully

---

## Cost Analysis (ACTUAL)

### Cosmos DB Elimination
- **Previous Cost**: ~$50-200/month (RU/s dependent)
- **Annual Savings**: ~$600-2,400/year
- **MongoDB Cost**: $0 (bare metal hardware already owned)

### Combined Azure Exit Savings
- SSL migration (AFD + Static Web App): $720/year ✅
- Cosmos → MongoDB: ~$600-2,400/year ✅
- **Total Annual Savings**: ~$1,320-3,120/year

### Historical Data Import Cost Avoidance
- **If using Cosmos**: Could easily cost $500-2,000+ for bulk import
- **With MongoDB**: $0 cost, unlimited throughput
- **Additional Benefit**: No throttling delays during import

---

## References & Resources

### MongoDB Documentation
- [MongoDB 8.0 Installation Guide](https://www.mongodb.com/docs/v8.0/installation/)
- [MongoDB Authentication](https://www.mongodb.com/docs/manual/core/authentication/)
- [mongodump/mongorestore](https://www.mongodb.com/docs/database-tools/)
- [SCRAM Authentication](https://www.mongodb.com/docs/manual/core/security-scram/)

### Tools Used
- MongoDB 8.0.18 (bare metal)
- MongoDB Compass (GUI management)
- systemd (service management)
- Azure Key Vault (credential storage)

### Related Documentation
- SSL Migration: `ssl-migration.md` (completed)
- Historical Data Sourcing: TBD (next project)
- Azure Exit Strategy: Ongoing

---

## Notes

### Project Context
- **Ultimate Goal**: Source all historical NCAA football data from ESPN
- **MongoDB Purpose**: Enable unlimited bulk data ingestion without cost/throttling
- **Architecture Philosophy**: Simple, performant, cost-effective
- **Migration Strategy**: Bare metal > Kubernetes for this use case

### Key Decisions
1. **Bare Metal vs Kubernetes**: Bare metal chosen for simplicity and performance
2. **Single Instance**: No replica set needed at zero-user scale
3. **Database-per-Sport**: Clean separation, easy multi-sport scaling
4. **DocumentType Collections**: Non-redundant naming pattern
5. **SCRAM-SHA-256**: Modern auth mechanism, database-specific users

### Technical Details
- **Server**: sdprod-data-0 (192.168.0.250:27017)
- **OS**: Ubuntu Server
- **MongoDB Version**: 8.0.18
- **Storage**: 900 GB local (809 GB free)
- **Auth**: Database-specific users, SCRAM-SHA-256
- **Collections**: `Coach`, `TeamSeason`, `Venue`, `Athlete`, `Game`, etc.
- **Database**: `FootballNcaa` (with more sports planned)

---

## Migration Complete! 🎉

**Status**: Production-ready, validated, Cosmos DB can be deleted.

**Next Mission**: Historical NCAA football data sourcing from ESPN! 🏈

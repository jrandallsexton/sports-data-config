# RabbitMQ shovels

Cross-broker integration event bridges. Each Shovel CRD here forwards
messages from a per-sport-league Producer RabbitMQ cluster (e.g.
`rabbitmq-baseball-mlb`) to the dedicated API broker (`rabbitmq-api`),
where the API consumer subscribes.

See `docs/broker-detangle-plan.md` in the sports-data repo for the
Round 1 (MLB+API) + Round 2 (football) migration context — why every
sport-league + API gets its own broker, and why cross-service
integration events need shovels.

## Prerequisites

1. **Messaging Topology Operator (MTO).** Installed via
   `app/base/rabbitmq-topology-operator/`. Provides the `Shovel` CRD.
2. **Credentials secrets.** Must be created in the `messaging` namespace
   before the Shovel CRDs reconcile. See "Create the credentials
   secrets" below — one Secret per source broker.

## Create the credentials secrets

The shovel's `uriSecret` references a Kubernetes Secret containing the
source and destination AMQP URIs. We build that secret from the
cluster-operator-managed default-user secrets that already exist for
each `RabbitmqCluster`.

> **vhost gotcha.** The auto-generated `connection_string` ends in
> `:5672/`, which AMQP parses as the *empty* vhost (""), not the default
> vhost `/`. Shovels declared via MTO target the default vhost `/`, so
> the URIs must be rewritten to end in `%2F` (URL-encoded `/`).
> Symptom if you skip this: shovel never starts, broker logs show
> "access to vhost refused".

> **Exchange pre-declare gotcha.** MassTransit only auto-declares the
> source exchange on first publish. On a freshly-provisioned Producer
> broker, the exchange may not exist yet — the shovel's `queue.bind`
> will fail with `NOT_FOUND - no exchange '<name>' in vhost '/'` and
> `rabbitmqctl shovel_status` reports `terminated`. Pre-declare the
> fanout source exchanges on each new broker before bringing up its
> shovels. See the pre-declare loop in
> `docs/broker-detangle-plan.md` (Round 2 Phase 1).

One Secret per source broker. Repeat the block below substituting the
right `*-default-user` secret + Secret name for each sport-league.

### MLB

```bash
SRC_URI=$(kubectl get secret rabbitmq-baseball-mlb-default-user -n messaging \
  -o jsonpath='{.data.connection_string}' | base64 -d)
DEST_URI=$(kubectl get secret rabbitmq-api-default-user -n messaging \
  -o jsonpath='{.data.connection_string}' | base64 -d)
SRC_URI="${SRC_URI%/}/%2F"
DEST_URI="${DEST_URI%/}/%2F"

kubectl create secret generic shovel-baseball-mlb-to-api-credentials \
  -n messaging \
  --from-literal=srcUri="${SRC_URI}" \
  --from-literal=destUri="${DEST_URI}"

kubectl annotate secret shovel-baseball-mlb-to-api-credentials \
  -n messaging \
  kustomize.toolkit.fluxcd.io/prune=disabled
```

### NCAA football

```bash
SRC_URI=$(kubectl get secret rabbitmq-football-ncaa-default-user -n messaging \
  -o jsonpath='{.data.connection_string}' | base64 -d)
DEST_URI=$(kubectl get secret rabbitmq-api-default-user -n messaging \
  -o jsonpath='{.data.connection_string}' | base64 -d)
SRC_URI="${SRC_URI%/}/%2F"
DEST_URI="${DEST_URI%/}/%2F"

kubectl create secret generic shovel-football-ncaa-to-api-credentials \
  -n messaging \
  --from-literal=srcUri="${SRC_URI}" \
  --from-literal=destUri="${DEST_URI}"

kubectl annotate secret shovel-football-ncaa-to-api-credentials \
  -n messaging \
  kustomize.toolkit.fluxcd.io/prune=disabled
```

### NFL

```bash
SRC_URI=$(kubectl get secret rabbitmq-football-nfl-default-user -n messaging \
  -o jsonpath='{.data.connection_string}' | base64 -d)
DEST_URI=$(kubectl get secret rabbitmq-api-default-user -n messaging \
  -o jsonpath='{.data.connection_string}' | base64 -d)
SRC_URI="${SRC_URI%/}/%2F"
DEST_URI="${DEST_URI%/}/%2F"

kubectl create secret generic shovel-football-nfl-to-api-credentials \
  -n messaging \
  --from-literal=srcUri="${SRC_URI}" \
  --from-literal=destUri="${DEST_URI}"

kubectl annotate secret shovel-football-nfl-to-api-credentials \
  -n messaging \
  kustomize.toolkit.fluxcd.io/prune=disabled
```

Idempotent re-run: `kubectl delete secret <name> -n messaging` first if the source default-user passwords have rotated, then re-run the create command.

## Why isn't this secret committed to git?

The credentials are auto-generated and auto-rotated by the
rabbitmq-cluster-operator. Committing the rotated value would either:
- become stale and silently break shovel delivery, or
- require a re-commit every rotation.

Keeping it out-of-band means the Shovel CRDs reconcile against whatever
the operator most recently produced. The trade-off: someone has to run
the kubectl recipe once after each fresh cluster build (rare).

## Operational signals

Each Shovel CRD reports its state under `.status.conditions`:

```bash
kubectl get shovel -n messaging
kubectl describe shovel shovel-baseball-play-completed-mlb-to-api -n messaging
```

Per-shovel forwarded-message and ack counters are also exposed by the
broker via Prometheus — visible alongside the other RabbitMQ metrics
in the Grafana dashboard once we add panels for them.

## Adding a new shovel

When a new cross-service event type is introduced (rare):

1. Add a new `shovel-{event-name}-{league}-to-api.yaml` per source
   broker in this directory mirroring the existing files. Same
   `srcExchange` / `destExchange` (MassTransit uses identical names
   across brokers), same `uriSecret` reference for that league, same
   `rabbitmqClusterReference` (`rabbitmq-api`).
2. Pre-declare the source exchange on each Producer broker before
   the shovel reconciles (see the gotcha note above).
3. Add the filename(s) to `kustomization.yaml`.
4. Commit + push; Flux will reconcile.

When a new sport-league joins (post Round 2):

1. Provision the cluster (mirror `rabbitmq-cluster-baseball-mlb.yaml`).
2. Add a new pair of shovels with source set to the new cluster, dest
   `rabbitmq-api`.
3. Create a new credentials Secret
   (`shovel-{league}-to-api-credentials`) using the per-league recipe
   pattern above.
4. Reference the new Secret from the new shovel CRDs.
5. Add a new `Prod.{Sport}{League}` App Config override for the new
   broker host + matching `RabbitMqPassword-Prod-{Suffix}` KV value.

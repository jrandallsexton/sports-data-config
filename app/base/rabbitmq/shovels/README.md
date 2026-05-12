# RabbitMQ shovels

Cross-broker integration event bridges. Each Shovel CRD here forwards
messages from a per-sport-league Producer RabbitMQ cluster (e.g.
`rabbitmq-baseball-mlb`) to the dedicated API broker (`rabbitmq-api`),
where the API consumer subscribes.

See `docs/broker-detangle-plan.md` in the sports-data repo for the
Round 1 migration context — why every sport-league + API gets its own
broker, and why cross-service integration events need shovels.

## Prerequisites

1. **Messaging Topology Operator (MTO).** Installed via
   `app/base/rabbitmq-topology-operator/`. Provides the `Shovel` CRD.
2. **Credentials secret.** Must be created in the `messaging` namespace
   before the Shovel CRDs reconcile. See "Create the credentials
   secret" below.

## Create the credentials secret

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

```bash
# Read the auto-managed default-user connection strings.
SRC_URI=$(kubectl get secret rabbitmq-baseball-mlb-default-user -n messaging \
  -o jsonpath='{.data.connection_string}' | base64 -d)
DEST_URI=$(kubectl get secret rabbitmq-api-default-user -n messaging \
  -o jsonpath='{.data.connection_string}' | base64 -d)

# Fix the empty-vhost suffix to explicitly target the default vhost `/`.
SRC_URI="${SRC_URI%/}/%2F"
DEST_URI="${DEST_URI%/}/%2F"

# Create the combined secret MTO's Shovel CRD expects.
kubectl create secret generic shovel-baseball-mlb-to-api-credentials \
  -n messaging \
  --from-literal=srcUri="${SRC_URI}" \
  --from-literal=destUri="${DEST_URI}"

# Tell Flux not to prune this out-of-band secret.
kubectl annotate secret shovel-baseball-mlb-to-api-credentials \
  -n messaging \
  kustomize.toolkit.fluxcd.io/prune=disabled
```

Idempotent re-run: `kubectl delete secret shovel-baseball-mlb-to-api-credentials -n messaging` first if the source default-user passwords have rotated, then re-run the create command.

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

1. Add a new `shovel-{event-name}-mlb-to-api.yaml` in this directory
   mirroring the existing files. Same `srcExchange` / `destExchange`
   (MassTransit uses identical names across brokers), same `uriSecret`
   reference, same `rabbitmqClusterReference`.
2. Add the filename to `kustomization.yaml`.
3. Commit + push; Flux will reconcile.

When a new sport-league adds its own broker (Round 2 — NCAA, NFL):

1. Create a new pair of shovels with source `rabbitmq-football-ncaa`
   (or `rabbitmq-football-nfl`) instead of `rabbitmq-baseball-mlb`.
   Same destination (`rabbitmq-api`).
2. Create a separate credentials secret
   (e.g. `shovel-football-ncaa-to-api-credentials`) using the recipe
   above, substituting the new sport-league's `*-default-user` secret
   for the source URI.
3. Reference the new secret from the new shovel CRDs.

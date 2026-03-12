# Statement of Work (SOW): Hangfire Metrics Observability

## 1. Project Background & Objective
We are extending our custom metrics observability stack to include Hangfire. Previously, we successfully implemented a Kubernetes CronJob that queries PostgreSQL for table row counts, pushes them to Prometheus Pushgateway, and maps them directly to a Grafana repeating-panel dashboard.

**The Objective:** Replicate this pattern to collect Hangfire queue sizes and job states for all domain services (API, Producer, Provider) from our external PostgreSQL deployment, and visualize them on a single, repeating-panel Grafana dashboard.

## 2. Current Status
* **Exploration Complete**: Verified that the Hangfire databases live on the external Postgres instance. They can be found dynamically using `SELECT datname FROM pg_database WHERE datname ILIKE '%Hangfire';` (returns `sdApi.All.Hangfire`, `sdProducer.FootballNcaa.Hangfire`, `sdProvider.FootballNcaa.Hangfire`).
* **Query Design Complete**: 
  * Queues: `SELECT queue, COUNT(*) FROM hangfire.jobqueue GROUP BY queue;`
  * States: `SELECT statename, COUNT(*) FROM hangfire.job GROUP BY statename;`
* **Grafana Dashboard Created**: The ConfigMap for the Grafana dashboard has been created at `c:\Projects\sports-data-config\app\base\monitoring\prometheus\dashboard-hangfire.yaml` and is correctly wired into the local `kustomization.yaml`.
* **Issue Triggering Handoff**: The script/CronJob manifest was incorrectly placed inside `c:\Projects\sports-data-config\app\base\apps\jobs-dashboard\`. Since this is a k3s script-based infrastructure exporter, putting it inside the UI application folder represents a poor domain and infrastructure crossover.

## 3. Tasks for the Next Agent
To complete this integration successfully, you must complete the following:

1. **Relocate the CronJob & Bash Script Manifest**:
   * Recreate the `CronJob` and its associated bash script `ConfigMap` (see original intent in chat history for the script payload).
   * Place the manifest in the proper infrastructure/monitoring directory (e.g., `c:\Projects\sports-data-config\app\base\monitoring\prometheus\` or another dedicated metrics exporter directory).
   
2. **Wire the Kustomization**:
   * Add the cronjob manifest to the appropriate `kustomization.yaml` file that matches your new directory choice.

3. **Verify Configuration**:
   * **Do NOT execute imperative deployments** against the cluster.
   * Ensure the script handles parsing the Database Name (`sdProducer.FootballNcaa.Hangfire` -> `Producer`) for labeling purposes nicely using shell parsing (alpine `/bin/sh` compliant).
   * Ensure the environment variables map to the correct secret `postgres-credentials`.

## 4. Required Output
* The finalized YAML file tracking the Hangfire exporter.
* The Kustomization update where it resides.
* Status update confirming files are prepared and sitting unstaged, awaiting user review and Flux reconciliation.
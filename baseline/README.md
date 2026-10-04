# Baseline Figure Search

This is an isolated, keyword-only scientific figure search website for the Baseline study condition.

## Isolation from HiFigure

- Baseline frontend: `http://127.0.0.1:3100`
- HiFigure frontend: `http://127.0.0.1:3000`
- Shared backend: `http://127.0.0.1:8000`
- Baseline API namespace: `/baseline-api/*`
- Baseline logs: `baseline_study_logs/`

The Baseline app does not import HiFigure routes, components, semantic retrieval, LLM query decomposition, or workspace state. Both conditions read the same fixed figure dataset.

Participants may collect and download multiple references from the search site, then independently decide which images to upload under the GPT condition's own input limit.

Successful single-image and ZIP download requests are recorded server-side with the participant/session ID, search query, exact reference IDs, filenames, and reference count. This does not depend on a best-effort browser event.

## Run locally

Start the normal HiFigure backend on port 8000, then run:

```bash
./baseline/dev.sh
```

Open `http://127.0.0.1:3100`.

The Baseline port can be overridden without changing either HiFigure route:

```bash
BASELINE_PORT=3200 ./baseline/dev.sh
```

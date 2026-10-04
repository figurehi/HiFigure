# hifigure

Anonymous source release of a reference-driven scientific illustration prototype.
HiFigure supports **Envision**, **Externalize**, and **Evolve**: finding references,
building editable figure skeletons, assigning style references, generating
candidates, and refining figures with revision history.

## Repository contents

- `frontend/`: Next.js and TypeScript interface, asset tools, and tests.
- `backend/`: FastAPI services, retrieval, model clients, and tests.
- `baseline/`: keyword-only figure search interface for the baseline condition.
- `shared/study_tasks.json`: task catalog shared by the frontend and backend.
- `docs/`: retrieval documentation and blank study instruments.

Local datasets, model caches, generated outputs, participant records, API keys,
and the original Git history are not included. See [ANONYMIZATION.md](ANONYMIZATION.md)
for the release scope and instructions for creating a fresh repository.

## Setup

From the repository root, create the supplied environment:

```bash
conda env create -f environment.yml
conda activate hifigure
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
cd frontend
npm ci
```

Alternatively, use an existing Python environment with Node.js 22 available:

```bash
conda activate re-copilot
python -m pip install -e ./backend requests
cd frontend
npm ci
```

Start the backend from the repository root:

```bash
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal with the environment activated:

```bash
cd frontend
npm run dev
```

Open `http://127.0.0.1:3000`. The API runs at `http://127.0.0.1:8000`.
The optional `./dev.sh` launcher starts both services and can build retrieval
indexes; it may stop processes already using its configured ports.

## Model configuration

Set credentials and model names in `backend/.env`, using the included example.
Generation and model-assisted features need the corresponding credentials and
access to the selected models. Text intent parsing uses an OpenAI-compatible chat
endpoint. Image generation supports the transports implemented in
`backend/app/image_client.py`; the example selects `openai_sdk`.
Retrieval query planning uses the Responses API. Vectorization uses Vectorizer.AI
and requires `VECTORIZER_API_ID` and `VECTORIZER_API_SECRET`.

Frontend configuration belongs in `frontend/.env.local`. The API base URL defaults
to localhost. Supply your own tldraw key when required by your deployment; the
release includes no license key. See [third-party notices](frontend/THIRD_PARTY_NOTICES.md).

## Retrieval data

The retrieval dataset and FAISS indexes are supplied separately. Place data in:

```text
frontend/datasets/
  records.json
  images/
```

The record schema is documented in `backend/app/retrieval/dataset.py`. To download
from a dataset release you control, explicitly provide its repository:

```bash
python download_data.py --repo YOUR_DATA_OWNER/YOUR_DATA_REPO --tag datasets
```

The release must contain `manifest.json` and the archive it describes. The
manifest contains `asset`, `sha256`, `bytes`, and `file_count`. Set `GH_TOKEN` or
`GITHUB_TOKEN` locally if that release requires authentication. The original
personal repository address has been removed. `HIFIGURE_DATA_REPO` can also be
exported to configure the downloader and `dev.sh`.

After supplying the dataset and installing the retrieval dependencies from
`environment.yml`, run:

```bash
./build_index.sh
```

Retrieval uses `jinaai/jina-embeddings-v3` with 256-dimensional vectors and separate
Idea, Layout, and Style indexes. Without the dataset, dataset-backed search is
unavailable. Model weights may be downloaded on first use. See
[retrieval documentation](docs/figure-retrieval-indexes.md) for details.

## Baseline and study materials

With the shared backend running, launch the baseline at `http://127.0.0.1:3100`:

```bash
./baseline/dev.sh
```

The [study instruments](docs/user-study/README.md) are blank templates. The
application retains its study logging functionality; any new local logs are
excluded by `.gitignore`.

## Tests

```bash
python -m pip install pytest
python -m pytest backend/tests
cd frontend
npm test
```

Third-party attribution is preserved in `frontend/THIRD_PARTY_NOTICES.md` and
`frontend/public/assets/LICENSES.md`.

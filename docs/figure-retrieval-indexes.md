# Figure Retrieval Indexes

The main search flow uses three composite indexes. Each index contains one coherent
natural-language document per figure and is searched independently; there is no
runtime score fusion, RRF, or reranking stage. An OpenAI structured-output
query-planning call turns the user's single drawing prompt into an Idea, Layout,
and optional Style query. Only the query for the selected search goal is used.

## Active Search Indexes

| Search goal | Index | Composite metadata | Matching intent |
| --- | --- | --- | --- |
| Idea formation | `idea_overview` | Research context, main idea, figure role, input/output, process, and key components | Similar problem, central mechanism, and explanatory story. |
| Layout | `structure_overview` | Figure role, layout, organization, flow, process, and key components | Similar modules, grouping, topology, branches, loops, and reading order. |
| Style | `style_overview` | Style description, visual elements, color tag, and rendering tag | Similar visual language and treatment. If the prompt has no explicit style, results are diversified instead of claiming an exact style match. |

All indexes use `jinaai/jina-embeddings-v3`. Documents are encoded with its
`retrieval.passage` LoRA adapter, while live searches use `retrieval.query`. Results
remain in FAISS cosine-similarity order with no second-stage model.

```bash
python backend/scripts/build_index.py
```

The encoder accepts up to 8,192 tokens instead of the old 256-token limit and stores
the model's 256-dimensional Matryoshka embedding. The model is loaded from its pinned
Hugging Face revision with `trust_remote_code=True`; its license is CC BY-NC 4.0.

## Embedding Rebuild Flow

1. `build_index.sh` resolves `frontend/datasets/records.json` and checks the three
   `.faiss`/`.ids.json` pairs plus `metadata.hash`.
2. `index_fingerprint()` hashes the dataset bytes together with the embedding model
   weight and remote-code revisions, output dimension, encoder maximum length,
   query/passage tasks, and document-schema version. Any change marks the existing
   index stale.
3. `backend/scripts/build_index.py` builds exactly the three composite indexes and
   removes any inactive `.faiss`/`.ids.json` files left by older versions.
4. `jinaai/jina-embeddings-v3` encodes every index document with
   `task="retrieval.passage"`, truncates only beyond 8,192 tokens, projects to the
   model's trained 256-dimensional Matryoshka representation, and L2 normalizes
   each vector.
5. Each domain writes an independent FAISS `IndexFlatIP` file and a row-aligned ID
   list. Inner product is cosine similarity because vectors are normalized.
6. At query time, the selected goal query is encoded with
   `task="retrieval.query"`, served from a small query cache when repeated, and
   searched only against its matching domain index.
7. Loading rejects any index that is not 256-dimensional, including old 384- and
   1,024-dimensional indexes, so incompatible spaces cannot be mixed with Jina
   query vectors. Until rebuilding finishes, retrieval uses its keyword fallback.

## Runtime Stages

1. Decompose one user prompt into three contextual queries. Style stays `null` when absent.
2. Retrieve at least 60 candidates from the one selected composite index.
3. Return the FAISS cosine-similarity order directly; there is no reranking stage.
4. If query planning is unavailable, use the prompt directly. If compatible Jina
   indexes have not yet been built, use the keyword fallback.

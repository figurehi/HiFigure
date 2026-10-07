import logging
import os
import io
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator
import zipfile

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .config import (
    get_image_model_settings,
    get_retrieval_model_settings,
    get_text_model_settings,
    get_vectorizer_settings,
)
from .baseline_log import BaselineLogError, append_baseline_events, record_baseline_download
from .baseline_search import baseline_reference_image, search_keyword_records
from .image_client import ImageClientError, OpenAIImageClient
from .retrieval.figure_fields import FIGURE_RETRIEVAL_DOMAINS
from .schemas import (
    DiagramSkeletonJobStartResponse,
    DiagramSkeletonJobStatusResponse,
    DiagramSkeletonRegionRequest,
    DiagramSkeletonRequest,
    FigureVariant,
    FigureReviewRequest,
    ImageTestResponse,
    ReferenceItem,
    ReferenceSearchRequest,
    SearchResponse,
    ReviewIssue,
    StudyLogBatchRequest,
    StudyLogBatchResponse,
    StudyOutputRequest,
    StudyOutputResponse,
    StudyParticipantSummary,
    StudyTask,
    StyleAnalysisRequest,
    StyleAnalysisResponse,
    VariantGenerationJobStartResponse,
    VariantGenerationJobStatusResponse,
    VariantGenerationRequest,
    VectorizeImageRequest,
    VectorizeImageResponse,
)
from .services import (
    DiagramSkeletonGenerationError,
    STYLE_SUMMARY,
    StyleAnalysisError,
    analyze_style_reference,
    generate_diagram_skeleton,
    refine_diagram_skeleton_region,
    review_figure,
    generate_variants,
    get_diagram_skeleton_job,
    get_variant_generation_job,
    more_like_this,
    search_references,
    start_diagram_skeleton_job,
    start_variant_generation_job,
)
from .study_log import (
    StudyLogError,
    append_events,
    list_participants,
    load_outputs,
    participant_artifact_path,
    save_output,
)
from .study_tasks import list_study_tasks
from .vectorizer_client import VectorizerClient, VectorizerClientError


logger = logging.getLogger("figpilot")


def _preload_retrieval_encoder() -> None:
    try:
        from .retrieval.encoder import preload

        preload()
    except ModuleNotFoundError as exc:
        logger.warning("Retrieval encoder preload skipped: %s", exc)
    except Exception:
        # Retrieval is useful but should not make every unrelated API route
        # unavailable. _load_model does not cache exceptions, so the first
        # search can retry after a transient cache or network issue is fixed.
        logger.exception("Retrieval encoder preload failed; retrieval will retry on first search")


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    _preload_retrieval_encoder()
    yield


def _cors_allow_origins() -> list[str]:
    origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    extra = os.getenv("FIGPILOT_CORS_ORIGINS", "")
    if extra.strip():
        origins.extend(part.strip() for part in extra.split(",") if part.strip())
    return origins


app = FastAPI(
    title="FigPilot API",
    description="Backend for a reference-driven scientific illustration workflow",
    version="0.1.0",
    lifespan=_lifespan,
)

_TEST_PICS_DIR = (Path(__file__).parent / "../../frontend/test_pics").resolve()
if _TEST_PICS_DIR.exists():
    app.mount("/test_pics", StaticFiles(directory=str(_TEST_PICS_DIR)), name="test_pics")

_DATASET_DIR = (Path(__file__).parent / "../../frontend/datasets").resolve()
if _DATASET_DIR.exists():
    app.mount("/dataset", StaticFiles(directory=str(_DATASET_DIR)), name="dataset")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    # Next.js may use 3001+ when the default port is taken; allow any local dev port.
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_VALID_RETRIEVAL_DOMAINS = set(FIGURE_RETRIEVAL_DOMAINS)


@app.exception_handler(RequestValidationError)
async def _log_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Print the offending field path + value to the uvicorn log so 422s are debuggable."""
    summary = []
    for err in exc.errors():
        loc = ".".join(str(part) for part in err.get("loc", ()))
        summary.append(f"{loc}: {err.get('msg')} (type={err.get('type')}, input={err.get('input')!r})")
    logger.warning("422 on %s %s\n  - " + "\n  - ".join(summary), request.method, request.url.path)
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.get("/health")
def health() -> dict[str, str]:
    text_settings = get_text_model_settings()
    image_settings = get_image_model_settings()
    vectorizer_settings = get_vectorizer_settings()
    retrieval_settings = get_retrieval_model_settings()
    return {
        "status": "ok",
        "textModelConfigured": "true" if text_settings.is_configured else "false",
        "imageModelConfigured": "true" if image_settings.is_configured else "false",
        "imageModelName": _safe_model_name(image_settings.model_name) or "none",
        "imageModelApiStyle": image_settings.api_style,
        "vectorizerConfigured": "true" if vectorizer_settings.is_configured else "false",
        "retrievalModelConfigured": "true" if retrieval_settings.is_configured else "false",
    }


@app.get("/baseline-api/search")
def baseline_keyword_search(
    q: str = Query(min_length=1, max_length=500),
    limit: int = Query(default=24, ge=1, le=48),
    offset: int = Query(default=0, ge=0),
) -> dict[str, object]:
    """Keyword-only BM25 search used exclusively by the isolated Baseline site."""
    return search_keyword_records(q, limit=limit, offset=offset)


@app.post("/baseline-api/logs")
async def baseline_logs(request: Request) -> dict[str, int]:
    """Store Baseline events separately from HiFigure participant logs."""
    payload = await request.json()
    try:
        stored = append_baseline_events(
            str(payload.get("participantId") or ""),
            str(payload.get("sessionId") or ""),
            payload.get("events") if isinstance(payload.get("events"), list) else [],
        )
    except BaselineLogError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"stored": stored}


@app.get("/baseline-api/download")
def baseline_download_selected(
    reference_id: list[str] = Query(default_factory=list),
    participant_id: str = Query(min_length=2, max_length=64),
    session_id: str = Query(min_length=2, max_length=64),
    query: str = Query(default="", max_length=500),
) -> Response:
    """Download a participant-curated reference set as one browser-safe ZIP file."""
    unique_ids = list(dict.fromkeys(reference_id))
    if not unique_ids or len(unique_ids) > 100:
        raise HTTPException(status_code=422, detail="Choose between one and 100 references")
    images: list[tuple[str, Path]] = []
    for record_id in unique_ids:
        path = baseline_reference_image(record_id)
        if path is None:
            raise HTTPException(status_code=404, detail=f"Reference image not found: {record_id}")
        images.append((record_id, path))
    archive = io.BytesIO()
    # Dataset files use a reproducible 1970 mtime; ZIP headers require 1980+.
    with zipfile.ZipFile(
        archive,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        strict_timestamps=False,
    ) as bundle:
        for record_id, path in images:
            bundle.write(path, arcname=f"{record_id}{path.suffix.lower() or '.png'}")
    filenames = [f"{record_id}{path.suffix.lower() or '.png'}" for record_id, path in images]
    try:
        record_baseline_download(
            participant_id,
            session_id,
            reference_ids=[record_id for record_id, _path in images],
            filenames=filenames,
            download_kind="zip",
            query=query,
        )
    except BaselineLogError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(
        content=archive.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="baseline-references.zip"'},
    )


@app.get("/baseline-api/download/{reference_id}")
def baseline_download_reference(
    reference_id: str,
    participant_id: str = Query(min_length=2, max_length=64),
    session_id: str = Query(min_length=2, max_length=64),
    query: str = Query(default="", max_length=500),
) -> FileResponse:
    """Serve one search result with an attachment header instead of a Blob URL."""
    path = baseline_reference_image(reference_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Reference image not found")
    filename = f"{reference_id}{path.suffix.lower() or '.png'}"
    try:
        record_baseline_download(
            participant_id,
            session_id,
            reference_ids=[reference_id],
            filenames=[filename],
            download_kind="single",
            query=query,
        )
    except BaselineLogError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return FileResponse(
        path,
        filename=filename,
        content_disposition_type="attachment",
    )


@app.get("/study/tasks", response_model=list[StudyTask])
def study_tasks_endpoint() -> list[StudyTask]:
    """Expose the shared, versioned methodology-figure task catalog."""
    return list_study_tasks()


@app.post("/study/logs", response_model=StudyLogBatchResponse)
def record_study_logs(payload: StudyLogBatchRequest) -> StudyLogBatchResponse:
    """Append a batch of participant interaction events to the study log."""
    try:
        stored = append_events(
            payload.participantId,
            payload.sessionId,
            payload.events,
            session_started_at=payload.sessionStartedAt,
        )
    except StudyLogError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return StudyLogBatchResponse(stored=stored)


@app.post("/study/outputs", response_model=StudyOutputResponse)
def record_study_output(payload: StudyOutputRequest) -> StudyOutputResponse:
    """Persist one selected reference or generated artifact for a participant."""
    try:
        record = save_output(
            payload.participantId,
            payload.sessionId,
            output_id=payload.outputId,
            kind=payload.kind,
            title=payload.title,
            image_data_url=payload.imageDataUrl,
            image_url=payload.imageUrl,
            text_content=payload.textContent,
            text_format=payload.textFormat,
            metadata=payload.metadata,
        )
    except StudyLogError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return StudyOutputResponse(stored=True, imageFile=record.get("imageFile"))


@app.get("/study/participants", response_model=list[StudyParticipantSummary])
def study_participants() -> list[StudyParticipantSummary]:
    """Researcher overview: per-participant event and output counts."""
    return [StudyParticipantSummary(**summary) for summary in list_participants()]


@app.get("/study/recovery/{participant_id}")
def recover_study_outputs(participant_id: str, session_id: str | None = Query(default=None)) -> dict[str, object]:
    """Return durable workspace, reference, icon, Skeleton, Candidate, and Edit archives."""
    try:
        artifacts = load_outputs(participant_id, session_id=session_id)
    except StudyLogError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"artifacts": artifacts}


@app.get("/study/artifacts/{participant_id}/{artifact_path:path}")
def study_artifact(participant_id: str, artifact_path: str) -> FileResponse:
    """Serve one archived study artifact used by workspace recovery."""
    try:
        path = participant_artifact_path(participant_id, artifact_path)
    except StudyLogError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(path)


@app.get("/model/test-image", response_model=ImageTestResponse)
def test_image_model_endpoint(
    prompt: str = Query(default="A clean scientific pipeline diagram with three modules and directional arrows."),
    size: str = Query(default="1024x1024"),
    timeout_seconds: float = Query(default=20.0, ge=1.0, le=180.0),
) -> ImageTestResponse:
    image_settings = get_image_model_settings()

    if not image_settings.is_configured:
        return ImageTestResponse(
            status="not_configured",
            configured=False,
            modelName=_safe_model_name(image_settings.model_name),
            responseFormatRequested=image_settings.response_format,
            responseFormatObserved=None,
            prompt=prompt,
            size=size,
            hasImageUrl=False,
            hasImageDataUrl=False,
            error="Image model service is not configured.",
        )

    client = OpenAIImageClient(settings=image_settings)

    try:
        result = client.generate_image(prompt=prompt, size=size, timeout_seconds=timeout_seconds)
        observed_format = "b64_json" if result.image_data_url else "url" if result.image_url else "unknown"
        prefix = result.image_data_url[:80] if result.image_data_url else None
        length = len(result.image_data_url) if result.image_data_url else None

        return ImageTestResponse(
            status="ok",
            configured=True,
            modelName=_safe_model_name(image_settings.model_name),
            responseFormatRequested=image_settings.response_format,
            responseFormatObserved=observed_format,
            prompt=prompt,
            size=size,
            hasImageUrl=bool(result.image_url),
            hasImageDataUrl=bool(result.image_data_url),
            imageUrl=result.image_url,
            imageDataUrlPrefix=prefix,
            imageDataUrlLength=length,
            revisedPrompt=result.revised_prompt,
            error=None,
        )
    except ImageClientError as exc:
        return ImageTestResponse(
            status="error",
            configured=True,
            modelName=_safe_model_name(image_settings.model_name),
            responseFormatRequested=image_settings.response_format,
            responseFormatObserved=None,
            prompt=prompt,
            size=size,
            hasImageUrl=False,
            hasImageDataUrl=False,
            error=str(exc),
        )


@app.get("/references/search", response_model=SearchResponse)
def search_references_endpoint(
    prompt: str = Query(min_length=1),
    image_type: str | None = None,
    retrieval_domain: str | None = None,
    exclude_reference_ids: list[str] = Query(default_factory=list),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
) -> SearchResponse:
    if retrieval_domain and retrieval_domain not in _VALID_RETRIEVAL_DOMAINS:
        raise HTTPException(status_code=400, detail=f"Unknown retrieval_domain: {retrieval_domain}")
    references = search_references(
        prompt=prompt,
        image_type=image_type,
        retrieval_domain=retrieval_domain,
        exclude_reference_ids=exclude_reference_ids,
        limit=limit + 1,
        offset=offset,
    )
    return SearchResponse(
        references=references[:limit],
        styleSummary=STYLE_SUMMARY,
        limit=limit,
        offset=offset,
        hasMore=len(references) > limit,
    )


@app.post("/references/search", response_model=SearchResponse)
def search_references_by_goal_endpoint(payload: ReferenceSearchRequest) -> SearchResponse:
    references = search_references(
        prompt=payload.prompt,
        image_type=payload.imageType,
        search_goal=payload.searchGoal,
        exclude_reference_ids=payload.excludeReferenceIds,
        limit=payload.limit + 1,
        offset=payload.offset,
    )
    return SearchResponse(
        references=references[:payload.limit],
        styleSummary=STYLE_SUMMARY,
        limit=payload.limit,
        offset=payload.offset,
        hasMore=len(references) > payload.limit,
    )


@app.get("/references/more-like-this/{reference_id}", response_model=list[ReferenceItem])
def more_like_this_endpoint(
    reference_id: str,
    retrieval_domain: str | None = None,
    exclude_reference_ids: list[str] = Query(default_factory=list),
) -> list[ReferenceItem]:
    if retrieval_domain and retrieval_domain not in _VALID_RETRIEVAL_DOMAINS:
        raise HTTPException(status_code=400, detail=f"Unknown retrieval_domain: {retrieval_domain}")
    return more_like_this(
        reference_id,
        retrieval_domain=retrieval_domain,
        exclude_reference_ids=exclude_reference_ids,
    )


@app.post("/figures/variants", response_model=list[FigureVariant])
def figure_variants_endpoint(payload: VariantGenerationRequest) -> list[FigureVariant]:
    return generate_variants(
        prompt=payload.prompt,
        reference_ids=payload.referenceIds,
        selected_reference_id=payload.selectedReferenceId,
        layout_reference_id=payload.layoutReferenceId,
        composition_mode=payload.compositionMode,
        base_reference_id=payload.baseReferenceId,
        references=payload.references,
        reference_regions=payload.referenceRegions,
        diagram_skeleton_xml=payload.diagramSkeletonXml,
        annotation_control_image_data_url=payload.annotationControlImageDataUrl,
        edit_mask_image_data_url=payload.editMaskImageDataUrl,
        match_instructions=payload.matchInstructions,
    )


@app.post("/figures/variants/jobs", response_model=VariantGenerationJobStartResponse)
def start_figure_variants_job_endpoint(payload: VariantGenerationRequest) -> dict:
    return start_variant_generation_job(
        prompt=payload.prompt,
        reference_ids=payload.referenceIds,
        selected_reference_id=payload.selectedReferenceId,
        layout_reference_id=payload.layoutReferenceId,
        composition_mode=payload.compositionMode,
        base_reference_id=payload.baseReferenceId,
        references=payload.references,
        reference_regions=payload.referenceRegions,
        diagram_skeleton_xml=payload.diagramSkeletonXml,
        annotation_control_image_data_url=payload.annotationControlImageDataUrl,
        edit_mask_image_data_url=payload.editMaskImageDataUrl,
        match_instructions=payload.matchInstructions,
    )


@app.get("/figures/variants/jobs/{job_id}", response_model=VariantGenerationJobStatusResponse)
def figure_variants_job_endpoint(
    job_id: str,
    progress_after: int | None = Query(default=None, ge=0),
) -> dict:
    job = get_variant_generation_job(job_id, progress_after=progress_after)
    if not job:
        raise HTTPException(status_code=404, detail="Generation job not found.")
    return job


@app.post("/figures/skeleton/jobs", response_model=DiagramSkeletonJobStartResponse)
def start_figure_skeleton_job_endpoint(payload: DiagramSkeletonRequest) -> dict:
    return start_diagram_skeleton_job(
        prompt=payload.prompt,
        references=payload.references,
    )


@app.get("/figures/skeleton/jobs/{job_id}", response_model=DiagramSkeletonJobStatusResponse)
def figure_skeleton_job_endpoint(job_id: str) -> dict:
    job = get_diagram_skeleton_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Skeleton job not found.")
    return job


@app.post("/figures/skeleton")
def figure_skeleton_endpoint(payload: DiagramSkeletonRequest) -> dict:
    """Return an editable layout skeleton from the prompt and pocket references."""
    try:
        return generate_diagram_skeleton(
            prompt=payload.prompt,
            references=payload.references,
        )
    except DiagramSkeletonGenerationError as exc:
        logger.warning("POST /figures/skeleton failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/figures/skeleton/refine-region")
def figure_skeleton_refine_region_endpoint(payload: DiagramSkeletonRegionRequest) -> dict:
    """Refine selected modules or the complete existing skeleton."""
    try:
        return refine_diagram_skeleton_region(
            plan=payload.diagramPlan,
            target_ids=payload.targetIds,
            instruction=payload.prompt,
            brief=payload.brief,
            source_xml=payload.xml,
            scope=payload.scope,
        )
    except DiagramSkeletonGenerationError as exc:
        logger.warning(
            "POST /figures/skeleton/refine-region failed (scope=%s, targets=%s): %s",
            payload.scope,
            payload.targetIds,
            exc,
        )
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/style/analyze", response_model=StyleAnalysisResponse)
def style_analyze_endpoint(payload: StyleAnalysisRequest) -> StyleAnalysisResponse:
    """Rank the installed font catalog by the lettering visible in a Style image."""
    try:
        result = analyze_style_reference(
            image_data_url=payload.imageDataUrl,
            font_options=payload.fontOptions,
            reference_title=payload.referenceTitle,
        )
    except StyleAnalysisError as exc:
        logger.warning("POST /style/analyze failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return StyleAnalysisResponse(**result)


@app.post("/figures/review", response_model=list[ReviewIssue])
def figure_review_endpoint(payload: FigureReviewRequest) -> list[ReviewIssue]:
    return [ReviewIssue(**issue) for issue in review_figure(payload.diagramPlan)]


@app.post("/images/vectorize", response_model=VectorizeImageResponse)
def vectorize_image_endpoint(payload: VectorizeImageRequest) -> VectorizeImageResponse:
    settings = get_vectorizer_settings()
    if not settings.is_configured:
        raise HTTPException(status_code=503, detail="Vectorizer API is not configured.")

    client = VectorizerClient(settings=settings)
    try:
        svg = client.vectorize(image_data_url=payload.imageDataUrl, image_url=payload.imageUrl)
    except VectorizerClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return VectorizeImageResponse(svg=svg)


def _safe_model_name(value: str | None) -> str | None:
    if not value:
        return value

    if value.startswith("sk-"):
        return f"{value[:6]}...{value[-4:]}"

    return value

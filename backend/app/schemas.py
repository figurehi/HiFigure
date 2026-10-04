from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ReferenceItem(BaseModel):
    id: str
    title: str
    sourcePaper: str
    venue: str
    year: int
    imageType: str
    subject: str
    styleTags: list[str]
    similarityReason: str
    thumbnail: str
    thumbnailUrl: str | None = None
    imageDataUrl: str | None = None
    structuralAnalysis: str


class StyleSummary(BaseModel):
    layoutPreference: str
    palette: str
    componentStyle: str
    arrowStyle: str
    notes: list[str]


class StyleContract(BaseModel):
    """Canonical, generation-facing visual contract.

    The contract intentionally stores major style dimensions rather than a bag of
    prompt adjectives.  Scientific content and exact layout remain outside this
    model and therefore cannot be introduced by a style reference.
    """

    sourceReferenceIds: list[str] = Field(default_factory=list)
    paletteRoles: dict[str, str] = Field(default_factory=dict)
    typography: dict[str, str] = Field(default_factory=dict)
    shapeLanguage: dict[str, str] = Field(default_factory=dict)
    spacing: dict[str, str] = Field(default_factory=dict)
    iconLanguage: dict[str, str] = Field(default_factory=dict)
    edgeLanguage: dict[str, str] = Field(default_factory=dict)
    semanticInventory: list[str] = Field(default_factory=list)


class ImageReferenceManifestEntry(BaseModel):
    """One image slot after de-duplication and provider reference capping."""

    index: int = Field(ge=1)
    role: str
    authority: list[str] = Field(default_factory=list)
    description: str = ""


class SearchResponse(BaseModel):
    references: list[ReferenceItem]
    styleSummary: StyleSummary
    limit: int = 20
    offset: int = 0
    hasMore: bool = False


SearchGoal = Literal["idea", "structure", "style"]


class ReferenceSearchRequest(BaseModel):
    prompt: str = Field(min_length=1)
    searchGoal: SearchGoal = "idea"
    imageType: str | None = None
    excludeReferenceIds: list[str] = Field(default_factory=list)
    limit: int = Field(default=20, ge=1, le=50)
    offset: int = Field(default=0, ge=0)


class ReferenceRegionPayload(BaseModel):
    referenceId: str
    # include = preserve CONTENT (objects, structure) from this region
    # exclude = AVOID this content (legacy / workspace)
    # modify  = prioritize LOCALIZED edits roughly matching this rectangle on the reference
    # style   = use this region as STYLE inspiration (palette, line weight, typography)
    intent: Literal["include", "exclude", "style", "modify"] = "include"
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    w: float = Field(gt=0.0, le=1.0)
    h: float = Field(gt=0.0, le=1.0)
    label: str | None = None


class VariantGenerationRequest(BaseModel):
    prompt: str = Field(min_length=1)
    referenceIds: list[str]
    selectedReferenceId: str | None = None
    layoutReferenceId: str | None = None
    compositionMode: Literal["guided", "locked_refine"] = "guided"
    baseReferenceId: str | None = None
    references: list[ReferenceItem] = Field(default_factory=list)
    referenceRegions: list[ReferenceRegionPayload] = Field(default_factory=list)
    diagramSkeletonXml: str = Field(min_length=1)
    annotationControlImageDataUrl: str | None = None
    editMaskImageDataUrl: str | None = None
    matchInstructions: str | None = None


class DiagramSkeletonRequest(BaseModel):
    """Request for the single supported editable skeleton."""

    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1)
    references: list[ReferenceItem] = Field(default_factory=list)


class DiagramSkeletonRegionRequest(BaseModel):
    """Request to refine a selected region or the complete existing skeleton."""

    prompt: str = Field(min_length=1)
    diagramPlan: dict = Field(default_factory=dict)
    targetIds: list[str] = Field(default_factory=list)
    scope: Literal["region", "whole"] = "region"
    brief: str = ""
    """Current draw.io XML; when provided, the refinement is patched into it so
    untouched cells (especially arrows) keep their exact style and routing."""
    xml: str = ""


class StyleFontOption(BaseModel):
    """One installed font the visual analysis is allowed to recommend."""

    id: str
    label: str
    tone: str = ""
    description: str = ""


class StyleAnalysisRequest(BaseModel):
    """Ask the configured vision-capable text model to rank installed fonts."""

    model_config = ConfigDict(extra="forbid")

    imageDataUrl: str = Field(min_length=1)
    fontOptions: list[StyleFontOption] = Field(min_length=1)
    referenceTitle: str = ""


class StyleFontSuggestion(BaseModel):
    id: str
    confidence: float | None = None
    reason: str | None = None


class StyleAnalysisResponse(BaseModel):
    fonts: list[StyleFontSuggestion] = Field(default_factory=list)
    typographyNote: str | None = None


class FigureReviewRequest(BaseModel):
    diagramPlan: dict | None = None


class ReviewIssue(BaseModel):
    id: str
    category: Literal["scientific", "visual"]
    severity: Literal["blocking", "warning", "info"]
    message: str
    targetIds: list[str] = Field(default_factory=list)
    suggestedAction: str


class FigureVariant(BaseModel):
    id: str
    title: str
    description: str
    layoutStrategy: str
    previewImageUrl: str | None = None
    previewImageDataUrl: str | None = None
    draftPreviewImageUrl: str | None = None
    draftPreviewImageDataUrl: str | None = None
    svg: str
    generationPrompt: str | None = None
    draftGenerationPrompt: str | None = None
    diagramPlan: dict | None = None


class VariantGenerationJobStartResponse(BaseModel):
    jobId: str
    status: Literal["queued", "running", "succeeded", "failed"]


class VariantGenerationProgress(BaseModel):
    version: int
    phase: Literal["draft_streaming", "refining", "completed"]
    label: str
    passIndex: int
    passCount: int
    previewKind: Literal["partial", "draft", "final"] | None = None
    partialImageIndex: int | None = None
    stable: bool = False
    previewImageUrl: str | None = None
    previewImageDataUrl: str | None = None


class VariantGenerationJobStatusResponse(BaseModel):
    jobId: str
    status: Literal["queued", "running", "succeeded", "failed"]
    result: list[FigureVariant] | None = None
    error: str | None = None
    progress: VariantGenerationProgress | None = None


class DiagramSkeletonJobStartResponse(BaseModel):
    jobId: str
    status: Literal["queued", "running", "succeeded", "failed"]


class DiagramSkeletonJobStatusResponse(BaseModel):
    jobId: str
    status: Literal["queued", "running", "succeeded", "failed"]
    result: dict | None = None
    error: str | None = None


class VectorizeImageRequest(BaseModel):
    imageDataUrl: str | None = None
    imageUrl: str | None = None


class VectorizeImageResponse(BaseModel):
    svg: str


class StudyLogBatchRequest(BaseModel):
    participantId: str
    sessionId: str
    sessionStartedAt: str | None = None
    events: list[dict] = []


class StudyLogBatchResponse(BaseModel):
    stored: int


class StudyOutputRequest(BaseModel):
    participantId: str
    sessionId: str
    outputId: str
    kind: str = "candidate"
    title: str | None = None
    imageDataUrl: str | None = None
    imageUrl: str | None = None
    textContent: str | None = None
    textFormat: str | None = None
    metadata: dict | None = None


class StudyOutputResponse(BaseModel):
    stored: bool
    imageFile: str | None = None


class StudyParticipantSummary(BaseModel):
    participantId: str
    eventCount: int
    outputCount: int
    lastActivityAt: str


class StudyTaskModule(BaseModel):
    id: str
    title: str
    purpose: str
    components: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)


class StudyTask(BaseModel):
    version: str
    category: Literal["NLP", "CV", "RL / ML"]
    topic: str
    cardSummary: str
    title: str
    audience: str
    methodOverview: str
    modules: list[StudyTaskModule] = Field(default_factory=list)
    flow: list[str] = Field(default_factory=list)
    prompt: str
    requirements: list[str] = Field(default_factory=list)


class ImageTestResponse(BaseModel):
    status: str
    configured: bool
    modelName: str | None = None
    responseFormatRequested: str | None = None
    responseFormatObserved: str | None = None
    prompt: str
    size: str
    hasImageUrl: bool
    hasImageDataUrl: bool
    imageUrl: str | None = None
    imageDataUrlPrefix: str | None = None
    imageDataUrlLength: int | None = None
    revisedPrompt: str | None = None
    error: str | None = None

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardSource = readFileSync(
  new URL("../components/project-dashboard.tsx", import.meta.url),
  "utf8",
);
const styleSource = readFileSync(
  new URL("../components/canvas-studio.tsx", import.meta.url),
  "utf8",
);
const layoutSource = readFileSync(
  new URL("../components/layout-studio.tsx", import.meta.url),
  "utf8",
);
const workbenchSource = readFileSync(
  new URL("../components/figure-workbench.tsx", import.meta.url),
  "utf8",
);
const editorSource = readFileSync(
  new URL("../components/svg-editor-studio.tsx", import.meta.url),
  "utf8",
);
const structureSource = readFileSync(
  new URL("../components/scientific-structure-panel.tsx", import.meta.url),
  "utf8",
);
const previewSource = readFileSync(
  new URL("../components/layout-png-preview.tsx", import.meta.url),
  "utf8",
);
const dashboardStyles = readFileSync(
  new URL("../components/project-dashboard-workspace-sheet.module.css", import.meta.url),
  "utf8",
);
const manifestSource = readFileSync(
  new URL("./first-generation-manifest.ts", import.meta.url),
  "utf8",
);
const modifyJobsSource = readFileSync(
  new URL("./modify-jobs.ts", import.meta.url),
  "utf8",
);
const generationServiceSource = readFileSync(
  new URL("../../backend/app/services.py", import.meta.url),
  "utf8",
);
const appStyles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const ideaHistorySource = readFileSync(
  new URL("../components/idea-history-view.tsx", import.meta.url),
  "utf8",
);
const ideaHistoryStyles = readFileSync(
  new URL("../components/idea-history-view.module.css", import.meta.url),
  "utf8",
);
const candidateSource = readFileSync(
  new URL("../components/candidate-studio.tsx", import.meta.url),
  "utf8",
);
const promptDialogStyles = readFileSync(
  new URL("../components/skeleton-prompt-confirm-dialog.module.css", import.meta.url),
  "utf8",
);
const promptDialogSource = readFileSync(
  new URL("../components/skeleton-prompt-confirm-dialog.tsx", import.meta.url),
  "utf8",
);
const demoSeedSource = readFileSync(new URL("./demo-seed.ts", import.meta.url), "utf8");

test("default first generation is assembled from the current prompt, raw layout, skeleton, primary style, and node icons", () => {
  assert.match(dashboardSource, /function buildFirstGenerationBundle\(workingPromptOverride\?: string\)/);
  assert.match(dashboardSource, /nodeIconBindings: scopedNodeIconBindings/);
  assert.match(dashboardSource, /styleReferenceId: primaryStyle\.id/);
  assert.match(dashboardSource, /const layoutReferenceForGeneration = guided/);
  assert.match(dashboardSource, /layoutReferenceId: layoutReferenceForGeneration\?\.id \?\? null/);
  assert.match(dashboardSource, /automaticBindings: bundle\.automaticBindings/);
  assert.match(dashboardSource, /diagramSkeletonXml: skeletonXml/);
  assert.match(dashboardSource, /matchInstructions: separateMatchInstructions \? bindingPrompt \|\| null : null/);
  assert.match(generationServiceSource, /draft_candidates\.append\(\(skeleton_render_ref, "layout_skeleton"/);
  assert.match(generationServiceSource, /generation was stopped before calling the image API/);
  assert.match(dashboardSource, /PARTIAL OVERRIDES, NOT A COMPLETE MODULE OR ICON LIST/);
  assert.doesNotMatch(dashboardSource, /confirm-binding-edge/);
  assert.match(dashboardSource, /confirmMode === "reference-board" &&[\s\S]{0,120}selectionConfirmHasControlSignal/);
  assert.match(dashboardSource, /setActiveStage\("candidate"\)/);
  assert.match(candidateSource, /Confirm inputs on the left/);
});

test("Match restores the two-pass draft and refinement flow", () => {
  assert.match(generationServiceSource, /match_instructions=match_instructions/);
  assert.match(generationServiceSource, /use_match_two_pass = \(/);
  assert.match(generationServiceSource, /MATCH PASS 1/);
  assert.match(generationServiceSource, /MATCH PASS 2/);
  assert.match(generationServiceSource, /style_layout_images/);
  assert.match(generationServiceSource, /layout_reference_ref,[\s\S]{0,100}?"layout_reference"/);
  assert.match(generationServiceSource, /reference_role="match_refine"/);
  assert.match(generationServiceSource, /MATCH PASS 2 — APPLY MATCH BINDINGS/);
  assert.match(generationServiceSource, /Do not globally redesign, relayout, restyle/);
  assert.doesNotMatch(generationServiceSource, /locked_context/);
  assert.doesNotMatch(generationServiceSource, /def _refinement_locked_context/);
  assert.match(generationServiceSource, /draftPreviewImageDataUrl/);
  assert.doesNotMatch(generationServiceSource, /def _generation_control_sheet\(/);
});

test("Style requires fonts and palettes while showing six unlimited palette choices", () => {
  assert.match(styleSource, /extractCuratedPaletteFromImageRegion/);
  assert.match(styleSource, /styleFontChoices\.map/);
  assert.match(styleSource, /className="style-kit-font-preview"/);
  assert.doesNotMatch(styleSource, /Image match|Fallback/);
  assert.match(styleSource, /\.slice\(0, 3\)/);
  assert.match(styleSource, /Required · select up to 3 current closest matches/);
  assert.match(styleSource, /\[\.\.\.rankedStyleFonts, \.\.\.fallbackStyleFonts\]\.slice\(0, STYLE_FONT_CHOICE_LIMIT\)/);
  assert.match(styleSource, /Selected · click to remove/);
  assert.match(styleSource, /Click to replace earliest selection/);
  assert.match(styleSource, /replacedFontId[\s\S]{0,500}currentFontIds\.slice\(1\), fontId/);
  assert.match(styleSource, /\[\.\.\.currentFontIds, fontId\]/);
  assert.match(styleSource, /Required · select one or more palettes/);
  assert.match(styleSource, /figurePaletteReferences\.map/);
  assert.match(styleSource, /styleDefaultAppearanceRef/);
  assert.match(styleSource, /const fontIds = shouldSelectFont \? \[firstFont\.id\] : currentFontIds/);
  assert.match(styleSource, /const palettes = shouldSelectPalette \? \[extractedImagePalette\] : currentPalettes/);
  assert.doesNotMatch(styleSource, /Choose up to .*color palettes/);
  assert.doesNotMatch(styleSource, /currentPalettes\.length >=/);
  assert.match(styleSource, /disabled: !styleAppearanceReady/);
  assert.match(styleSource, /disabled=\{!styleAppearanceReady\}/);
  assert.match(appStyles, /\.style-kit-palette-grid,[\s\S]{0,100}grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styleSource, /\[\.\.\.currentPalettes, \{ \.\.\.palette/);
  assert.match(styleSource, /aria-pressed=\{selected\}/);
  assert.match(styleSource, /analyzeStyleReference/);
  assert.match(styleSource, /Curated from this image/);
  assert.doesNotMatch(styleSource, /Aa Method Flow/);
  assert.match(structureSource, /selectFigureFont|selectFigurePalette/);
  assert.match(structureSource, /Do not match a font/);
  assert.match(structureSource, /Do not match colors/);
  assert.match(dashboardSource, /buildStyleAppearanceGenerationLines/);
  assert.doesNotMatch(generationServiceSource, /_locked_font_from_prompt|_locked_palette_colors_from_prompt/);
});

test("Skeleton generation locks neutral reference geometry before assignment, then compiles and audits", () => {
  assert.match(generationServiceSource, /def _semantic_graph_prompt\(/);
  assert.match(generationServiceSource, /def _lock_neutral_reference_skeleton\(/);
  assert.match(generationServiceSource, /def _reference_reconstruction_review_prompt\(/);
  assert.match(generationServiceSource, /def _reference_reconstruction_repair_prompt\(/);
  assert.doesNotMatch(generationServiceSource, /def _semantic_content_review_prompt\(/);
  assert.match(generationServiceSource, /def _semantic_graph_repair_prompt\(/);
  assert.match(generationServiceSource, /def _layout_assignment_prompt\(/);
  assert.match(generationServiceSource, /def _skeleton_audit_prompt\(/);
  assert.match(generationServiceSource, /def plan_layout\(/);
  assert.match(generationServiceSource, /def compile_layout_plan\(/);
  assert.match(generationServiceSource, /skeletonAudit"\] = skeleton_audit/);
  assert.match(generationServiceSource, /repairTrace"\] = repair_trace/);
  assert.match(generationServiceSource, /plan\["referenceRepairTrace"\] = reference_repair_trace/);
  assert.match(generationServiceSource, /renderReviewApplied"\] = bool\(skeleton_audit\["applied"\]\)/);
  const pipeline = generationServiceSource.match(
    /def _design_reference_skeleton\([\s\S]+?\ndef _design_skeleton_generation\(/,
  )?.[0] ?? "";
  assert.ok(pipeline.indexOf("semantic_system, semantic_user") < pipeline.indexOf("reference_system, reference_user"));
  assert.ok(pipeline.indexOf("reference_repair_trace = _lock_neutral_reference_skeleton(") < pipeline.indexOf("def plan_layout("));
  assert.ok(pipeline.indexOf("graph, panel_mapping = plan_layout(graph)") < pipeline.indexOf(") = compile_layout_plan(graph, panel_mapping)"));
  assert.ok(pipeline.indexOf(") = compile_layout_plan(graph, panel_mapping)") < pipeline.indexOf("audit_system, audit_user"));
  assert.ok(pipeline.indexOf("audit_system, audit_user") < pipeline.indexOf("if repair_needed"));
  assert.doesNotMatch(generationServiceSource, /def _semantic_layout_prompt\(/);
  assert.doesNotMatch(generationServiceSource, /def _internal_layout_prompt\(/);
  assert.doesNotMatch(generationServiceSource, /def _design_reference_skeleton_fast\(/);
});

test("every selected preset icon is sent as a pixel reference without a fixed count cap", () => {
  assert.match(dashboardSource, /function scientificIconReferenceItem\(/);
  assert.match(dashboardSource, /const presetIconReferenceItems = Array\.from\(/);
  assert.match(dashboardSource, /const generationReferences = \[[\s\S]{0,180}?\.\.\.presetIconReferenceItems/);
  assert.doesNotMatch(dashboardSource, /selectedIconLabels\.slice\(0, 8\)/);
});

test("Edit is a mask-and-revise flow with its controls on the canvas", () => {
  assert.doesNotMatch(editorSource, /Annotate & revise/);
  // The SVG element editor and its mode switch are gone, so there is no rail at all.
  assert.doesNotMatch(editorSource, /editorMode/);
  assert.doesNotMatch(editorSource, /Local revision/);
  assert.doesNotMatch(editorSource, /Text &amp; appearance/);
  assert.doesNotMatch(editorSource, /editor-rail/);
  // The controls the revision flow needs now sit in the stage toolbar.
  assert.match(editorSource, /editor-modify-actions/);
  assert.match(editorSource, /"Apply edits"/);
  assert.match(editorSource, /Clear markup/);
  // Violet rectangles must become a figure-sized pixel mask plus modify
  // regions, or the revision ignores the mask and redraws the whole figure.
  assert.match(editorSource, /const liveMaskTargets = deriveMaskTargets\(/);
  assert.match(editorSource, /maskTargetsToModifyRegions\(liveMaskTargets, figureBounds, selectedVariant\.id\)/);
  assert.match(editorSource, /referenceRegions: maskRegions/);
  assert.match(editorSource, /exportEditMaskDataUrl/);
  assert.match(editorSource, /editMaskImageDataUrl/);
  assert.match(editorSource, /const editMaskImageDataUrl = liveMaskTargets\.length > 0/);
  assert.match(editorSource, /const usesAnnotationControl = liveMaskTargets\.length > 0 \|\| hasAppearanceInstruction/);
  assert.match(editorSource, /annotationControlImageDataUrl/);
  assert.match(editorSource, /`Mask #\$\{index \+ 1\} \(\$\{location\}\): \$\{detail\}`/);
  assert.match(editorSource, /Describe what should change inside every mask before applying the edit/);
  assert.match(editorSource, /inpaint the area from the immediately surrounding background color/);
  assert.match(editorSource, /Leave no ghost, outline, placeholder, white patch/);
  assert.doesNotMatch(editorSource, /deriveAnnotationNotes|Arrow notes|Arrow note|liveAnnotationNotes/);
});

test("Candidate surfaces regeneration and past runs beside the figure", () => {
  // Center: regenerate when inputs moved on after the shown Candidate.
  assert.match(candidateSource, /Inputs changed since this Candidate/);
  assert.match(candidateSource, /Generate again/);
  assert.match(candidateSource, /styles\.previewActions/);
  // Left Selection rail flags which inputs changed.
  assert.match(dashboardSource, /candidateChangedSteps\.(prompt|skeleton|style|icons)/);
  assert.match(dashboardSource, /railChangedTag/);
  // Starting another run accepts the currently shown inputs, so the stale
  // banner and every Changed highlight clear while that run is in flight.
  assert.match(dashboardSource, /prompt: Boolean\(\s*!generating &&\s*candidateInputSnapshot/);
  assert.match(dashboardSource, /skeleton: Boolean\(\s*!generating &&\s*candidateInputSnapshot/);
  assert.match(dashboardSource, /style: Boolean\(\s*!generating &&\s*candidateInputSnapshot/);
  assert.match(dashboardSource, /icons: Boolean\(\s*!generating &&\s*candidateInputSnapshot/);
  // Run history is its own right-hand column, no longer a strip under the figure.
  assert.match(dashboardSource, /const candidateRunsRail = \(/);
  assert.match(dashboardSource, /dashboardSheetStyles\.runsRail/);
  assert.match(dashboardSource, /\{candidateSelectionRail\}[\s\S]*\{candidateRunsRail\}/);
  assert.match(dashboardSource, /dashboardSheetStyles\.runDelete/);
  assert.match(dashboardSource, /function deleteCandidateRun/);
  // First generations and background Edit revisions remain visible as live runs.
  assert.match(dashboardSource, /const pendingCandidateRunCount/);
  assert.match(dashboardSource, /pendingModifyJobList\.map\(\(job\) =>/);
  assert.match(dashboardSource, /dashboardSheetStyles\.runPendingPreview/);
  assert.match(dashboardStyles, /\.runPendingPreview :global\(\.ui-spinner\)/);
  assert.doesNotMatch(candidateSource, /Generated Candidates/);
});

test("Candidate keeps selected Edit results in the right rail and center preview", () => {
  assert.match(candidateSource, /const liveVariants = variants\.filter\(\(variant\) => !variant\.deletedAt\)/);
  assert.match(candidateSource, /liveVariants\.find\(\(variant\) => variant\.id === selectedVariantId\)/);
  assert.match(candidateSource, /selected\.sourceVariantId && !generating/);
  assert.match(dashboardSource, /const candidateOutputRuns = variants\.filter\(\(variant\) => !variant\.deletedAt\)/);
  assert.match(dashboardSource, /\{candidateOutputRuns\.map\(\(variant\) =>/);
  assert.match(dashboardSource, /onClick=\{\(\) => selectCandidatePreview\(variant\.id\)\}/);
  assert.match(dashboardSource, /\? "Edit result"/);
  assert.match(dashboardSource, /const selectedOutput = current\.selectedVariantId/);
  assert.match(dashboardSource, /if \(selectedOutput\) return current/);
  assert.doesNotMatch(
    dashboardSource,
    /if \(step === "candidate"\) \{[\s\S]{0,500}?selectedVariantId: currentCandidate\.variantId \?\? current\.selectedVariantId/,
  );
  assert.match(dashboardSource, /const \[candidatePreviewVariantId, setCandidatePreviewVariantId\]/);
  assert.match(dashboardSource, /resolveCandidatePreviewVariantId\(\{/);
  assert.match(dashboardSource, /selectedVariantId=\{candidateDisplayVariantId\}/);
});

test("background Edit settlement notifies the jobs store outside the workspace updater", () => {
  const settlementSource = modifyJobsSource.slice(
    modifyJobsSource.indexOf("const settleModifyJob"),
    modifyJobsSource.indexOf("const pollModifyJob"),
  );
  const workspaceUpdaterSource = settlementSource.slice(
    settlementSource.indexOf("setState((current) => {"),
    settlementSource.indexOf("    });"),
  );

  assert.match(workspaceUpdaterSource, /return updateWorkspace\(current\)/);
  assert.doesNotMatch(workspaceUpdaterSource, /removePendingModifyJob/);
  assert.match(settlementSource, /\}\);\n    \/\/ Removing the job[\s\S]*removePendingModifyJob\(pending\.jobId\)/);
});

test("a Candidate is only stale when an input really moved, not because of how it was recorded", () => {
  // The snapshot and the staleness check must read the same skeleton.
  assert.match(dashboardSource, /function buildFirstGenerationBundle[\s\S]{0,400}?const skeleton = workflowSkeleton;/);
  assert.match(dashboardSource, /const firstGenerationSkeleton = workflowSkeleton;/);
  assert.match(dashboardSource, /bindingsDiffer\(candidateInputSnapshot\.nodeIconBindings, resolvedBindingRecord\)/);
  assert.doesNotMatch(dashboardSource, /candidateInputSnapshot\.nodeFontBindings/);
  assert.doesNotMatch(dashboardSource, /candidateInputSnapshot\.nodeColorBindings/);
});

test("Retrieval only collects references; picking the one to use happens on Layout and Style", () => {
  assert.doesNotMatch(workbenchSource, /Primary layout/);
  assert.doesNotMatch(workbenchSource, /Primary style/);
  assert.doesNotMatch(workbenchSource, /setPrimaryReference/);
  // Retrieval cards still add and remove pocket roles.
  assert.match(workbenchSource, /addToPocket\(reference, role\)/);
  const addToPocketBlock = workbenchSource.slice(
    workbenchSource.indexOf("function addToPocket"),
    workbenchSource.indexOf("function referenceDependencyCount"),
  );
  assert.doesNotMatch(addToPocketBlock, /layoutReferenceId/);
  assert.doesNotMatch(addToPocketBlock, /canvasFocusReferenceId/);
  assert.doesNotMatch(addToPocketBlock, /activeStyleKit/);
  assert.doesNotMatch(addToPocketBlock, /canvasGenerationReferenceIds/);
  assert.doesNotMatch(addToPocketBlock, /style_reference_selected/);
  // The Layout and Style galleries remain the single place that sets the active reference.
  assert.match(dashboardSource, /useCanvasReferenceAs\("layout", reference\)/);
  assert.match(dashboardSource, /useCanvasReferenceAs\("style", reference\)/);
});

test("returning to Prompt does not restore the last Retrieval image focus", () => {
  assert.match(workbenchSource, /if \(focus !== "retrieval" \|\| !pocketFocusRequest\) return;/);
  assert.match(workbenchSource, /\}, \[focus, pocketFocusRequest\]\);/);
  assert.match(
    dashboardSource,
    /pocketFocusRequest=\{activeIdeaSparkStep === "retrieval" \? retrievalPocketFocus : null\}/,
  );
});

test("Match opens draw.io from its own pane with the same affordance as Skeleton", () => {
  assert.match(dashboardSource, /const \[matchDrawioOpen, setMatchDrawioOpen\] = useState\(false\)/);
  assert.match(dashboardSource, /setMatchDrawioOpen\(true\)/);
  assert.match(dashboardSource, /setMatchDrawioOpen\(false\)/);
  // Edits made in Match save back through the same skeleton handler Skeleton uses.
  assert.match(
    dashboardSource,
    /matchDrawioOpen && studioSkeleton\.xml \? \([\s\S]{0,260}?handleSkeletonXmlChange\(studioSkeleton\.id, xml\)/,
  );
  // Both panes use the larger, legible toggle rather than a btn-sm.
  assert.equal(dashboardSource.match(/drawio-toggle-btn/g)?.length, 4);
  assert.match(appStyles, /\.drawio-toggle-btn \{/);
});

test("first generation carries icon and optional figure-wide Match inputs", () => {
  assert.match(
    dashboardSource,
    /referenceRegions: !simpleFirstGeneration && guided && draft\.selectedStyleReference/,
  );
  assert.match(
    dashboardSource,
    /simpleFirstGeneration \? undefined : draft\.selectedFontIds\[0\]/,
  );
  assert.match(
    dashboardSource,
    /simpleFirstGeneration \? undefined : draft\.selectedPaletteIds\[0\]/,
  );
  assert.doesNotMatch(dashboardSource, /manifest\.editFontIds/);
  assert.doesNotMatch(dashboardSource, /manifest\.editPalettes/);
  assert.match(dashboardSource, /appearanceLines = buildStyleAppearanceGenerationLines/);
  assert.match(dashboardSource, /matchAppearanceFingerprint: createMatchedStyleAppearanceFingerprint/);
});

test("Style collects icons, colors, and fonts while Edit keeps independent appearance controls", () => {
  assert.match(styleSource, /Icons from the image/);
  assert.match(styleSource, /aria-label="Palette choices"/);
  assert.match(styleSource, /aria-label="Font choices"/);
  assert.match(editorSource, /const editFontPresets = FONT_PRESETS/);
  assert.match(editorSource, /PALETTE_PRESETS\.map/);
  assert.match(editorSource, /annotationStyleCues/);
});

test("Style collects source icons without duplicating the full icon search", () => {
  assert.doesNotMatch(styleSource, /placeholder="Search icons"/);
  assert.match(styleSource, /Click the image to add candidates/);
  assert.match(styleSource, /styleIconDraftItems\.map/);
  assert.match(styleSource, /type="checkbox"/);
  assert.match(styleSource, /showStatus=\{false\}/);
  assert.match(styleSource, /onStatusChange=\{setStyleIconExtractionStatus\}/);
  assert.match(styleSource, /commitStyleIconDraft\(\)/);
  assert.match(styleSource, /removeCustomIconFromWorkspaceState/);
  assert.doesNotMatch(styleSource, /saveSamExtractedIcon|Save selected/);
  assert.doesNotMatch(styleSource, /Server extract/);
});

test("Studio is the default workspace and the movable canvas is an explicit Advanced Board", () => {
  assert.match(dashboardSource, /workspaceView === "studio"/);
  assert.match(dashboardSource, /workspaceView === "advanced-board"/);
  assert.match(dashboardSource, /Idea Spark/);
  assert.doesNotMatch(dashboardSource, /className=\{dashboardSheetStyles\.artifactRail\}/);
  assert.match(dashboardSource, /const skeletonEditorModal = skeletonEditorOpen/);
  assert.doesNotMatch(dashboardSource, /studioStage === "skeleton" \? skeletonStudioWorkspace/);
});

test("the simplified board is a read-only input check before Candidate generation", () => {
  assert.match(dashboardSource, /selectionRail/);
  assert.match(dashboardSource, /candidateConsole/);
  assert.match(dashboardSource, /continueToStepLabel\("candidate"\)/);
  assert.match(dashboardSource, /railRowMissing/);
  assert.match(dashboardSource, /openIdeaSparkStep\("prompt"\)/);
  assert.match(dashboardSource, /openIdeaSparkStep\("skeleton"\)/);
  assert.match(dashboardSource, /setSkeletonEditorOpen\(true\)/);
  assert.match(dashboardSource, /openIdeaSparkStep\("style"\)/);
});

test("Candidate rail rows enlarge on click and only navigate from the action button", () => {
  // Reading an input must not cost the author their place on Candidate, so the
  // row body opens a zoom and "Change →" is the only way out of the page.
  assert.match(dashboardSource, /className=\{dashboardSheetStyles\.railPeek\}/);
  // A <button> cannot wrap LayoutPngPreview's <div>; the browser relocates it
  // and React 19 then crashes on removeChild when the rail unmounts.
  assert.match(dashboardSource, /role="button"\s*\n\s*tabIndex=\{0\}\s*\n\s*className=\{dashboardSheetStyles\.railPeek\}/);
  assert.match(dashboardSource, /setRailZoom\(\{/);
  assert.match(dashboardSource, /const candidateRailZoomModal =/);
  assert.match(dashboardStyles, /\.railPeek \{[\s\S]*?cursor: zoom-in;/);
  assert.match(dashboardStyles, /\.railAction \{[\s\S]*?position: absolute;/);
});

test("the Candidate rail shows the selected skeleton and optional Match choices", () => {
  assert.match(dashboardSource, /<LayoutPngPreview plan=\{railSkeletonPlan\}/);
  assert.match(dashboardSource, /const railSkeletonNodeCount = railSkeletonPlan\?\.nodes\.length/);
  assert.match(dashboardSource, /const railIconBindings =/);
  assert.doesNotMatch(dashboardSource, /railThumbMatchFonts|railThumbMatchSwatches/);
  assert.doesNotMatch(dashboardSource, /<strong>Node–Icon\{/);
  assert.match(dashboardSource, /Figure font · optional/);
  assert.match(dashboardSource, /Figure colors · optional/);
});

test("Layout and Style pocket clicks preview first and selection stays explicit", () => {
  // Pocket clicks move the matching reference to the stage without silently
  // changing the source used for generation; the stage owns the Select button.
  assert.match(dashboardSource, /setPocketZoomReference\(item\)/);
  assert.match(dashboardSource, /pocket-zoom-overlay/);
  assert.match(dashboardSource, /function studioStageOwnsSourceRole\(role: PocketRole\)/);
  assert.match(dashboardSource, /setStudioSourcePreviewRequest\(\(current\) => \(\{/);
  assert.doesNotMatch(dashboardSource, /useCanvasReferenceAs\(role, item, "studio_pocket"\)/);
  assert.match(dashboardSource, /previewRequest=\{studioSourcePreviewRequest\?\.role === "layout"/);
  assert.match(dashboardSource, /previewRequest=\{studioSourcePreviewRequest\?\.role === "style"/);
  assert.match(layoutSource, /onClick=\{\(\) => selectLayoutForGeneration\(reference\)\}/);
  assert.match(styleSource, /onClick=\{\(\) => toggleStyleReference\(displayedStyleReference\)\}/);
  assert.match(layoutSource, /const firstId = layoutReferenceId;/);
  assert.match(styleSource, /const firstId = canvasFocusReferenceId;/);
  assert.doesNotMatch(layoutSource, /layoutPreviewReference\?\.id \?\? layoutReferenceId/);
  assert.doesNotMatch(styleSource, /stylePreviewReference\?\.id \?\? canvasFocusReferenceId/);
  assert.match(layoutSource, /embeddedReferenceCardRefs\.current\[reference\.id\]\?\.scrollIntoView/);
  assert.match(styleSource, /embeddedStyleCardRefs\.current\[reference\.id\]\?\.scrollIntoView/);
  assert.match(dashboardSource, /studioSelectedLayoutReferences/);
  assert.match(dashboardSource, /studioSelectedStyleReferences/);
  assert.match(dashboardSource, /\[selected, \.\.\.references\.filter\(\(item\) => item\.id !== layoutReferenceId\)\]/);
  assert.match(dashboardSource, /\[selected, \.\.\.references\.filter\(\(item\) => item\.id !== canvasFocusReferenceId\)\]/);
  assert.match(dashboardSource, /showBothStudioSourceCategories/);
  assert.match(dashboardSource, /studioStage === "layout"/);
  assert.match(dashboardSource, /studioStage === "style"/);
  assert.match(dashboardSource, /studioSourceCategoriesOpen\[role\]/);
  assert.match(dashboardSource, /<CanvasStudio[\s\S]*?embedded/);
  assert.match(dashboardSource, /<LayoutStudio[\s\S]*?embedded/);
});

test("embedded Layout action registration does not loop on an inline edit callback", () => {
  assert.match(layoutSource, /const onEditSkeletonRef = useRef\(onEditSkeleton\)/);
  assert.match(layoutSource, /onPrimary: \(\) => onEditSkeletonRef\.current\?\.\(activeSkeleton\)/);
  const registrationStart = layoutSource.indexOf(
    "if (!embedded || !onRegisterStageAction) return;",
  );
  const registrationEnd = layoutSource.indexOf("  if (embedded) {", registrationStart);
  const registrationEffect = layoutSource.slice(registrationStart, registrationEnd);
  assert.ok(registrationStart >= 0 && registrationEnd > registrationStart);
  assert.match(registrationEffect, /canEditSkeleton/);
  assert.doesNotMatch(registrationEffect, /\n\s*onEditSkeleton,\n/);
});

test("every Skeleton generation path confirms an editable prompt first", () => {
  assert.match(layoutSource, /setPromptConfirmation\(\{ reference: skeletonReference, value: taskBrief \}\)/);
  assert.match(layoutSource, /<SkeletonPromptConfirmDialog/);
  assert.match(layoutSource, /runGenerateSkeleton\(reference, value\.trim\(\)\)/);
  const dashboardSkeletonCalls = [...dashboardSource.matchAll(/await generateDiagramSkeleton\(/g)].length;
  const dashboardPromptConfirmations = [...dashboardSource.matchAll(/await requestSkeletonPromptConfirmation\(/g)].length;
  assert.ok(dashboardSkeletonCalls > 0);
  assert.equal(dashboardPromptConfirmations, dashboardSkeletonCalls);
  assert.match(dashboardSource, /<SkeletonPromptConfirmDialog/);
  assert.match(promptDialogStyles, /width: min\(1120px, calc\(100vw - 32px\)\)/);
  assert.match(promptDialogStyles, /min-height: 360px/);
});

test("Candidate generation confirms the editable Working Prompt first", () => {
  assert.match(dashboardSource, /await requestCandidatePromptConfirmation\(/);
  assert.match(dashboardSource, /const bundle = buildFirstGenerationBundle\(confirmation\.prompt\)/);
  assert.match(dashboardSource, /generationLabel="Candidate"/);
});

test("Skeleton and Candidate generation no longer expose a fast path", () => {
  assert.doesNotMatch(promptDialogSource, /fastGeneration|onFastGenerationChange|fastButton/);
  assert.doesNotMatch(promptDialogStyles, /fastButton/);
  assert.doesNotMatch(layoutSource, /fastGeneration/);
  assert.doesNotMatch(dashboardSource, /fastGeneration/);
  assert.doesNotMatch(generationServiceSource, /fast_generation|_design_reference_skeleton_fast/);
  assert.match(generationServiceSource, /use_match_two_pass = \(\s*has_match_controls/);
});

test("generation and Match chrome omit repeated helper copy and participant IDs", () => {
  assert.doesNotMatch(promptDialogSource, /Before generating/);
  assert.doesNotMatch(promptDialogSource, /Review or revise the prompt/);
  assert.doesNotMatch(promptDialogSource, /⌘\/Ctrl \+ Enter to confirm/);
  assert.doesNotMatch(structureSource, /Applies to every block/);
  assert.doesNotMatch(structureSource, /Click once to bind or replace/);
  assert.doesNotMatch(structureSource, /Suggested for this block/);
  assert.doesNotMatch(dashboardSource, /`Participant \$\{studyProfile\.userId\}`/);
});

test("embedded Skeleton setup does not repeat the assigned-task Method overview", () => {
  assert.match(layoutSource, /!embedded \? <aside className="layout-structure-inspector"/);
  assert.match(layoutSource, /!embedded && selectedReference && !showReferenceChooser/);
  // The Prompt stage already owns the brief; Layout should not paste METHOD OVERVIEW on top.
  assert.doesNotMatch(layoutSource, /styles\.promptStrip/);
  assert.match(layoutSource, /Restore assigned task/);
  assert.match(layoutSource, /commitWorkingPromptRevision\(prepared, "narrator_send"\)/);
  assert.match(layoutSource, /commitWorkingPromptRevision\(prepared, "skeleton_generation"\)/);
  assert.doesNotMatch(layoutSource, /onBlur=\{\(\) => setState/);
  // The embedded path renders exactly one grid column; the narrator aside only remains on the legacy standalone route.
  const embeddedBlock = layoutSource.slice(
    layoutSource.indexOf("if (embedded) {"),
    layoutSource.indexOf("return (\n    <>\n    <div className=\"page\">"),
  );
  assert.doesNotMatch(embeddedBlock, /layout-narrator-inspector/);
  assert.doesNotMatch(embeddedBlock, /GuidedConversationPanel/);
  assert.match(dashboardSource, /studioSkeleton\?\.xml \? \(/);
  assert.match(dashboardSource, /inline-skeleton-studio-grid/);
  assert.match(dashboardSource, /Edit in Draw.io/);
});

test("Style keeps font matching focused without restoring the old general analysis workflow", () => {
  assert.doesNotMatch(styleSource, />\s*Analyze Style\s*</);
  assert.doesNotMatch(styleSource, /Skip Analysis/);
  assert.doesNotMatch(styleSource, /Analyzing with AI/);
  assert.doesNotMatch(styleSource, /Retry Analysis/);
  assert.doesNotMatch(styleSource, /autoExtractedStyleReferenceIds/);
  assert.match(styleSource, /3 current closest matches/);
});

test("Style presents the main image with icon, palette, and font choices", () => {
  assert.match(styleSource, /Icons from the image/);
  assert.match(styleSource, /<SamIconExtractor/);
  assert.doesNotMatch(styleSource, /Add all detected/);
  assert.match(styleSource, /Curated from this image/);
  assert.match(styleSource, /styleFontChoices\.map/);
  assert.doesNotMatch(styleSource, /Read fonts from image/);
  // The dialog header already names the reference; the rail no longer repeats it.
  assert.doesNotMatch(styleSource, /Overall style<\/small>/);
  assert.match(styleSource, /continueToStepLabel\("icons"\)/);
  assert.doesNotMatch(styleSource, /<nav className=\{`style-kit-tabs/);
});

test("Extract style keeps the icon extractor reachable inside the dialog", () => {
  assert.match(styleSource, /multi-select the color palettes and fonts/);
  assert.match(styleSource, /style-detail-selection-count/);
  // The dialog body clips overflow, so the source column must scroll itself or
  // the extractor's candidate list and save button end up unreachable.
  assert.match(
    appStyles,
    /\.style-detail-dialog-body \.style-source-column \{\s*overflow: auto;/,
  );
  assert.match(
    appStyles,
    /\.style-detail-dialog-body \.sam-icon-extractor-inline \.sam-icon-extractor-layout \{/,
  );
});

test("author decisions are frozen with a Candidate without being sent to the model", () => {
  assert.match(dashboardSource, /authorDecisionSnapshot/);
  // The decisions were only ever a frontend record, so nothing about them may
  // leak into the generation payload.
  assert.doesNotMatch(dashboardSource, /authorDecisionSnapshot[\s\S]{0,400}?body: JSON\.stringify/);
});

test("Match is a dedicated Studio step after Style", () => {
  assert.match(dashboardSource, /type DashboardStageId = .*"style" \| "icons" \| "candidate" \| "review"/);
  assert.doesNotMatch(dashboardSource, /type DashboardStageId = .*"edit"/);
  assert.doesNotMatch(dashboardSource, /type DashboardStageId = .*"skeleton"/);
  assert.match(
    dashboardSource,
    /studioStage === "style"[\s\S]*?<CanvasStudio[\s\S]*?embedded[\s\S]*?onContinueToIcons=\{focusNodeIconMapping\}/,
  );
  assert.match(dashboardSource, /studioStage === "icons" \? iconMatchingWorkspace/);
  assert.match(dashboardSource, /matchPreviewFontFamily|matchPreviewPaletteColors/);
  assert.doesNotMatch(dashboardSource, /nodeFontFamilies=\{matchPreviewNodeFontFamilies\}/);
  assert.doesNotMatch(dashboardSource, /buildFontPaletteGenerationLines/);
  // The toolbar and pane headings name the stage, so Match opens straight on
  // the diagram without repeated helper copy.
  assert.doesNotMatch(dashboardSource, /<h2>Match icons to the Skeleton<\/h2>/);
  assert.doesNotMatch(dashboardSource, /inline-skeleton-studio-head is-compact/);
  assert.doesNotMatch(dashboardSource, /Click a block on the diagram, then bind an icon from Style/);
  assert.doesNotMatch(structureSource, /Click a block on the diagram to switch/);
  assert.doesNotMatch(dashboardSource, /Click a numbered block to bind its icon on the right/);
  assert.match(structureSource, /scoreWorkspaceIconMatch/);
  assert.doesNotMatch(structureSource, /bindFont|bindColor/);
  assert.doesNotMatch(structureSource, /match-attribute-tabs/);
  assert.match(structureSource, /match-figure-style-strip/);
});

test("Match exposes per-block icons plus optional whole-figure font and color", () => {
  assert.match(structureSource, /function bindIcon/);
  assert.match(structureSource, /Figure font · optional|selectFigureFont/);
  assert.match(structureSource, /Figure color · optional|selectFigurePalette/);
  assert.match(dashboardSource, /fontFamily=\{matchPreviewFontFamily\}|paletteColors=\{matchPreviewPaletteColors\}/);
});

test("clearing optional Match font and color removes their generation constraints", () => {
  assert.match(structureSource, /selectFigureFont\(font\.id === matchedFigureFont\?\.id \? null : font\.id\)/);
  assert.match(structureSource, /selectFigurePalette\(selected \? null : palette\)/);
  assert.match(structureSource, /fontReferenceId: font\?\.id \?\? null/);
  assert.match(structureSource, /paletteReferenceId: preset\?\.id \?\? null/);
  assert.match(structureSource, /matchedStylePalette: palette\?\.kind === "region" \? palette : null/);
});

test("Match only lists leaf modules, because the preview never draws icons on containers", () => {
  assert.match(structureSource, /filter\(\(node\) => !isDiagramGroupNode\(node\)\)/);
  assert.match(previewSource, /ordinaryNodes = plan\.nodes\.filter\(\(node\) => !isDiagramGroupNode\(node\)\)/);
  assert.match(previewSource, /boundNodes = ordinaryNodes\.flatMap/);
  assert.match(manifestSource, /if \(isDiagramGroupNode\(target\)\) return;/);
});

test("Match exposes optional figure-level font and color alongside Style-derived icon choices", () => {
  assert.doesNotMatch(structureSource, /function matchCurrentRow\(/);
  assert.match(structureSource, /const \[figureStyleTab, setFigureStyleTab\]/);
  assert.match(structureSource, /Figure color · optional/);
  assert.match(structureSource, /Figure font · optional/);
  assert.match(structureSource, /aria-label="Optional figure font match"/);
  assert.match(structureSource, /aria-label="Optional figure color match"/);
  assert.doesNotMatch(structureSource, /match-color-reset/);
  assert.doesNotMatch(structureSource, /icon-library-custom/);
  assert.match(structureSource, /match-option-group-head">\s*From Style/);
});

test("Match exposes every extracted Style icon and no default icon library", () => {
  assert.match(structureSource, /const candidateStyleKit = presentation === "mapping"\s*\n\s*\? state\.activeStyleKit/);
  assert.match(structureSource, /const selectedStyleKitIcons = styleKitIconMatches/);
  assert.doesNotMatch(structureSource, /styleKitIconMatches\.slice\(0, 5\)/);
  assert.match(structureSource, /selectedStyleKitIcons\.map/);
  assert.match(structureSource, /No extracted icons yet\. Extract icons in Style to use them here\./);
  assert.doesNotMatch(structureSource, /recommendScientificIcons/);
  assert.doesNotMatch(structureSource, /Browse all icons/);
  assert.doesNotMatch(structureSource, /createPortal/);
  assert.doesNotMatch(structureSource, /icon-picker-dialog/);
  assert.doesNotMatch(structureSource, /<details className="icon-library-details">/);
  assert.doesNotMatch(structureSource, /canvas-style-kit-\$\{skeletonId\}-icon-/);
  assert.doesNotMatch(dashboardSource, /canvas-style-kit-\$\{candidate\.id\}/);
});

test("Idea Spark exposes seven navigation operations across Envision, Externalize, and Evolve", () => {
  for (const phase of ["Envision", "Externalize", "Evolve"]) {
    assert.ok(ideaHistorySource.includes(phase), `missing history phase: ${phase}`);
  }
  for (const operation of [
    "Prompt",
    "Retrieval",
    "Layout",
    "Style",
    "Match",
    "Candidate",
    "History",
  ]) {
    assert.ok(ideaHistorySource.includes(operation), `missing history operation: ${operation}`);
  }
  assert.doesNotMatch(ideaHistorySource, /shortLabel: "Edit", phase: "evolve", role: "result"/);
  assert.doesNotMatch(ideaHistorySource, /shortLabel: "Skeleton", phase: "externalize"/);
  assert.match(ideaHistorySource, /export function IdeaSparkNavigator/);
  assert.match(ideaHistorySource, /const NAV_PHASES/);
  assert.match(ideaHistorySource, /id: "externalize", label: "Externalize", steps: \["layout", "style", "icons"\]/);
  assert.match(ideaHistorySource, /id: "evolve", label: "Evolve", steps: \["candidate", "review"\]/);
  assert.match(ideaHistorySource, /if \(step === "skeleton"\) return/);
  assert.match(ideaHistorySource, /className=\{styles\.compactFlow\}/);
  assert.match(ideaHistorySource, /className=\{styles\.phaseSteps\}/);
  assert.doesNotMatch(ideaHistorySource, /ResizeObserver/);
  assert.match(ideaHistoryStyles, /\.navigator \{\n  position: fixed;/);
  assert.match(ideaHistoryStyles, /\.phase_externalize \{/);
  assert.doesNotMatch(ideaHistoryStyles, /repeat\(9/);
  assert.match(ideaHistorySource, /export function IdeaHistoryPanel/);
  assert.match(ideaHistorySource, /Restore this idea/);
  assert.match(ideaHistorySource, /onOpenStep/);
  assert.match(ideaHistorySource, /aria-current=\{active \? "step"/);
  assert.match(ideaHistorySource, /aria-busy=\{display\.status === "running"/);
  assert.match(ideaHistorySource, /generation\.running\.(layout|style|candidate)/);
  assert.match(dashboardSource, /layout: generatingSkeleton \|\| state\.layoutSkeletonGenerationInProgress/);
  assert.match(dashboardSource, /candidate: generating \|\| pendingModifyJobList\.length > 0/);
  assert.match(ideaHistoryStyles, /\.status_running > i/);
  assert.match(ideaHistoryStyles, /width: 218px/);
});

test("Layout keeps the Skeleton workspace instead of replacing it with a result gallery", () => {
  assert.doesNotMatch(layoutSource, /Choose a generated layout/);
  // The stage toolbar carries the title, so the gallery header is counts only.
  assert.doesNotMatch(layoutSource, /Choose a Layout, then generate a Skeleton/);
  assert.doesNotMatch(layoutSource, /Layout workspace/);
  assert.match(layoutSource, /\{diagramSkeletonCandidates\.length\} Skeleton/);
  assert.match(layoutSource, /orderedLayoutCandidates\.map\(\(reference, referenceIndex\) =>/);
  assert.match(layoutSource, /Select for generation/);
  assert.match(layoutSource, /Generate Skeleton/);
  assert.match(layoutSource, /Edit skeleton/);
  assert.match(layoutSource, /primaryLabel: "Edit skeleton"/);
  assert.match(layoutSource, /continueToStepLabel\("style"\)/);
  assert.match(layoutSource, /onEditSkeleton\(selectedSkeleton\)/);
  assert.match(layoutSource, /diagramSkeletonCandidates\.slice\(\)\.reverse\(\)\.map/);
  assert.match(dashboardSource, /studioSourceGrid/);
  assert.match(
    dashboardSource,
    /if \(studioStageOwnsSourceRole\(studioSourcePreviewRequest\.role\)\) return;[\s\S]*?setStudioSourcePreviewRequest\(null\);/,
  );
  assert.match(layoutSource, /Generate Skeleton/);
});

test("Panel titles wrap without the ordinary module line cap", () => {
  assert.match(previewSource, /group \? undefined : 3/);
  assert.match(appStyles, /\.layout-html-node\.is-group span \{[\s\S]*?-webkit-line-clamp: unset;/);
  assert.match(previewSource, /const panelCount = plan\.nodes\.filter\(isDiagramGroupNode\)\.length/);
  assert.match(previewSource, /\{moduleCount\} modules \/ \{plan\.edges\.length\} edges \/ \{panelCount\} panels/);
  assert.doesNotMatch(previewSource, /\{plan\.nodes\.length\} nodes \/ \{plan\.edges\.length\} edges/);
});

test("study Envision keeps retrieval choices while hiding region and advanced role controls", () => {
  assert.match(workbenchSource, /\{!studyMode \? \([\s\S]*Select region[\s\S]*reference-more-roles[\s\S]*\) : null\}/);
  assert.match(workbenchSource, /\(\["layout", "style"\] as const\)\.map/);
  assert.doesNotMatch(workbenchSource, /Find similar references/);
  assert.match(workbenchSource, /Search references/);
  assert.match(workbenchSource, /Search by Topic/);
  assert.match(workbenchSource, /Search by Layout/);
  assert.match(workbenchSource, /Search by Style/);
  assert.match(workbenchSource, /<SearchGoalIcon goal=\{option\.value\} \/>/);
  assert.match(workbenchSource, /SEARCH_GOAL_OPTIONS\.map/);
  assert.match(workbenchSource, /retrieval-goal-button/);
  assert.match(workbenchSource, /isMuted \? "is-muted"/);
  assert.doesNotMatch(workbenchSource, /<span className="label-text">Search goal<\/span>[\s\S]{0,200}<select/);
});

test("Idea Spark distinguishes direct inputs, preparation, Edit-only assets, and outputs", () => {
  assert.match(ideaHistorySource, /role: "required"/);
  assert.match(ideaHistorySource, /role: "optional"/);
  assert.match(ideaHistorySource, /role: "preparation"/);
  assert.match(ideaHistorySource, /role: "result"/);
  assert.match(ideaHistorySource, /Layout builds the Skeleton and is not a direct first-generation input/);
  assert.match(ideaHistorySource, /Extract icons from this reference for Match/);
  assert.match(ideaHistorySource, /Prompt, Skeleton, and Style are ready to confirm/);
  assert.match(dashboardSource, /resolveFirstGenerationReadiness/);
});

test("Candidate page hosts preview inline and opens Edit as a modal", () => {
  assert.match(dashboardSource, /studioStage === "candidate"/);
  assert.match(candidateSource, /return to Retrieval/);
  assert.match(dashboardSource, /onContinueRetrieval=\{\(\) => openIdeaSparkStep\("retrieval"\)\}/);
  assert.match(dashboardSource, /you can return to Retrieval for more references/);
  assert.match(dashboardSource, /const candidateEditorModal =/);
  assert.match(dashboardSource, /style-detail-dialog candidate-edit-dialog/);
  assert.match(dashboardSource, /const closeCandidateEditor = useCallback/);
  assert.doesNotMatch(dashboardSource, /candidateModeBar/);
  assert.match(candidateSource, /Edit this Candidate/);
  assert.match(candidateSource, /styles\.previewActions/);
  assert.match(candidateSource, /stale \? "Generate again" : "Generate another"/);
  assert.match(dashboardSource, /const openVariantInEdit = useCallback/);
  assert.match(dashboardSource, /dashboardSheetStyles\.runEdit/);
  assert.match(dashboardSource, /className=\{dashboardSheetStyles\.candidateConsole\}/);
  assert.match(dashboardSource, /\{candidateSelectionRail\}/);
  assert.doesNotMatch(dashboardSource, /studioStage === "edit"/);
  assert.doesNotMatch(dashboardSource, /continueToStepLabel\("edit"\)/);
  // The rail already states every input, so the Details dialog is gone.
  assert.doesNotMatch(dashboardSource, /candidateDetailsOpen/);
  assert.doesNotMatch(dashboardSource, /candidateDetailsBody/);
  // Those actions live on the figure, not in the sticky stage bar.
  assert.doesNotMatch(dashboardSource, /secondaryLabel: generating \? "Generating…" : "Generate another"/);
  assert.doesNotMatch(dashboardSource, /candidateIdeaFlowStrip/);
  assert.doesNotMatch(dashboardSource, /firstGenerationSummaryModal/);
});

const ideaSparkFlowSource = readFileSync(
  new URL("../lib/idea-spark-flow.ts", import.meta.url),
  "utf8",
);
const workspaceStateSource = readFileSync(
  new URL("../lib/workspace-state.ts", import.meta.url),
  "utf8",
);

test("Skeleton editing supports multi-select modules, batch arrow deletion, and select-all refinement", () => {
  assert.match(dashboardSource, /setSkeletonEditorOpen\(true\)/);
  assert.match(dashboardSource, /style-detail-dialog skeleton-editor-dialog/);
  assert.match(dashboardSource, /skeleton-controls-panel/);
  assert.match(dashboardSource, /Change selected items/);
  assert.match(dashboardSource, /selectedSkeletonTargetIds/);
  assert.match(dashboardSource, /Select all/);
  assert.doesNotMatch(dashboardSource, /setRegionRegenScope/);
  assert.match(dashboardSource, /regionRegenTargetNodes\.map\(\(node\) => node\.id\)/);
  assert.match(dashboardSource, /scope: wholeSkeletonRegen \? "whole" : "region"/);
  assert.match(dashboardSource, /Click modules or arrows on the left/);
  assert.match(dashboardSource, /Delete selected arrow\{regionRegenTargetEdges\.length/);
  assert.match(dashboardSource, /regionRegenTargetEdges\.forEach/);
  assert.match(dashboardSource, /type: "skeleton_arrow_deleted"/);
  assert.match(dashboardSource, /onFocusEdge=/);
  assert.match(dashboardSource, /detailViews: \{ \.\.\.current\.guidedDialogue\.detailViews, skeleton: "preview" \}/);
  assert.match(previewSource, /vectorEffect="non-scaling-stroke"/);
  assert.match(previewSource, /onPointerDown=\{\(event\) => \{/);
  const groupHitTargets = previewSource.indexOf("plan.nodes.filter(isDiagramGroupNode).map(focusTargetRect)");
  const edgeHitTargets = previewSource.indexOf("onFocusEdge ? plan.edges.map");
  const moduleHitTargets = previewSource.indexOf("plan.nodes.filter((node) => !isDiagramGroupNode(node)).map(focusTargetRect)");
  assert.ok(groupHitTargets < edgeHitTargets && edgeHitTargets < moduleHitTargets);
  assert.doesNotMatch(dashboardSource, /<h2>\{studioSkeleton\.title\}<\/h2>/);
  assert.doesNotMatch(dashboardSource, /GuidedConversationPanel/);
  assert.doesNotMatch(dashboardSource, /skeleton_view_preview/);
  assert.doesNotMatch(dashboardSource, /restored_skeleton_summary/);
  assert.match(dashboardSource, /"skeleton_region_regenerated"/);
  assert.match(dashboardSource, /"skeleton_region_failed"/);
  assert.match(dashboardSource, /type: "skeleton_region_reverted"/);
  assert.match(dashboardSource, /"skeleton_region_instruction"/);
  assert.match(dashboardSource, /"skeleton_global_regenerated"/);
  assert.match(dashboardSource, /"skeleton_global_instruction"/);
});

test("Idea Spark navigator no longer lists Skeleton as its own step", () => {
  assert.doesNotMatch(ideaSparkFlowSource, /"skeleton",\n  "style"/);
  assert.match(ideaSparkFlowSource, /skeleton: "Skeleton"/);
  assert.match(dashboardSource, /if \(step === "skeleton"\) return "layout"/);
  assert.match(workspaceStateSource, /storedStudioStep === "skeleton"\s*\?\s*"layout"/);
});

test("persisted Edit step normalizes to Candidate like Skeleton to Layout", () => {
  assert.doesNotMatch(ideaSparkFlowSource, /"candidate",\n  "edit"/);
  assert.match(dashboardSource, /if \(step === "edit"\) return "candidate"/);
  assert.match(workspaceStateSource, /storedStudioStep === "edit"\s*\?\s*"candidate"/);
  assert.match(workspaceStateSource, /activeStudyStage === "refine"\s*\?\s*"candidate"/);
});

const journeyTreeSource = readFileSync(
  new URL("../components/journey-tree.tsx", import.meta.url),
  "utf8",
);

test("History is batched per generation, each run fanning out and gathering on its own", () => {
  assert.match(journeyTreeSource, /function buildRunBatches/);
  // History shows the real skeleton, drawn by the Layout renderer, not a sketch.
  assert.match(journeyTreeSource, /<LayoutPngPreview plan=\{plan\} compact \/>/);
  assert.doesNotMatch(journeyTreeSource, /strokeDasharray/);
  assert.match(journeyTreeSource, /id: "structure"/);
  assert.match(journeyTreeSource, /id: "style"/);
  assert.match(journeyTreeSource, /id: "match"/);
  assert.match(journeyTreeSource, /className=\{styles\.runBatch\}/);
  assert.match(journeyTreeSource, /Run \{index \+ 1\}/);
  // Each run header restores that generation's snapshot, not just the figure card.
  assert.match(journeyTreeSource, /className=\{styles\.runRestore\}/);
  assert.match(journeyTreeSource, /onRestore\(restoreNode\.id\)/);
  assert.match(journeyTreeSource, /restoreCurrent \? "Current" : "Restore"/);
  assert.match(dashboardSource, /handleRestoreIdea\(nodeId, \{ remainOnHistory: true \}\)/);
  // Skeleton thumbs are block-level; they must not live inside <button>.
  assert.match(journeyTreeSource, /role="button"\s*\n\s*tabIndex=\{0\}\s*\n\s*className=\{styles\.tile\}/);
  assert.match(journeyTreeSource, /className=\{styles\.fork\}/);
  assert.match(journeyTreeSource, /className=\{styles\.gather\}/);
  // One pooled supply line for every run was the thing being replaced.
  assert.doesNotMatch(journeyTreeSource, /function buildFlow\b/);
  assert.doesNotMatch(journeyTreeSource, /function nodeHero/);
  assert.doesNotMatch(journeyTreeSource, /Trace choices/);
});

test("a History batch marks ingredients an earlier run already stood on", () => {
  assert.match(journeyTreeSource, /reused: seen\.has\(card\.key\)/);
  assert.match(journeyTreeSource, /for \(const key of batchKeys\) seen\.add\(key\)/);
  assert.match(journeyTreeSource, /styles\.flowCardReused/);
  assert.match(journeyTreeSource, /className=\{styles\.reusedTag\}/);
});

test("History keeps the style reference and every Match choice on their own tracks", () => {
  assert.match(journeyTreeSource, /referenceCard\("Style ref", snapshot\.styleReferenceId/);
  assert.match(journeyTreeSource, /resolveWorkspaceIcon\(iconId, customIcons\)/);
  assert.match(journeyTreeSource, /caption: "Font"/);
  assert.match(journeyTreeSource, /caption: "Colors"/);
  assert.match(journeyTreeSource, /historyMatchIngredients\(snapshot\)/);
  assert.match(journeyTreeSource, /label: "Match"/);
});

test("every History thumbnail can be opened full size without restoring the run", () => {
  const journeyStyles = readFileSync(
    new URL("../components/journey-tree.module.css", import.meta.url),
    "utf8",
  );
  assert.match(journeyTreeSource, /setZoom\(\{ caption: card\.caption/);
  assert.match(journeyTreeSource, /className=\{styles\.heroZoom\}/);
  assert.match(journeyTreeSource, /className=\{styles\.lightbox\}/);
  // Enlarging must not be wired to the restore handler.
  assert.match(journeyTreeSource, /const restore = \(\) => \{/);
  assert.match(journeyStyles, /\.lightboxBody \.planPreview \{/);
  // Tracks are different lengths, so the gather side stretches to line the
  // vertical bus up across every row.
  assert.match(journeyStyles, /\.gather \{\n  flex: 1 0 40px;\n\}/);
});

test("History places each Edit to the right of the Candidate it revised", () => {
  const journeyStyles = readFileSync(
    new URL("../components/journey-tree.module.css", import.meta.url),
    "utf8",
  );
  assert.match(journeyTreeSource, /className=\{styles\.candidateColumn\}/);
  assert.match(journeyTreeSource, /batch\.edits\.map\(\(edit\) =>/);
  assert.match(journeyTreeSource, /className=\{styles\.link\} aria-hidden="true"/);
  assert.doesNotMatch(journeyTreeSource, /styles\.downLink/);
  assert.match(journeyStyles, /\.candidateColumn \{\n  display: flex;\n  align-items: center;/);
});

test("a History figure names only what its run changed", () => {
  assert.match(journeyTreeSource, /function aspectSignatures/);
  assert.match(journeyTreeSource, /function diffAspects/);
  assert.match(journeyTreeSource, /const ASPECT_LABEL: Record<AspectKey, string>/);
  assert.match(journeyTreeSource, /"First run"/);
  assert.doesNotMatch(journeyTreeSource, /className=\{styles\.inheritLine\}/);
  // Geometry and per-node icon bindings have to move the signature, otherwise
  // an edit that only nudges the layout would render as a no-op step.
  assert.match(journeyTreeSource, /Math\.round\(node\.x\)/);
  assert.match(journeyTreeSource, /nodeIconBindings \?\? \{\}\)/);
});

test("Style page shows what was extracted under each reference image", () => {
  const canvasStudioSource = readFileSync(
    new URL("../components/canvas-studio.tsx", import.meta.url),
    "utf8",
  );
  assert.match(canvasStudioSource, /function renderReferenceExtraction/);
  assert.match(canvasStudioSource, /\{renderReferenceExtraction\(item\.id\)\}/);
  assert.match(canvasStudioSource, /icon\.sourceReferenceId === referenceId/);
  assert.doesNotMatch(canvasStudioSource, /palette\.sourceReferenceId === referenceId/);
  assert.doesNotMatch(canvasStudioSource, /fontSources\[fontId\]\?\.sourceReferenceId === referenceId/);
  assert.doesNotMatch(canvasStudioSource, /renderExtractedStyleStrip/);
});

test("Match binds icons from the diagram without numbering modules", () => {
  const structurePanelSource = readFileSync(
    new URL("../components/scientific-structure-panel.tsx", import.meta.url),
    "utf8",
  );
  const pngPreviewSource = readFileSync(
    new URL("../components/layout-png-preview.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(structurePanelSource, /ordinal: `Block \$\{index \+ 1\}`/);
  assert.match(structurePanelSource, /selectedModule\?\.label \?\? "Select a module"/);
  assert.match(structurePanelSource, /isMapping \? null : \(/);
  assert.match(structurePanelSource, /icon-mapping-workspace \$\{isMapping \? "is-icon-only" : ""\}/);
  assert.doesNotMatch(pngPreviewSource, /showNodeOrdinals/);
  assert.doesNotMatch(dashboardSource, /showNodeOrdinals/);
  assert.doesNotMatch(pngPreviewSource, /fillText\(String\(index \+ 1\)/);
});

test("the editor keeps notes beside the canvas and revisions underneath it", () => {
  const editorSource = readFileSync(
    new URL("../components/svg-editor-studio.tsx", import.meta.url),
    "utf8",
  );
  assert.match(editorSource, /className="editor-modify-canvas"/);
  assert.match(editorSource, /className="editor-notes-rail"/);
  assert.match(editorSource, /className="editor-results-strip"/);
  assert.match(editorSource, /className="editor-revision-board"/);
  assert.doesNotMatch(editorSource, /className="editor-results-rail"/);
  // The strip is the edit output, so the dialog must not also mount the
  // workspace-wide version log next to it.
  assert.doesNotMatch(dashboardSource, /FigureVersionPanel/);
});

test("each mask carries typed wording that persists with the refine session", () => {
  const editorSource = readFileSync(
    new URL("../components/svg-editor-studio.tsx", import.meta.url),
    "utf8",
  );
  assert.match(editorSource, /function handleEditTargetTextChange/);
  assert.match(editorSource, /handleEditTargetTextChange\(target\.id, \{ name: event\.target\.value \}\)/);
  assert.match(editorSource, /handleEditTargetTextChange\(target\.id, \{ description: event\.target\.value \}\)/);
  assert.match(editorSource, /editTargets: session\.editTargets\.map/);
  // Whole-figure wording moved out of the cramped toolbar input.
  assert.match(editorSource, /className="textarea editor-note-input"/);
  assert.doesNotMatch(editorSource, /aria-label="Instructions for the revision"/);
});

test("masks share one selection between the canvas and the notes", () => {
  const editorSource = readFileSync(
    new URL("../components/svg-editor-studio.tsx", import.meta.url),
    "utf8",
  );
  const canvasSource = readFileSync(
    new URL("../components/annotation-canvas-impl.tsx", import.meta.url),
    "utf8",
  );
  // Canvas -> notes.
  assert.match(canvasSource, /onSelectMarkupRef\.current\?\.\(nextId\)/);
  assert.match(editorSource, /onSelectMarkup=\{handleSelectMarkup\}/);
  // Notes -> canvas.
  assert.match(editorSource, /focusShapeId=\{focusShapeId\}/);
  assert.match(canvasSource, /editor\.select\(shape\.id\)/);
  // Only mask badges remain on the canvas.
  assert.match(canvasSource, /hichart-markup-badge/);
  assert.doesNotMatch(canvasSource, /isAnnotationRecord|setAnnotationLabel|Arrow note/);
});

test("the Edit dialog opens straight on the canvas, with no stacked headings", () => {
  const editorSource = readFileSync(
    new URL("../components/svg-editor-studio.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(editorSource, /editor-console-header/);
  assert.doesNotMatch(editorSource, /Refine the selected candidate/);
  assert.doesNotMatch(editorSource, /editor-stage-lead/);
  assert.doesNotMatch(editorSource, /Draw markup and generate a clean revision/);
  // The toolbar keeps its actions.
  assert.match(editorSource, /editor-modify-actions/);
  // Only the candidate title is left above the canvas.
  assert.doesNotMatch(dashboardSource, /Refine this figure, then hit Done/);
  assert.doesNotMatch(dashboardSource, /<span className="label-text">Edit candidate<\/span>/);
});

test("the canvas toolbar exposes only Mask", () => {
  const canvasSource = readFileSync(
    new URL("../components/annotation-canvas-impl.tsx", import.meta.url),
    "utf8",
  );
  assert.match(canvasSource, /<MaskToolbarItem \/>/);
  assert.doesNotMatch(canvasSource, /AnnotationToolbarItem|ANNOTATION_TOOL_ID|hichart-annotation/);
  // Opening Edit lands on Mask.
  assert.match(canvasSource, /selectMaskTool\(editor\);\s*\n\s*notifyChange\(editor\);/);
  // Saved arrows from older sessions are removed during migration.
  assert.match(canvasSource, /legacyArrowIds/);
});

test("the figure keeps full opacity when a saved canvas is reopened", () => {
  const canvasSource = readFileSync(
    new URL("../components/annotation-canvas-impl.tsx", import.meta.url),
    "utf8",
  );
  const artifactSource = readFileSync(
    new URL("./evolve-artifact.ts", import.meta.url),
    "utf8",
  );
  // Saved sessions drop the figure pixels so the snapshot stays small, but
  // keep the figure shape so reopening can put the image back in place.
  assert.match(artifactSource, /src: null/);
  assert.doesNotMatch(artifactSource, /hichartFigureBackground === true\) return false/);
  assert.match(canvasSource, /opacity: 1,\s*\n\s*isLocked: true/);
  // Canvases saved before that fix come back washed out and get healed.
  assert.match(canvasSource, /hydrateFigureBackgroundAsset\(editor, existing, imageUrl\)/);
  assert.match(canvasSource, /ignoreShapeLock: true/);
  // Reopening must wait for the saved session, otherwise a blank canvas is
  // created at (0, 0) and the markup lands under the figure.
  assert.match(editorSource, /refineHydratedVariantId === selectedVariant\.id/);
  assert.doesNotMatch(editorSource, /currentCanvasSnapshot \? "restored"/);
});

test("a mark is deleted from its note in one click, with no tool switching", () => {
  const editorSource = readFileSync(
    new URL("../components/svg-editor-studio.tsx", import.meta.url),
    "utf8",
  );
  const canvasSource = readFileSync(
    new URL("../components/annotation-canvas-impl.tsx", import.meta.url),
    "utf8",
  );
  assert.match(canvasSource, /deleteMarkup\(shapeId: string\)/);
  assert.match(canvasSource, /editor\.deleteShapes\(\[shape\.id\]\)/);
  assert.match(canvasSource, /editor\.deleteShapes\(\[shape\.id\]\);\s*\n\s*notifyChange\(editor\)/);
  assert.match(editorSource, /function removeMarkup/);
  assert.match(editorSource, /annotationCanvasRef\.current\?\.deleteMarkup\(shapeId\)/);
  assert.match(editorSource, /event\.stopPropagation\(\);\s*\n\s*removeMarkup\(target\.id\)/);
  // Inputs keep focus instead of asking the canvas to select the same mark.
  assert.match(editorSource, /closest\("input, textarea, button"\)/);
  assert.match(editorSource, /event\.target === event\.currentTarget/);
});

test("the Candidate page shows the figure, not a readout of how it was built", () => {
  // Snapshot chips restated the left rail, and the footer title was a slice of
  // the generation prompt.
  assert.doesNotMatch(candidateSource, /snapshotChips/);
  assert.doesNotMatch(candidateSource, /Saved prompt revision/);
  assert.doesNotMatch(candidateSource, /icons mapped/);
  assert.doesNotMatch(candidateSource, /snapshots/);
  assert.doesNotMatch(dashboardSource, /Inspect the figure above/);
  assert.doesNotMatch(dashboardSource, /metaTitle: candidateVariant\.title/);
  // The bar drops its text column entirely when a stage has nothing to say.
  const actionBarSource = readFileSync(
    new URL("../components/stage-action-bar.tsx", import.meta.url),
    "utf8",
  );
  assert.match(actionBarSource, /\{metaTitle \|\| meta \?/);
});

test("Done closes the Edit dialog without dropping the revision it started", () => {
  const editorSource = readFileSync(
    new URL("../components/svg-editor-studio.tsx", import.meta.url),
    "utf8",
  );
  const jobsSource = readFileSync(new URL("./modify-jobs.ts", import.meta.url), "utf8");
  // The workspace-level reconciler loops until the job settles, so an
  // unopened or unmounted editor can no longer strand a persisted spinner.
  assert.match(jobsSource, /for \(;;\) \{[\s\S]{0,160}?getVariantGenerationJob/);
  assert.match(jobsSource, /isPendingModifyJobExpired\(pending\)/);
  assert.match(jobsSource, /isMissingGenerationJobError\(error\)/);
  assert.doesNotMatch(editorSource, /while \(mountedRef\.current\)/);
  assert.doesNotMatch(editorSource, /mountedRef/);
  assert.doesNotMatch(editorSource, /getVariantGenerationJob/);
  assert.match(jobsSource, /export function setModifyJobWatched/);
  assert.match(jobsSource, /export function useModifyJobReconciler/);
  // The Candidate page reports a revision that is still running.
  assert.match(candidateSource, /pendingRevision/);
  assert.match(candidateSource, /Closing Edit did not stop the run/);
  assert.match(dashboardSource, /const pendingModifyJobList = useModifyJobReconciler\(\)/);
  assert.match(dashboardSource, /pendingRevision=\{pendingRevision\}/);
});

test("deleting an Edit keeps a Deleted tombstone in History", () => {
  const journeyTreeStyles = readFileSync(
    new URL("../components/journey-tree.module.css", import.meta.url),
    "utf8",
  );
  assert.match(editorSource, /variant\.id === variantId \? \{ \.\.\.variant, deletedAt \} : variant/);
  assert.match(editorSource, /node\.variantId === variantId[\s\S]{0,120}?deletedAt/);
  assert.match(editorSource, /kept it in History/);
  assert.doesNotMatch(editorSource, /current\.variants\.filter\(\(variant\) => variant\.id !== variantId\)/);
  assert.match(journeyTreeSource, /node\.deletedAt \|\| variant\?\.deletedAt/);
  assert.match(journeyTreeSource, />Deleted</);
  assert.match(journeyTreeStyles, /\.figureDeleted/);
  assert.match(workspaceStateSource, /const deletedAtByVariantId = new Map/);
  assert.match(workspaceStateSource, /if \(node\.deletedAt\)/);
});

test("skeleton and candidate runs live on the backend, so leaving the page cannot cancel them", () => {
  const apiSource = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
  // Every long generation is queued and polled instead of being held open on
  // one request.
  assert.match(apiSource, /startDiagramSkeletonJob/);
  assert.match(apiSource, /"\/figures\/skeleton\/jobs"/);
  assert.match(apiSource, /async function awaitJobResult/);
  assert.match(apiSource, /async function awaitRestartableJob/);
  assert.match(apiSource, /const BACKEND_JOB_MISSING_RESTART_LIMIT = 3/);
  assert.match(apiSource, /missingRestartCount >= BACKEND_JOB_MISSING_RESTART_LIMIT/);
  assert.match(apiSource, /generateDiagramSkeleton[\s\S]{0,280}awaitRestartableJob/);
  assert.match(apiSource, /generateVariants[\s\S]{0,280}awaitRestartableJob/);
  assert.doesNotMatch(apiSource, /apiFetch<DiagramSkeletonResponse>\("\/figures\/skeleton"/);
  // Layout reads its busy state from the workspace, so the spinner survives a
  // trip to another stage.
  assert.match(layoutSource, /const generatingReferenceId = layoutSkeletonGenerationInProgress \? layoutReferenceId : null/);
  assert.doesNotMatch(layoutSource, /setGeneratingReferenceId/);
});

test("Match only navigates to Candidate; generation is started there", () => {
  // Match used to run the generation and navigate afterwards, so the button
  // looked dead for the minutes the figure took.
  assert.match(
    dashboardSource,
    /primaryLabel: continueToStepLabel\("candidate"\),\s*\n\s*onPrimary: \(\) => openIdeaSparkStep\("candidate"\),/,
  );
  // On Candidate the same bar is the generate button, so it says so.
  assert.match(dashboardSource, /primaryLabel: generating \? "Generating…" : "Generate Candidate"/);
});

test("Layout offers an explicit Select skeleton button once alternatives exist", () => {
  // One skeleton needs no chooser; from the second on, every card can be made
  // the one the rest of the flow uses.
  assert.match(layoutSource, /diagramSkeletonCandidates\.length > 1 \? \(/);
  assert.match(layoutSource, /\{active \? "Selected ✓" : "Select skeleton"\}/);
  assert.match(layoutSource, /disabled=\{active\}/);
  assert.match(layoutSource, /active \? styles\.skeletonSelectButtonActive : "btn-primary"/);
  assert.match(layoutSource, /aria-pressed=\{active\}/);
  assert.match(layoutSource, /onClick=\{\(\) => handleSelectSkeletonCandidate\(candidate\)\}/);
  const layoutStyles = readFileSync(
    new URL("../components/layout-studio.module.css", import.meta.url),
    "utf8",
  );
  assert.match(layoutStyles, /\.skeletonCardActions \{/);
  assert.match(layoutStyles, /\.skeletonSelectButtonActive:disabled \{/);
  assert.match(layoutStyles, /background: #166534/);
});

test("selecting a Layout for generation selects its latest Skeleton or starts its first generation", () => {
  assert.match(layoutSource, /function selectLayoutForGeneration\(reference: ReferenceItem\)/);
  assert.match(layoutSource, /latestSkeletonForReference\(diagramSkeletonCandidates, reference\.id\)/);
  assert.match(layoutSource, /if \(latestSkeleton\) \{\s*handleSelectSkeletonCandidate\(latestSkeleton\);\s*return;/);
  assert.match(layoutSource, /handleGenerateSkeleton\(reference\);/);
  assert.match(layoutSource, /onClick=\{\(\) => selectLayoutForGeneration\(reference\)\}/);
  assert.doesNotMatch(layoutSource, /disabled=\{selected \|\| busy\}/);
});

test("Layout Clear all arrows can undo its most recent clear", () => {
  assert.match(dashboardSource, /setClearedSkeletonConnections\(\{/);
  assert.match(dashboardSource, /function undoClearSkeletonConnections\(/);
  assert.match(dashboardSource, /snapshot\.previousXml/);
  assert.match(dashboardSource, /Undo clear/);
  assert.match(dashboardSource, /clearedSkeletonConnections\.clearedXml !== studioSkeleton\.xml/);
  assert.match(appStyles, /\.skeleton-clear-actions \{/);
});

test("font choices use image matching while color extraction stays local", () => {
  const apiSource = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
  assert.match(apiSource, /"\/style\/analyze"/);
  assert.match(apiSource, /analyzeStyleReference/);
  assert.match(styleSource, /extractCuratedPaletteFromImageRegion/);
  assert.match(styleSource, /analyzeStyleFontsFromImage/);
  assert.doesNotMatch(styleSource, /extractAccentPaletteFromImageRegion/);
  assert.doesNotMatch(structureSource, /recommendFontReferences|recommendPaletteReferences/);
});

test("the Candidate edit dialog closes with Done and does not jump to History", () => {
  assert.match(dashboardSource, /style-detail-dialog candidate-edit-dialog/);
  // Done in the footer and the backdrop are the only ways out; no second
  // Close button crowding the header.
  assert.doesNotMatch(dashboardSource, /btn btn-secondary btn-sm" onClick=\{closeCandidateEditor\}/);
  assert.doesNotMatch(dashboardSource, /closeCandidateEditor\(\);\s*\n\s*openReviewWorkspace\(\);\s*\n\s*\}\}\s*\n\s*>\s*\n\s*\{continueToStepLabel\("review"\)\}/);
});

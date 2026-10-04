import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workbenchSource = readFileSync(
  new URL("../components/figure-workbench.tsx", import.meta.url),
  "utf8",
);
const dashboardSource = readFileSync(
  new URL("../components/project-dashboard.tsx", import.meta.url),
  "utf8",
);
const styleSource = readFileSync(
  new URL("../components/canvas-studio.tsx", import.meta.url),
  "utf8",
);
const extractorSource = readFileSync(
  new URL("../components/sam-icon-extractor.tsx", import.meta.url),
  "utf8",
);
const dashboardStyles = readFileSync(
  new URL("../components/project-dashboard-workspace-sheet.module.css", import.meta.url),
  "utf8",
);
const globalStyles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("retrieval pocket actions state their complete effect", () => {
  assert.match(workbenchSource, /Add to \$\{REFERENCE_ROLE_LABELS\[role\]\} pocket/);
  assert.match(workbenchSource, /Remove from \$\{REFERENCE_ROLE_LABELS\[role\]\} pocket/);
  assert.match(workbenchSource, /aria-pressed=\{isAdded\}/);
  assert.match(workbenchSource, /remove \? "M4 10h12" : "M10 4v12M4 10h12"/);
  assert.match(workbenchSource, /<CardActionIcon remove=\{isAdded\}/);
});

test("Retrieval omits icon extraction while Style keeps it available", () => {
  assert.doesNotMatch(workbenchSource, /SamIconExtractor/);
  assert.doesNotMatch(workbenchSource, /reference-action-btn-extract/);
  assert.doesNotMatch(workbenchSource, /Auto \/ manual icon extraction/);
  assert.match(styleSource, /<SamIconExtractor/);
  assert.match(styleSource, /onExtract=\{addStyleIconCandidate\}/);
  assert.match(styleSource, /showStatus=\{false\}/);
  assert.match(styleSource, /onStatusChange=\{setStyleIconExtractionStatus\}/);
  assert.match(styleSource, /style-icon-inline-status/);
  assert.match(styleSource, /styleIconExtractionStatus\.error \? "Error" : styleIconExtractionStatus\.busy \? "Loading" : "Ready"/);
  assert.doesNotMatch(styleSource, /<div className="sam-icon-extractor-status" aria-live="polite">/);
  assert.match(globalStyles, /\.style-kit-choice-head \.style-icon-inline-status \{[\s\S]{0,180}margin-top: 0;[\s\S]{0,180}color: #13775f/);
  assert.match(globalStyles, /\.style-kit-choice-head \.style-icon-inline-status i \{[\s\S]{0,100}display: block;[\s\S]{0,100}flex: 0 0 7px/);
  assert.match(styleSource, /styleIconDraftItems\.map/);
  assert.match(styleSource, /sam-icon-extractor-review-item/);
  assert.match(styleSource, /commitStyleIconDraft\(\)/);
  assert.doesNotMatch(extractorSource, /Current Icon pocket|Save selected/);
  assert.match(globalStyles, /grid-template-columns: minmax\(0, 1\.1fr\) minmax\(620px, 1fr\)/);
});

test("right-side Layout and Style pocket cards can be removed", () => {
  assert.match(dashboardSource, /creative-pocket-reference-delete/);
  assert.match(dashboardSource, /removeFromDashboardPocket\(item, pocketRole\)/);
  assert.match(dashboardSource, /Remove from \{pocketRole === "layout" \? "Layout" : "Style"\} pocket/);
});

test("Layout and Style cards keep distinct muted action colors", () => {
  assert.match(dashboardSource, /"data-source-role": role/);
  assert.match(dashboardSource, /label: "Layout Pocket"/);
  assert.match(dashboardSource, /label: "Style Pocket"/);
  assert.match(dashboardSource, /dashboardSheetStyles\.studioSourceLabel/);
  assert.match(dashboardSource, /M10 7v3\.25M5\.5 13v-2\.75h9V13/);
  assert.match(dashboardSource, /M10 2\.75a7\.25/);
  assert.match(dashboardStyles, /data-source-role="layout"/);
  assert.match(dashboardStyles, /data-source-role="style"/);
  assert.match(dashboardStyles, /\.studioSourceLabel svg/);
  assert.match(globalStyles, /--layout-reference-soft: #edf3ee/);
  assert.match(globalStyles, /--style-reference-soft: #eef1f4/);
  assert.match(globalStyles, /\.reference-action-btn-layout/);
  assert.match(globalStyles, /\.reference-action-btn-style/);
});

test("Studio source cards delete and focus their matching Retrieval card", () => {
  assert.match(dashboardSource, /studioSourceRemove/);
  assert.match(dashboardSource, /removeFromDashboardPocket\(item, role\)/);
  assert.match(dashboardSource, /openStudioSource\(item, role\)/);
  assert.match(
    dashboardSource,
    /pocketFocusRequest=\{activeIdeaSparkStep === "retrieval" \? retrievalPocketFocus : null\}/,
  );
  // Enlarging is its own button so the card click stays a pure locate action.
  assert.match(dashboardSource, /pocket-zoom-btn/);
  assert.match(workbenchSource, /data-retrieval-reference-id=\{reference\.id\}/);
  assert.match(workbenchSource, /scrollIntoView\(\{ behavior: "smooth", block: "nearest" \}\)/);
  assert.match(dashboardStyles, /\.studioSourceRemove/);
  assert.match(globalStyles, /\.paper-card\.is-pocket-focused/);
});

test("Study Retrieval removes pocket roles directly", () => {
  assert.match(workbenchSource, /if \(studyMode\) removeFromPocket\(reference, role\)/);
  assert.match(workbenchSource, /onPocketAction\?\.\(item, role, "remove"\)/);
});

test("image preview escapes the scrolling workspace", () => {
  assert.match(workbenchSource, /import \{ createPortal \} from "react-dom"/);
  assert.match(workbenchSource, /portalTarget && previewReference \? createPortal/);
  assert.match(workbenchSource, /previewReference\.imageDataUrl \?\? previewReference\.thumbnailUrl/);
});

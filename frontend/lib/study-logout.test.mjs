import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appShellSource = readFileSync(
  new URL("../components/app-shell.tsx", import.meta.url),
  "utf8",
);
const workspaceSource = readFileSync(
  new URL("./workspace-state.ts", import.meta.url),
  "utf8",
);
const appStyles = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const studyEntrySource = readFileSync(
  new URL("../components/study-entry-gate.tsx", import.meta.url),
  "utf8",
);
const journeyTreeSource = readFileSync(
  new URL("../components/journey-tree.tsx", import.meta.url),
  "utf8",
);

test("the top-right study logout saves progress without displaying the participant ID", () => {
  assert.match(appShellSource, /hasStudySession \? \(/);
  assert.doesNotMatch(appShellSource, /Participant \{/);
  assert.doesNotMatch(appShellSource, /app-participant-badge/);
  assert.match(appShellSource, /void flushStudyLog\(state\)/);
  assert.match(appShellSource, /logoutUserWorkspace\(\)/);
  assert.match(appShellSource, /router\.replace\("\/"\)/);
  assert.match(appShellSource, /Log out\s*<\/button>/);
  assert.match(appStyles, /\.app-study-session \{/);
  assert.doesNotMatch(appStyles, /\.app-participant-badge/);
});

test("logging out preserves the user-scoped workspace but clears the active participant", () => {
  const logoutBlock = workspaceSource.slice(
    workspaceSource.indexOf("function logoutUserWorkspace()"),
    workspaceSource.indexOf("useEffect(() => {", workspaceSource.indexOf("function logoutUserWorkspace()")),
  );
  assert.match(logoutBlock, /persistWorkspace\(userWorkspaceStorageKey\(snapshot\.studyProfile\.userId\), snapshot\)/);
  assert.match(logoutBlock, /window\.localStorage\.removeItem\(STORAGE_KEY\)/);
  assert.match(logoutBlock, /studyProfile: null/);
  assert.match(logoutBlock, /studySessionStatus: "setup"/);
  assert.match(workspaceSource, /workspaceLoadEpochRef\.current !== loadEpoch/);
});

test("participant workspaces never use the browser-wide active workspace key", () => {
  assert.match(
    workspaceSource,
    /if \(normalizeStudyProfile\(parsed\.studyProfile\)\) \{\s*window\.localStorage\.removeItem\(STORAGE_KEY\);\s*return;/,
  );
  const persistActiveBlock = workspaceSource.slice(
    workspaceSource.indexOf("function persistActiveWorkspace("),
    workspaceSource.indexOf("function loadUserWorkspace("),
  );
  assert.match(persistActiveBlock, /if \(userId\) \{/);
  assert.match(persistActiveBlock, /window\.localStorage\.removeItem\(STORAGE_KEY\)/);
  assert.match(persistActiveBlock, /persistWorkspace\(userWorkspaceStorageKey\(userId\), nextState\)/);
  assert.match(persistActiveBlock, /persistWorkspace\(STORAGE_KEY, nextState\)/);
  assert.match(workspaceSource, /persistActiveWorkspace\(snapshot\)/);
});

test("Pocket images are cached and hydrated with the participant workspace", () => {
  assert.match(workspaceSource, /function referenceImageStorageKeys\(/);
  assert.match(workspaceSource, /userWorkspaceStorageKey\(cleanUserId\).*reference:/s);
  assert.match(workspaceSource, /function persistReferenceImages\(/);
  assert.match(workspaceSource, /function hydrateReferenceImages\(/);
  assert.match(workspaceSource, /persistReferenceImages\(key, nextState\)/);
  assert.match(workspaceSource, /hydrateReferenceImages\(workspaceKey, restored, cleanUserId\)/);
  assert.match(workspaceSource, /board: mergeHydratedReferences\(current\.board, hydratedReferenceState\.board\)/);
});

test("Skeleton XML is cached outside localStorage and hydrated after refresh", () => {
  assert.match(workspaceSource, /function skeletonStorageKeys\(/);
  assert.match(workspaceSource, /function persistSkeletonCandidates\(/);
  assert.match(workspaceSource, /function hydrateSkeletonCandidates\(/);
  assert.match(workspaceSource, /persistSkeletonCandidates\(key, nextState\)/);
  assert.match(workspaceSource, /hydrateSkeletonCandidates\(workspaceKey, restored, cleanUserId\)/);
  assert.match(workspaceSource, /diagramSkeletonCandidates = mergeHydratedSkeletonCandidates\(/);
});

test("the user study exposes one current figure without numbered figure switching", () => {
  assert.doesNotMatch(studyEntrySource, /FigureSwitcher/);
  assert.doesNotMatch(studyEntrySource, /createNewIdeaRoot/);
  assert.doesNotMatch(studyEntrySource, /toolbarAccessory=/);
  assert.match(studyEntrySource, /<ProjectDashboard \/>/);
  assert.match(journeyTreeSource, />Current figure<\/strong>/);
  assert.doesNotMatch(journeyTreeSource, /aria-label="Figures"/);
  assert.doesNotMatch(journeyTreeSource, /setPickedRootId/);
});

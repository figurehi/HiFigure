import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workbenchSource = readFileSync(
  new URL("../components/figure-workbench.tsx", import.meta.url),
  "utf8",
);
const globalStyles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const workspaceStateSource = readFileSync(new URL("workspace-state.ts", import.meta.url), "utf8");

test("retrieval uses a persistent infinite masonry layout", () => {
  assert.match(workbenchSource, /RETRIEVAL_BATCH_SIZE = 12/);
  assert.match(workbenchSource, /RETRIEVAL_COLUMN_OPTIONS = \[2, 3, 4, 5, 6\]/);
  assert.match(workbenchSource, /RETRIEVAL_COLUMN_STORAGE_KEY/);
  assert.match(workbenchSource, /Images per row/);
  assert.match(workbenchSource, /className="results-list results-masonry scroll-y"/);
  assert.doesNotMatch(workbenchSource, /similar-results-grid/);
  assert.doesNotMatch(workbenchSource, /Find similar references/);
  assert.match(workbenchSource, /new IntersectionObserver/);
  assert.match(workbenchSource, /const retrievalSession = state\.retrievalSession/);
  assert.doesNotMatch(workbenchSource, /useState<SearchGoal \| null>/);
  assert.match(workspaceStateSource, /retrievalSession: RetrievalSession/);
  assert.match(workbenchSource, /appendUniqueReferences/);
  assert.match(workbenchSource, /const candidateReferences = references;/);
  assert.doesNotMatch(workbenchSource, /mergePinnedCandidateReferences/);
  assert.match(workbenchSource, /partitionStableMasonry/);
  assert.match(workbenchSource, /results-masonry-column/);
  assert.match(workbenchSource, /data-columns=\{retrievalColumnCount\}/);
  assert.doesNotMatch(workbenchSource, />Prev</);
  assert.doesNotMatch(workbenchSource, />Next</);
  assert.match(globalStyles, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(globalStyles, /column-count:/);
  assert.match(globalStyles, /\.results-masonry-column/);
  assert.match(globalStyles, /aspect-ratio: 16 \/ 9/);
});

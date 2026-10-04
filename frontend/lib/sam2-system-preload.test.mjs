import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appShellSource = readFileSync(
  new URL("../components/app-shell.tsx", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(new URL("./sam2-client.ts", import.meta.url), "utf8");
const extractorSource = readFileSync(
  new URL("../components/sam-icon-extractor.tsx", import.meta.url),
  "utf8",
);
const styleSource = readFileSync(
  new URL("../components/canvas-studio.tsx", import.meta.url),
  "utf8",
);

test("SAM2 starts with the app and the icon extractor reuses its worker", () => {
  assert.match(appShellSource, /useEffect\(\(\) => \{\s*preloadSam2\(\);\s*\}, \[\]\)/);
  assert.match(clientSource, /let worker: Worker \| null = null/);
  assert.match(clientSource, /instance\.postMessage\(\{ type: "init" \}\)/);
  assert.match(extractorSource, /const worker = preloadSam2\(\)/);
  assert.doesNotMatch(extractorSource, /new Worker/);
  assert.doesNotMatch(extractorSource, /worker\.terminate\(\)/);
});

test("closing Extract from Style warns about selected icons that have not been saved", () => {
  assert.match(styleSource, /setHasUnsavedExtractedIcons\(true\)/);
  assert.match(styleSource, /function requestStyleDetailClose\(\)/);
  assert.match(styleSource, /window\.confirm\(UNSAVED_EXTRACTED_ICONS_WARNING\)/);
  assert.match(styleSource, /window\.addEventListener\("beforeunload", onBeforeUnload\)/);
});

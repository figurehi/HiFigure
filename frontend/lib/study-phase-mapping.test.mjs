import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { defaultStudyStageForPhase, studyPhaseForStage } from "./study-phase.ts";

const stageUtilsSource = readFileSync(new URL("./study-stage-utils.ts", import.meta.url), "utf8");

test("maps the six detailed stages into Envision, Skeleton, and Evolve milestones", () => {
  assert.equal(studyPhaseForStage("brief"), "envision");
  assert.equal(studyPhaseForStage("references"), "envision");
  assert.equal(studyPhaseForStage("skeleton"), "externalize");
  assert.equal(studyPhaseForStage("compose"), "evolve");
  assert.equal(studyPhaseForStage("refine"), "evolve");
  assert.equal(studyPhaseForStage("review"), "evolve");
});

test("uses References, Skeleton, and Compose as phase entry stages", () => {
  assert.equal(defaultStudyStageForPhase("envision"), "references");
  assert.equal(defaultStudyStageForPhase("externalize"), "skeleton");
  assert.equal(defaultStudyStageForPhase("evolve"), "compose");
});

test("shows Skeleton alone under Externalize and all output work under Evolve", () => {
  assert.match(
    stageUtilsSource,
    /id: "externalize"[\s\S]*?stages: \["skeleton"\]/,
  );
  assert.match(
    stageUtilsSource,
    /id: "evolve"[\s\S]*?stages: \["compose", "refine", "review"\]/,
  );
});

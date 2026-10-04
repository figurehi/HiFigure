import assert from "node:assert/strict";
import test from "node:test";

import {
  getParticipantStudyTasks,
  getParticipantTaskAssignment,
  PARTICIPANT_STUDY_TASKS,
  STUDY_TASKS,
  getStudyTask,
} from "./study-config";

test("catalog contains two modular tasks for each requested research direction", () => {
  assert.equal(STUDY_TASKS.length, 6);
  assert.deepEqual(
    Object.fromEntries(
      ["NLP", "CV", "RL / ML"].map((category) => [
        category,
        STUDY_TASKS.filter((task) => task.category === category).length,
      ]),
    ),
    { NLP: 2, CV: 2, "RL / ML": 2 },
  );
  assert.equal(new Set(STUDY_TASKS.map((task) => task.version)).size, STUDY_TASKS.length);
});

test("participant task selection excludes the RL / ML topic", () => {
  assert.equal(PARTICIPANT_STUDY_TASKS.length, 4);
  assert.deepEqual(
    [...new Set(PARTICIPANT_STUDY_TASKS.map((task) => task.category))],
    ["NLP", "CV"],
  );
  assert.deepEqual(getParticipantStudyTasks(STUDY_TASKS), PARTICIPANT_STUDY_TASKS);
});

test("participant IDs receive the balanced HiFigure task sequence without choosing", () => {
  const assignments = Array.from({ length: 8 }, (_, index) =>
    getParticipantTaskAssignment(`P${String(index + 1).padStart(2, "0")}`),
  );
  assert.deepEqual(assignments.map((assignment) => assignment.task.version), [
    "nlp-route-fuse-rag-v2",
    "cv-vlm-diffusion-bridge-v2",
    "nlp-plan-exec-agent-v2",
    "cv-active-view-vla-v2",
    "nlp-plan-exec-agent-v2",
    "cv-active-view-vla-v2",
    "nlp-route-fuse-rag-v2",
    "cv-vlm-diffusion-bridge-v2",
  ]);
  assert.deepEqual(
    assignments.map((assignment) => assignment.hifigurePeriod),
    [1, 1, 2, 2, 1, 1, 2, 2],
  );
  assert.equal(getParticipantTaskAssignment("P09").sequenceSlot, 1);
  assert.notEqual(
    getParticipantTaskAssignment("participant-without-number").task.category,
    "RL / ML",
  );
});

test("every task exposes a compact, deterministic, content-only prompt", () => {
  for (const task of STUDY_TASKS) {
    assert.equal("inspiration" in task, false, `${task.version}:inspiration`);
    const cardSummaryWordCount = task.cardSummary.trim().split(/\s+/).length;
    assert.ok(cardSummaryWordCount >= 15 && cardSummaryWordCount <= 20, `${task.version}:cardSummary`);
    assert.ok(task.methodOverview.length > 80, task.version);
    assert.equal(task.modules.length, 4, `${task.version}:modules`);
    assert.equal(task.flow.length, 3, `${task.version}:flow`);
    assert.equal(task.requirements.length, 4, `${task.version}:requirements`);
    assert.match(task.version, /-v2$/, task.version);

    for (const module of task.modules) {
      assert.equal(module.components.length, 3, `${task.version}:${module.id}:components`);
      assert.equal(module.steps.length, 2, `${task.version}:${module.id}:steps`);
    }

    const expectedPrompt = [
      "METHOD OVERVIEW",
      task.methodOverview,
      "",
      "REQUIRED MODULES",
      ...task.modules.map((module, index) =>
        `${index + 1}. ${module.title}: ${module.purpose} Components: ${module.components.join(", ")}.`,
      ),
      "",
      "MODULE INTERNALS AND STEPS",
      ...task.modules.map((module) => `${module.title}: ${module.steps.join(" -> ")}.`),
      "",
      "END-TO-END METHOD",
      ...task.flow.map((step, index) => `${index + 1}. ${step}`),
    ].join("\n");
    assert.equal(task.prompt, expectedPrompt, `${task.version}:prompt must match structured fields`);

    for (const heading of ["METHOD OVERVIEW", "REQUIRED MODULES", "MODULE INTERNALS AND STEPS", "END-TO-END METHOD"]) {
      assert.match(task.prompt, new RegExp(`(^|\\n)${heading}\\n`), `${task.version}:${heading}`);
    }
    for (const visualPhrase of [
      "landscape canvas",
      "left-to-right",
      "visual style",
      "editable vector",
      "line icon",
      "color palette",
      "whitespace",
      "typography",
      "legend",
      "dashed",
      "arrow",
      "module box",
      "paper scale",
      "layout",
      "style",
    ]) {
      assert.doesNotMatch(task.prompt, new RegExp(visualPhrase, "i"), `${task.version}:${visualPhrase}`);
    }
  }
});

test("unknown task versions fall back to the default task", () => {
  assert.equal(getStudyTask("missing-task").version, STUDY_TASKS[0].version);
});

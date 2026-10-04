import assert from "node:assert/strict";
import test from "node:test";
import {
  IDEA_SPARK_NAV_STEPS,
  continueToStepLabel,
  ideaSparkStepShortLabel,
  nextIdeaSparkStep,
} from "./idea-spark-flow.ts";

test("Idea Spark nav step order matches the workflow navigator", () => {
  assert.deepEqual(IDEA_SPARK_NAV_STEPS, [
    "prompt",
    "retrieval",
    "layout",
    "style",
    "icons",
    "candidate",
    "review",
  ]);
  assert.equal(ideaSparkStepShortLabel("icons"), "Match");
  assert.equal(ideaSparkStepShortLabel("review"), "History");
  assert.equal(ideaSparkStepShortLabel("skeleton"), "Skeleton");
});

test("continue labels follow the next navigator step", () => {
  assert.equal(continueToStepLabel("layout"), "Continue to Layout →");
  assert.equal(continueToStepLabel("skeleton"), "Continue to Skeleton →");
  assert.equal(continueToStepLabel("icons"), "Continue to Match →");
  assert.equal(continueToStepLabel("review"), "Continue to History →");
  assert.equal(nextIdeaSparkStep("retrieval"), "layout");
  assert.equal(nextIdeaSparkStep("layout"), "style");
  assert.equal(nextIdeaSparkStep("style"), "icons");
  assert.equal(nextIdeaSparkStep("icons"), "candidate");
  assert.equal(nextIdeaSparkStep("candidate"), "review");
});

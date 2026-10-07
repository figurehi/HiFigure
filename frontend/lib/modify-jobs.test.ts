import assert from "node:assert/strict";
import test from "node:test";

import {
  isPendingModifyJobExpired,
  pendingModifyJobs,
  pendingModifyJobBelongsToWorkspace,
  PENDING_MODIFY_JOB_EXPIRY_MS,
  removePendingModifyJob,
  upsertPendingModifyJob,
  type PendingModifyJob,
} from "./modify-jobs";

const pendingJob: PendingModifyJob = {
  jobId: "job-a",
  sourceVariantId: "candidate-a",
  sourceTitle: "Candidate A",
  revisionSourceVariantId: "candidate-a",
  createdAt: 1_000,
  userId: "Participant-A",
  studySessionId: "session-a",
};

test("pending Edit jobs expire only after the recovery window", () => {
  assert.equal(
    isPendingModifyJobExpired(pendingJob, pendingJob.createdAt + PENDING_MODIFY_JOB_EXPIRY_MS),
    false,
  );
  assert.equal(
    isPendingModifyJobExpired(pendingJob, pendingJob.createdAt + PENDING_MODIFY_JOB_EXPIRY_MS + 1),
    true,
  );
});

test("pending Edit jobs are isolated by participant and study session", () => {
  assert.equal(
    pendingModifyJobBelongsToWorkspace(pendingJob, {
      userId: "participant-a",
      studySessionId: "session-a",
    }),
    true,
  );
  assert.equal(
    pendingModifyJobBelongsToWorkspace(pendingJob, {
      userId: "participant-b",
      studySessionId: "session-a",
    }),
    false,
  );
  assert.equal(
    pendingModifyJobBelongsToWorkspace(pendingJob, {
      userId: "participant-a",
      studySessionId: "session-b",
    }),
    false,
  );
  assert.equal(
    pendingModifyJobBelongsToWorkspace(
      { ...pendingJob, userId: null, studySessionId: null },
      { userId: null, studySessionId: null },
    ),
    true,
  );
});

test("pending Edit jobs fall back to session storage when local storage is full", () => {
  const storageKey = "hichart-editor-pending-modify-jobs-v1";
  const sessionValues = new Map<string, string>();
  const localStorage = {
    getItem: () => null,
    setItem: () => {
      const error = new Error("Storage quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    },
    removeItem: () => undefined,
  } as unknown as Storage;
  const sessionStorage = {
    getItem: (key: string) => sessionValues.get(key) ?? null,
    setItem: (key: string, value: string) => sessionValues.set(key, value),
    removeItem: (key: string) => sessionValues.delete(key),
  } as unknown as Storage;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage, sessionStorage },
  });

  const fallbackJob = { ...pendingJob, jobId: "job-quota-fallback", createdAt: Date.now() };
  try {
    assert.doesNotThrow(() => upsertPendingModifyJob(fallbackJob));
    assert.equal(pendingModifyJobs().some((job) => job.jobId === fallbackJob.jobId), true);
    assert.match(sessionValues.get(storageKey) ?? "", /job-quota-fallback/);

    assert.doesNotThrow(() => removePendingModifyJob(fallbackJob.jobId));
    assert.equal(sessionValues.get(storageKey), "[]");
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

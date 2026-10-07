import studyTaskCatalog from "../../shared/study_tasks.json";

export type StudyTaskCategory = "NLP" | "CV" | "RL / ML";

export type StudyTaskModule = {
  id: string;
  title: string;
  purpose: string;
  components: string[];
  steps: string[];
};

export type StudyTask = {
  version: string;
  category: StudyTaskCategory;
  topic: string;
  cardSummary: string;
  title: string;
  audience: string;
  methodOverview: string;
  modules: StudyTaskModule[];
  flow: string[];
  prompt: string;
  requirements: string[];
};

type StudyTaskCatalog = {
  schemaVersion: number;
  tasks: StudyTask[];
};

const catalog = studyTaskCatalog as StudyTaskCatalog;

export const STUDY_TASK_CATALOG_VERSION = catalog.schemaVersion;
export const STUDY_TASKS: readonly StudyTask[] = catalog.tasks;

/** RL / ML remains readable for existing workspaces, but is not offered to new participants. */
export function getParticipantStudyTasks(
  tasks: readonly StudyTask[] = STUDY_TASKS,
): readonly StudyTask[] {
  return tasks.filter((task) => task.category !== "RL / ML");
}

export const PARTICIPANT_STUDY_TASKS = getParticipantStudyTasks();

export type ParticipantTaskAssignment = {
  task: StudyTask;
  sequenceSlot: number;
  hifigurePeriod: 1 | 2;
  taskPosition: "A" | "B";
};

function participantOrdinal(userId: string): number {
  const cleanId = userId.trim();
  const numericSuffix = cleanId.match(/(\d+)(?!.*\d)/)?.[1];
  if (numericSuffix) {
    const parsed = Number.parseInt(numericSuffix, 10);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  let hash = 0x811c9dc5;
  for (let index = 0; index < cleanId.length; index += 1) {
    hash ^= cleanId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) + 1;
}

/**
 * Assign the HiFigure task without exposing task choice to participants.
 * Eight consecutive participant IDs balance domain, A/B task, and whether
 * HiFigure is completed in period 1 or period 2 of the within-subject study.
 */
export function getParticipantTaskAssignment(
  userId: string,
  tasks: readonly StudyTask[] = PARTICIPANT_STUDY_TASKS,
): ParticipantTaskAssignment {
  const eligibleTasks = getParticipantStudyTasks(tasks);
  const sequenceSlot = ((participantOrdinal(userId) - 1) % 8) + 1;
  const category: StudyTaskCategory = sequenceSlot % 2 === 1 ? "NLP" : "CV";
  const categoryTasks = eligibleTasks.filter((task) => task.category === category);
  const taskIndex = sequenceSlot <= 2 || sequenceSlot >= 7 ? 0 : 1;
  const task = categoryTasks[taskIndex] ??
    eligibleTasks[(sequenceSlot - 1) % Math.max(eligibleTasks.length, 1)] ??
    STUDY_TASK;
  const hifigurePeriod: 1 | 2 = sequenceSlot <= 2 || (sequenceSlot >= 5 && sequenceSlot <= 6)
    ? 1
    : 2;
  return {
    task,
    sequenceSlot,
    hifigurePeriod,
    taskPosition: taskIndex === 0 ? "A" : "B",
  };
}

/** Default for seed workspaces and compatibility with callers that do not choose a task. */
export const STUDY_TASK = STUDY_TASKS[0];
export const STUDY_TASK_VERSION = STUDY_TASK.version;

export function getStudyTask(version: string | null | undefined): StudyTask {
  return STUDY_TASKS.find((task) => task.version === version) ?? STUDY_TASK;
}

export const taskStatuses = ['idle', 'running', 'completed', 'failed'] as const;
export const taskSchedulings = [
  'sync',
  'nextTick',
  'setTimeout',
  'setImmediate',
] as const;

export type TaskStatus = (typeof taskStatuses)[number];
export type TaskScheduling = (typeof taskSchedulings)[number];
export type TaskCallback = (error?: unknown) => void;
export type TaskFn = (next: TaskCallback) => void;

export type Task = {
  readonly status: TaskStatus;
  run(callback?: TaskCallback): void;
};

export type TaskCollection<TaskType extends Task = Task> = Task & {
  readonly size: number;
  add(fn: TaskFn | TaskType, scheduling?: TaskScheduling): void;
};

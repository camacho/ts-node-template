import type {
  TaskFn,
  TaskScheduling,
  TaskStatus,
  TaskCallback,
} from '../../types.ts';

export type Task = {
  readonly status: TaskStatus;
  run(callback?: TaskCallback): void;
};

export type TaskCollection<TaskType extends Task = Task> = Task & {
  readonly size: number;
  add(fn: TaskFn | TaskType, scheduling?: TaskScheduling): void;
};

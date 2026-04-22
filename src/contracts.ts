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

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TaskInterface {
  readonly id: string;
  readonly name: string;
  readonly status: TaskStatus;
  readonly error?: unknown;
  run(callback?: TaskCallback): void;
}

export type TaskConstructor<TaskType extends TaskInterface = TaskInterface> =
  new (fn: TaskFn, name: string, scheduling?: TaskScheduling) => TaskType;

export type TaskCollectionInterface<
  TaskType extends TaskInterface = TaskInterface,
> = TaskInterface & {
  readonly size: number;
  add(task: TaskType, name?: undefined, scheduling?: undefined): void;
  add(fn: TaskFn, name?: string, scheduling?: TaskScheduling): void;
};

export type TaskCollectionConstructor<
  TaskType extends TaskInterface = TaskInterface,
  CollectionType extends
    TaskCollectionInterface<TaskType> = TaskCollectionInterface<TaskType>,
> = new (name: string, tasks?: Iterable<TaskType>) => CollectionType;

export type TaskRunnerImplementation<
  TaskType extends TaskInterface = TaskInterface,
  CollectionType extends
    TaskCollectionInterface<TaskType> = TaskCollectionInterface<TaskType>,
> = {
  name: string;
  Task: TaskConstructor<TaskType>;
  SequentialTasks: TaskCollectionConstructor<TaskType, CollectionType>;
  ParallelTasks: TaskCollectionConstructor<TaskType, CollectionType>;
};

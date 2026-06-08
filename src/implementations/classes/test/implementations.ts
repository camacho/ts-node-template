import * as classCallback from '../index.ts';
import type {
  Task,
  TaskCollection,
  TaskFn,
  TaskScheduling,
} from '../../../types.ts';

type TaskCollectionConstructor<
  TaskType extends Task = Task,
  CollectionType extends TaskCollection<TaskType> = TaskCollection<TaskType>,
> = new (tasks?: Iterable<TaskType>) => CollectionType;

type TaskRunnerImplementation<
  TaskType extends Task = Task,
  CollectionType extends TaskCollection<TaskType> = TaskCollection<TaskType>,
> = {
  Task: new (fn: TaskFn, scheduling?: TaskScheduling) => TaskType;
  SequentialTasks: TaskCollectionConstructor<TaskType, CollectionType>;
  ParallelTasks: TaskCollectionConstructor<TaskType, CollectionType>;
};

const classCallbackDrainImplementation = {
  ...classCallback,
} satisfies TaskRunnerImplementation<
  classCallback.Task,
  classCallback.SequentialTasks | classCallback.ParallelTasks
>;

export const implementations = [classCallbackDrainImplementation];

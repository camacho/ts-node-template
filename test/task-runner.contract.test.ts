import { describe, expect, it } from 'vitest';

import { Task, type TaskInterface } from '../src/Task.ts';
import { ParallelTasks, SequentialTasks } from '../src/TaskCollection.ts';

type Scheduling = ConstructorParameters<typeof Task>[2];
type TaskConstructor<TTask extends TaskInterface = TaskInterface> = new (
  ...args: ConstructorParameters<typeof Task>
) => TTask;
type TaskCollectionContract = TaskInterface &
  Pick<SequentialTasks, 'add' | 'size'>;
type CollectionConstructor<TCollection extends TaskCollectionContract> = new (
  ...args: ConstructorParameters<typeof SequentialTasks>
) => TCollection;
type TaskCollectionImplementation<
  TTask extends TaskInterface = TaskInterface,
  TCollection extends TaskCollectionContract = TaskCollectionContract,
> = {
  name: string;
  Task: TaskConstructor<TTask>;
  SequentialTasks: CollectionConstructor<TCollection>;
  ParallelTasks: CollectionConstructor<TCollection>;
};

type TraceEvent = 'start' | 'end';
type Trace = Array<`${TraceEvent}:${string}`>;
type QueueItem<TTask extends TaskInterface> = TTask | TaskCollectionContract;
type ScenarioItem<TTask extends TaskInterface> = {
  readonly label: string;
  readonly value: QueueItem<TTask>;
  setPath(path: string): void;
};

const implementations = [
  {
    name: 'current implementation',
    Task,
    SequentialTasks,
    ParallelTasks,
  },
] satisfies Array<TaskCollectionImplementation<Task>>;

const run = async (task: TaskInterface) =>
  new Promise<unknown>((resolve) => {
    task.run(resolve);
  });

const createScenario = <
  TTask extends TaskInterface,
  TCollection extends TaskCollectionContract,
>({
  Task: TaskImplementation,
  SequentialTasks: SequentialImplementation,
  ParallelTasks: ParallelImplementation,
}: TaskCollectionImplementation<TTask, TCollection>) => {
  const trace: Trace = [];
  const record = (event: TraceEvent, label: string) => {
    trace.push(`${event}:${label}`);
  };

  const fill = (collection: TCollection, items: Array<ScenarioItem<TTask>>) => {
    const add = collection.add.bind(collection) as unknown as (
      item: QueueItem<TTask>,
    ) => void;

    for (const item of items) {
      add(item.value);
    }

    return collection;
  };

  const createTask = (
    label: string,
    create: (readLabel: () => string) => TTask,
  ): ScenarioItem<TTask> => {
    let path = label;

    return {
      label,
      value: create(() => path),
      setPath: (nextPath) => {
        path = nextPath;
      },
    };
  };

  const createCollection = (
    name: string,
    collection: TCollection,
    items: Array<ScenarioItem<TTask>>,
  ): ScenarioItem<TTask> => {
    fill(collection, items);

    const setPath = (path: string) => {
      for (const [index, item] of items.entries()) {
        item.setPath(`${path}[${index + 1}] > ${item.label}`);
      }
    };

    setPath(name);

    return {
      label: name,
      value: collection,
      setPath,
    };
  };

  const task = {
    sync: (label: string, scheduling?: Scheduling) =>
      createTask(
        label,
        (readLabel) =>
          new TaskImplementation(
            () => {
              record('start', readLabel());
              record('end', readLabel());
            },
            label,
            scheduling,
          ),
      ),
    callback: (label: string, scheduling?: Scheduling) =>
      createTask(
        label,
        (readLabel) =>
          new TaskImplementation(
            (next) => {
              record('start', readLabel());
              record('end', readLabel());
              next();
            },
            label,
            scheduling,
          ),
      ),
    async: (label: string, delay = 0, scheduling?: Scheduling) =>
      createTask(
        label,
        (readLabel) =>
          new TaskImplementation(
            (next) => {
              record('start', readLabel());
              setTimeout(() => {
                record('end', readLabel());
                next();
              }, delay);
            },
            label,
            scheduling,
          ),
      ),
    fails: (label: string, error: Error, delay = 0) =>
      createTask(
        label,
        (readLabel) =>
          new TaskImplementation((next) => {
            record('start', readLabel());
            setTimeout(() => {
              record('end', readLabel());
              next(error);
            }, delay);
          }, label),
      ),
  };

  return {
    task,
    parallel: (name: string, ...items: Array<ScenarioItem<TTask>>) =>
      createCollection(name, new ParallelImplementation(name), items),
    sequential: (name: string, ...items: Array<ScenarioItem<TTask>>) =>
      createCollection(name, new SequentialImplementation(name), items),
    expectSuccess: async (queue: ScenarioItem<TTask>) => {
      await expect(run(queue.value)).resolves.toBeUndefined();
    },
    expectFailure: async (queue: ScenarioItem<TTask>) => {
      await expect(run(queue.value)).resolves.toBeTruthy();
    },
    expectError: async (queue: ScenarioItem<TTask>, error: Error) => {
      await expect(run(queue.value)).resolves.toBe(error);
    },
    expectTrace: (expected: Trace) => {
      expect(trace).toStrictEqual(expected);
    },
  };
};

export const defineTaskCollectionBehaviorSpecs = <TTask extends TaskInterface>(
  implementation: TaskCollectionImplementation<TTask>,
) => {
  describe(implementation.name, () => {
    it('runs mixed sequential tasks from start to end before starting the next task', async () => {
      const $ = createScenario(implementation);
      const queue = $.sequential(
        'mixed sequential tasks',
        $.task.sync('sync no callback'),
        $.task.callback('sync callback'),
        $.task.async('async callback', 5),
      );

      await $.expectSuccess(queue);
      $.expectTrace([
        'start:mixed sequential tasks[1] > sync no callback',
        'end:mixed sequential tasks[1] > sync no callback',
        'start:mixed sequential tasks[2] > sync callback',
        'end:mixed sequential tasks[2] > sync callback',
        'start:mixed sequential tasks[3] > async callback',
        'end:mixed sequential tasks[3] > async callback',
      ]);
    });

    it('starts callback-based parallel tasks before waiting for any task to finish', async () => {
      const $ = createScenario(implementation);
      const queue = $.parallel(
        'parallel callback tasks',
        $.task.async('slow', 15),
        $.task.async('fast', 1),
        $.task.async('middle', 5),
      );

      await $.expectSuccess(queue);
      $.expectTrace([
        'start:parallel callback tasks[1] > slow',
        'start:parallel callback tasks[2] > fast',
        'start:parallel callback tasks[3] > middle',
        'end:parallel callback tasks[2] > fast',
        'end:parallel callback tasks[3] > middle',
        'end:parallel callback tasks[1] > slow',
      ]);
    });

    it('runs a sequential collection containing a nested parallel collection in order', async () => {
      const $ = createScenario(implementation);
      const queue = $.sequential(
        'outer sequential',
        $.task.callback('before nested'),
        $.parallel(
          'nested parallel',
          $.task.async('nested slow', 10),
          $.task.async('nested fast', 1),
        ),
        $.task.sync('after nested'),
      );

      await $.expectSuccess(queue);
      $.expectTrace([
        'start:outer sequential[1] > before nested',
        'end:outer sequential[1] > before nested',
        'start:outer sequential[2] > nested parallel[1] > nested slow',
        'start:outer sequential[2] > nested parallel[2] > nested fast',
        'end:outer sequential[2] > nested parallel[2] > nested fast',
        'end:outer sequential[2] > nested parallel[1] > nested slow',
        'start:outer sequential[3] > after nested',
        'end:outer sequential[3] > after nested',
      ]);
    });

    it('runs a sequential collection after a nested parallel collection succeeds', async () => {
      const $ = createScenario(implementation);
      const queue = $.sequential(
        'sequential parent with successful parallel child',
        $.task.callback('before child'),
        $.parallel(
          'parallel child',
          $.task.async('slow success', 10),
          $.task.async('fast success', 1),
        ),
        $.task.callback('after child'),
      );

      await $.expectSuccess(queue);
      $.expectTrace([
        'start:sequential parent with successful parallel child[1] > before child',
        'end:sequential parent with successful parallel child[1] > before child',
        'start:sequential parent with successful parallel child[2] > parallel child[1] > slow success',
        'start:sequential parent with successful parallel child[2] > parallel child[2] > fast success',
        'end:sequential parent with successful parallel child[2] > parallel child[2] > fast success',
        'end:sequential parent with successful parallel child[2] > parallel child[1] > slow success',
        'start:sequential parent with successful parallel child[3] > after child',
        'end:sequential parent with successful parallel child[3] > after child',
      ]);
    });

    it('stops a sequential collection after a nested parallel collection fails', async () => {
      const $ = createScenario(implementation);
      const error = new Error('expected nested parallel failure');
      const queue = $.sequential(
        'sequential parent with failing parallel child',
        $.task.callback('before child'),
        $.parallel(
          'parallel child',
          $.task.fails('fast failure', error, 1),
          $.task.async('slow success', 10),
        ),
        $.task.callback('after child should not run'),
      );

      await $.expectFailure(queue);
      $.expectTrace([
        'start:sequential parent with failing parallel child[1] > before child',
        'end:sequential parent with failing parallel child[1] > before child',
        'start:sequential parent with failing parallel child[2] > parallel child[1] > fast failure',
        'start:sequential parent with failing parallel child[2] > parallel child[2] > slow success',
        'end:sequential parent with failing parallel child[2] > parallel child[1] > fast failure',
        'end:sequential parent with failing parallel child[2] > parallel child[2] > slow success',
      ]);
    });

    it('runs parallel sequential collections independently while preserving each nested serial order', async () => {
      const $ = createScenario(implementation);
      const queue = $.parallel(
        'outer parallel',
        $.sequential(
          'left sequential',
          $.task.async('left first', 10),
          $.task.callback('left second'),
        ),
        $.sequential(
          'right sequential',
          $.task.async('right first', 1),
          $.task.sync('right second'),
        ),
      );

      await $.expectSuccess(queue);
      $.expectTrace([
        'start:outer parallel[1] > left sequential[1] > left first',
        'start:outer parallel[2] > right sequential[1] > right first',
        'end:outer parallel[2] > right sequential[1] > right first',
        'start:outer parallel[2] > right sequential[2] > right second',
        'end:outer parallel[2] > right sequential[2] > right second',
        'end:outer parallel[1] > left sequential[1] > left first',
        'start:outer parallel[1] > left sequential[2] > left second',
        'end:outer parallel[1] > left sequential[2] > left second',
      ]);
    });

    it('lets successful nested sequential collections finish inside a parallel collection', async () => {
      const $ = createScenario(implementation);
      const queue = $.parallel(
        'parallel parent with successful sequential children',
        $.sequential(
          'left sequential child',
          $.task.async('left slow first', 10),
          $.task.callback('left second'),
        ),
        $.sequential(
          'right sequential child',
          $.task.async('right fast first', 1),
          $.task.sync('right second'),
        ),
      );

      await $.expectSuccess(queue);
      $.expectTrace([
        'start:parallel parent with successful sequential children[1] > left sequential child[1] > left slow first',
        'start:parallel parent with successful sequential children[2] > right sequential child[1] > right fast first',
        'end:parallel parent with successful sequential children[2] > right sequential child[1] > right fast first',
        'start:parallel parent with successful sequential children[2] > right sequential child[2] > right second',
        'end:parallel parent with successful sequential children[2] > right sequential child[2] > right second',
        'end:parallel parent with successful sequential children[1] > left sequential child[1] > left slow first',
        'start:parallel parent with successful sequential children[1] > left sequential child[2] > left second',
        'end:parallel parent with successful sequential children[1] > left sequential child[2] > left second',
      ]);
    });

    it('lets parallel siblings finish when one nested sequential collection fails', async () => {
      const $ = createScenario(implementation);
      const error = new Error('expected nested sequential failure');
      const queue = $.parallel(
        'parallel parent with failing sequential child',
        $.sequential(
          'left sequential child',
          $.task.fails('left failure', error, 1),
          $.task.callback('left after failure should not run'),
        ),
        $.sequential(
          'right sequential child',
          $.task.async('right slow first', 10),
          $.task.sync('right second still runs'),
        ),
      );

      await $.expectFailure(queue);
      $.expectTrace([
        'start:parallel parent with failing sequential child[1] > left sequential child[1] > left failure',
        'start:parallel parent with failing sequential child[2] > right sequential child[1] > right slow first',
        'end:parallel parent with failing sequential child[1] > left sequential child[1] > left failure',
        'end:parallel parent with failing sequential child[2] > right sequential child[1] > right slow first',
        'start:parallel parent with failing sequential child[2] > right sequential child[2] > right second still runs',
        'end:parallel parent with failing sequential child[2] > right sequential child[2] > right second still runs',
      ]);
    });

    it('stops a sequential collection after the first failing task', async () => {
      const $ = createScenario(implementation);
      const error = new Error('expected sequential failure');
      const queue = $.sequential(
        'failing sequential',
        $.task.callback('before failure'),
        $.task.fails('failure', error, 1),
        $.task.callback('after failure'),
      );

      await $.expectError(queue, error);
      $.expectTrace([
        'start:failing sequential[1] > before failure',
        'end:failing sequential[1] > before failure',
        'start:failing sequential[2] > failure',
        'end:failing sequential[2] > failure',
      ]);
    });

    it('lets all parallel tasks settle even when one task fails', async () => {
      const $ = createScenario(implementation);
      const error = new Error('expected parallel failure');
      const queue = $.parallel(
        'failing parallel',
        $.task.fails('failure', error, 1),
        $.task.async('slow success', 10),
      );

      await $.expectFailure(queue);
      $.expectTrace([
        'start:failing parallel[1] > failure',
        'start:failing parallel[2] > slow success',
        'end:failing parallel[1] > failure',
        'end:failing parallel[2] > slow success',
      ]);
    });

    it('supports scheduler variants without changing sequential task order', async () => {
      const $ = createScenario(implementation);
      const queue = $.sequential(
        'scheduled sequential tasks',
        $.task.callback('next tick', 'nextTick'),
        $.task.callback('immediate', 'setImmediate'),
        $.task.callback('timeout', 'setTimeout'),
      );

      await $.expectSuccess(queue);
      $.expectTrace([
        'start:scheduled sequential tasks[1] > next tick',
        'end:scheduled sequential tasks[1] > next tick',
        'start:scheduled sequential tasks[2] > immediate',
        'end:scheduled sequential tasks[2] > immediate',
        'start:scheduled sequential tasks[3] > timeout',
        'end:scheduled sequential tasks[3] > timeout',
      ]);
    });
  });
};

for (const implementation of implementations) {
  defineTaskCollectionBehaviorSpecs(implementation);
}

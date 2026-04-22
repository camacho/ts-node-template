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
      const result = await run(queue.value);

      expect(result).toBeTruthy();

      return result;
    },
    expectError: async (queue: ScenarioItem<TTask>, error: Error) => {
      await expect(run(queue.value)).resolves.toBe(error);
    },
    expectParallelFailure: async (queue: ScenarioItem<TTask>, size: number) => {
      const result = await run(queue.value);

      expect(result).toBeInstanceOf(Map);
      expect(result).toHaveProperty('size', size);

      return result as Map<string, unknown>;
    },
    run: async (queue: ScenarioItem<TTask>) => run(queue.value),
    expectTrace: (expected: Trace) => {
      expect(trace).toStrictEqual(expected);
    },
  };
};

export const defineTaskRunnerContractSpecs = <TTask extends TaskInterface>(
  implementation: TaskCollectionImplementation<TTask>,
) => {
  describe(implementation.name, () => {
    it('completes empty collections', async () => {
      const $ = createScenario(implementation);

      await $.expectSuccess($.sequential('empty sequential'));
      await $.expectSuccess($.parallel('empty parallel'));
    });

    it('runs single task children in sequential and parallel collections', async () => {
      const $ = createScenario(implementation);

      await $.expectSuccess(
        $.sequential('single sequential task', $.task.callback('only child')),
      );
      await $.expectSuccess(
        $.parallel('single parallel task', $.task.callback('only child')),
      );
      $.expectTrace([
        'start:single sequential task[1] > only child',
        'end:single sequential task[1] > only child',
        'start:single parallel task[1] > only child',
        'end:single parallel task[1] > only child',
      ]);
    });

    it('accepts raw task functions through collection add', async () => {
      const trace: string[] = [];
      const queue = new implementation.SequentialTasks('raw function queue');

      queue.add((next) => {
        trace.push('start:raw function queue[1] > raw function child');
        trace.push('end:raw function queue[1] > raw function child');
        next();
      });

      await expect(run(queue)).resolves.toBeUndefined();
      expect(trace).toStrictEqual([
        'start:raw function queue[1] > raw function child',
        'end:raw function queue[1] > raw function child',
      ]);
    });

    it('accepts initial iterable children in collection constructors', async () => {
      const trace: string[] = [];
      const first = new implementation.Task((next) => {
        trace.push('start:iterable queue[1] > first');
        trace.push('end:iterable queue[1] > first');
        next();
      }, 'first');
      const second = new implementation.Task((next) => {
        trace.push('start:iterable queue[2] > second');
        trace.push('end:iterable queue[2] > second');
        next();
      }, 'second');
      const queue = new implementation.SequentialTasks('iterable queue', [
        first,
        second,
      ] as Iterable<Task>);

      await expect(run(queue)).resolves.toBeUndefined();
      expect(trace).toStrictEqual([
        'start:iterable queue[1] > first',
        'end:iterable queue[1] > first',
        'start:iterable queue[2] > second',
        'end:iterable queue[2] > second',
      ]);
    });

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

      await $.expectParallelFailure(queue, 1);
      $.expectTrace([
        'start:sequential parent with failing parallel child[1] > before child',
        'end:sequential parent with failing parallel child[1] > before child',
        'start:sequential parent with failing parallel child[2] > parallel child[1] > fast failure',
        'start:sequential parent with failing parallel child[2] > parallel child[2] > slow success',
        'end:sequential parent with failing parallel child[2] > parallel child[1] > fast failure',
        'end:sequential parent with failing parallel child[2] > parallel child[2] > slow success',
      ]);
    });

    it('runs a sequential collection containing a nested sequential collection', async () => {
      const $ = createScenario(implementation);
      const queue = $.sequential(
        'sequential parent with sequential child',
        $.task.callback('before child'),
        $.sequential(
          'sequential child',
          $.task.async('child first', 5),
          $.task.callback('child second'),
        ),
        $.task.sync('after child'),
      );

      await $.expectSuccess(queue);
      $.expectTrace([
        'start:sequential parent with sequential child[1] > before child',
        'end:sequential parent with sequential child[1] > before child',
        'start:sequential parent with sequential child[2] > sequential child[1] > child first',
        'end:sequential parent with sequential child[2] > sequential child[1] > child first',
        'start:sequential parent with sequential child[2] > sequential child[2] > child second',
        'end:sequential parent with sequential child[2] > sequential child[2] > child second',
        'start:sequential parent with sequential child[3] > after child',
        'end:sequential parent with sequential child[3] > after child',
      ]);
    });

    it('stops a sequential collection after a nested sequential collection fails', async () => {
      const $ = createScenario(implementation);
      const error = new Error('expected nested sequential failure');
      const queue = $.sequential(
        'sequential parent with failing sequential child',
        $.task.callback('before child'),
        $.sequential(
          'sequential child',
          $.task.fails('child failure', error, 1),
          $.task.callback('child after failure should not run'),
        ),
        $.task.callback('after child should not run'),
      );

      await $.expectError(queue, error);
      $.expectTrace([
        'start:sequential parent with failing sequential child[1] > before child',
        'end:sequential parent with failing sequential child[1] > before child',
        'start:sequential parent with failing sequential child[2] > sequential child[1] > child failure',
        'end:sequential parent with failing sequential child[2] > sequential child[1] > child failure',
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

      await $.expectParallelFailure(queue, 1);
      $.expectTrace([
        'start:parallel parent with failing sequential child[1] > left sequential child[1] > left failure',
        'start:parallel parent with failing sequential child[2] > right sequential child[1] > right slow first',
        'end:parallel parent with failing sequential child[1] > left sequential child[1] > left failure',
        'end:parallel parent with failing sequential child[2] > right sequential child[1] > right slow first',
        'start:parallel parent with failing sequential child[2] > right sequential child[2] > right second still runs',
        'end:parallel parent with failing sequential child[2] > right sequential child[2] > right second still runs',
      ]);
    });

    it('runs parallel collections nested inside a parallel collection', async () => {
      const $ = createScenario(implementation);
      const queue = $.parallel(
        'parallel parent with parallel children',
        $.parallel(
          'left parallel child',
          $.task.async('left slow', 10),
          $.task.async('left fast', 1),
        ),
        $.parallel(
          'right parallel child',
          $.task.async('right slow', 8),
          $.task.async('right fast', 2),
        ),
      );

      await $.expectSuccess(queue);
      $.expectTrace([
        'start:parallel parent with parallel children[1] > left parallel child[1] > left slow',
        'start:parallel parent with parallel children[1] > left parallel child[2] > left fast',
        'start:parallel parent with parallel children[2] > right parallel child[1] > right slow',
        'start:parallel parent with parallel children[2] > right parallel child[2] > right fast',
        'end:parallel parent with parallel children[1] > left parallel child[2] > left fast',
        'end:parallel parent with parallel children[2] > right parallel child[2] > right fast',
        'end:parallel parent with parallel children[2] > right parallel child[1] > right slow',
        'end:parallel parent with parallel children[1] > left parallel child[1] > left slow',
      ]);
    });

    it('lets parallel siblings finish when one nested parallel collection fails', async () => {
      const $ = createScenario(implementation);
      const error = new Error('expected nested parallel failure');
      const queue = $.parallel(
        'parallel parent with failing parallel child',
        $.parallel(
          'left parallel child',
          $.task.fails('left failure', error, 1),
          $.task.async('left slow success', 10),
        ),
        $.parallel('right parallel child', $.task.async('right success', 5)),
      );

      await $.expectParallelFailure(queue, 1);
      $.expectTrace([
        'start:parallel parent with failing parallel child[1] > left parallel child[1] > left failure',
        'start:parallel parent with failing parallel child[1] > left parallel child[2] > left slow success',
        'start:parallel parent with failing parallel child[2] > right parallel child[1] > right success',
        'end:parallel parent with failing parallel child[1] > left parallel child[1] > left failure',
        'end:parallel parent with failing parallel child[2] > right parallel child[1] > right success',
        'end:parallel parent with failing parallel child[1] > left parallel child[2] > left slow success',
      ]);
    });

    it('reports multiple failures from one parallel collection', async () => {
      const $ = createScenario(implementation);
      const firstError = new Error('expected first parallel failure');
      const secondError = new Error('expected second parallel failure');
      const queue = $.parallel(
        'parallel with multiple failures',
        $.task.fails('first failure', firstError, 1),
        $.task.async('success', 5),
        $.task.fails('second failure', secondError, 2),
      );

      const result = await $.expectParallelFailure(queue, 2);

      expect([...result.values()]).toStrictEqual([firstError, secondError]);
      $.expectTrace([
        'start:parallel with multiple failures[1] > first failure',
        'start:parallel with multiple failures[2] > success',
        'start:parallel with multiple failures[3] > second failure',
        'end:parallel with multiple failures[1] > first failure',
        'end:parallel with multiple failures[3] > second failure',
        'end:parallel with multiple failures[2] > success',
      ]);
    });

    it('runs a depth-three mixed nesting chain successfully', async () => {
      const $ = createScenario(implementation);
      const queue = $.sequential(
        'depth three success',
        $.parallel(
          'parallel child',
          $.sequential(
            'sequential grandchild',
            $.task.callback('grandchild first'),
            $.task.async('grandchild second', 5),
          ),
          $.task.async('parallel sibling', 1),
        ),
        $.task.sync('after nested chain'),
      );

      await $.expectSuccess(queue);
      $.expectTrace([
        'start:depth three success[1] > parallel child[1] > sequential grandchild[1] > grandchild first',
        'end:depth three success[1] > parallel child[1] > sequential grandchild[1] > grandchild first',
        'start:depth three success[1] > parallel child[1] > sequential grandchild[2] > grandchild second',
        'start:depth three success[1] > parallel child[2] > parallel sibling',
        'end:depth three success[1] > parallel child[2] > parallel sibling',
        'end:depth three success[1] > parallel child[1] > sequential grandchild[2] > grandchild second',
        'start:depth three success[2] > after nested chain',
        'end:depth three success[2] > after nested chain',
      ]);
    });

    it('propagates failure through a depth-three mixed nesting chain', async () => {
      const $ = createScenario(implementation);
      const error = new Error('expected depth-three failure');
      const queue = $.parallel(
        'depth three failure',
        $.sequential(
          'sequential child',
          $.parallel(
            'parallel grandchild',
            $.task.fails('grandchild failure', error, 1),
            $.task.async('grandchild slow success', 8),
          ),
          $.task.callback('sequential after failure should not run'),
        ),
        $.task.async('parallel slow sibling', 10),
      );

      await $.expectParallelFailure(queue, 1);
      $.expectTrace([
        'start:depth three failure[1] > sequential child[1] > parallel grandchild[1] > grandchild failure',
        'start:depth three failure[1] > sequential child[1] > parallel grandchild[2] > grandchild slow success',
        'start:depth three failure[2] > parallel slow sibling',
        'end:depth three failure[1] > sequential child[1] > parallel grandchild[1] > grandchild failure',
        'end:depth three failure[1] > sequential child[1] > parallel grandchild[2] > grandchild slow success',
        'end:depth three failure[2] > parallel slow sibling',
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

      await $.expectParallelFailure(queue, 1);
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

    it('runs tasks added during a sequential collection run', async () => {
      const trace: string[] = [];
      const queue = new implementation.SequentialTasks('mutating sequential');
      const add = queue.add.bind(queue) as unknown as (task: TTask) => void;
      const appended = new implementation.Task((next) => {
        trace.push('start:mutating sequential[2] > appended during run');
        trace.push('end:mutating sequential[2] > appended during run');
        next();
      }, 'appended during run');

      queue.add((next) => {
        trace.push('start:mutating sequential[1] > appender');
        add(appended);
        trace.push('end:mutating sequential[1] > appender');
        next();
      });

      await expect(run(queue)).resolves.toBeUndefined();
      expect(trace).toStrictEqual([
        'start:mutating sequential[1] > appender',
        'end:mutating sequential[1] > appender',
        'start:mutating sequential[2] > appended during run',
        'end:mutating sequential[2] > appended during run',
      ]);
    });

    it('runs tasks added during the active parallel drain', async () => {
      const trace: string[] = [];
      const queue = new implementation.ParallelTasks('mutating parallel');
      const add = queue.add.bind(queue) as unknown as (task: TTask) => void;
      const appended = new implementation.Task((next) => {
        trace.push('start:mutating parallel[3] > appended during run');
        trace.push('end:mutating parallel[3] > appended during run');
        next();
      }, 'appended during run');

      queue.add((next) => {
        trace.push('start:mutating parallel[1] > appender');
        add(appended);
        setTimeout(() => {
          trace.push('end:mutating parallel[1] > appender');
          next();
        }, 1);
      });
      queue.add((next) => {
        trace.push('start:mutating parallel[2] > sibling');
        setTimeout(() => {
          trace.push('end:mutating parallel[2] > sibling');
          next();
        }, 5);
      });

      await expect(run(queue)).resolves.toBeUndefined();
      expect(trace).toStrictEqual([
        'start:mutating parallel[1] > appender',
        'start:mutating parallel[2] > sibling',
        'start:mutating parallel[3] > appended during run',
        'end:mutating parallel[3] > appended during run',
        'end:mutating parallel[1] > appender',
        'end:mutating parallel[2] > sibling',
      ]);
      expect(appended.status).toBe('completed');
    });
  });
};

for (const implementation of implementations) {
  defineTaskRunnerContractSpecs(implementation);
}

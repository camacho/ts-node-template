import { describe, expect, it } from 'vitest';

import { Task, type TaskCallback, type TaskFn } from '../src/Task.ts';
import { ParallelTasks, SequentialTasks } from '../src/TaskCollection.ts';

type Scheduling = (typeof Task.SCHEDULING)[number];
type Runnable = {
  readonly name: string;
  run(callback?: TaskCallback): void;
};
type TaskConstructor<TTask extends Runnable> = new (
  fn: TaskFn,
  name: string,
  scheduling?: Scheduling,
) => TTask;
type Collection<TTask extends Runnable> = Runnable & {
  readonly size: number;
  add(task: TTask, name?: undefined, scheduling?: undefined): void;
  add(fn: TaskFn, name?: string, scheduling?: Scheduling): void;
};
type CollectionConstructor<TTask extends Runnable> = new (
  name: string,
  tasks?: Iterable<TTask>,
) => Collection<TTask>;
type TaskCollectionImplementation<TTask extends Runnable = Runnable> = {
  name: string;
  Task: TaskConstructor<TTask>;
  SequentialTasks: CollectionConstructor<TTask>;
  ParallelTasks: CollectionConstructor<TTask>;
};

type TraceEvent = 'start' | 'end';
type Trace = Array<`${TraceEvent}:${string}`>;
type TaskMode =
  | { type: 'sync-no-callback' }
  | { type: 'sync-callback' }
  | { type: 'async-callback'; delay?: number; error?: Error };

const implementations = [
  {
    name: 'current implementation',
    Task,
    SequentialTasks,
    ParallelTasks,
  },
] satisfies Array<TaskCollectionImplementation<Task>>;

const run = async (task: Runnable) =>
  new Promise<unknown>((resolve) => {
    task.run(resolve);
  });

const record = (trace: Trace, event: TraceEvent, label: string) => {
  trace.push(`${event}:${label}`);
};

const recordingTask = <TTask extends Runnable>(
  {
    Task: TaskImplementation,
  }: Pick<TaskCollectionImplementation<TTask>, 'Task'>,
  trace: Trace,
  label: string,
  mode: TaskMode,
  scheduling?: Scheduling,
) => {
  switch (mode.type) {
    case 'sync-no-callback':
      return new TaskImplementation(
        () => {
          record(trace, 'start', label);
          record(trace, 'end', label);
        },
        label,
        scheduling,
      );
    case 'sync-callback':
      return new TaskImplementation(
        (next) => {
          record(trace, 'start', label);
          record(trace, 'end', label);
          next();
        },
        label,
        scheduling,
      );
    case 'async-callback':
      return new TaskImplementation(
        (next) => {
          record(trace, 'start', label);
          setTimeout(() => {
            record(trace, 'end', label);
            next(mode.error);
          }, mode.delay ?? 0);
        },
        label,
        scheduling,
      );
  }
};

export const defineTaskCollectionBehaviorSpecs = <TTask extends Runnable>({
  name,
  SequentialTasks: SequentialImplementation,
  ParallelTasks: ParallelImplementation,
  ...implementation
}: TaskCollectionImplementation<TTask>) => {
  describe(name, () => {
    it('runs mixed sequential tasks from start to end before starting the next task', async () => {
      const trace: Trace = [];
      const queue = new SequentialImplementation('mixed sequential tasks');

      queue.add(
        recordingTask(implementation, trace, 'sync no callback', {
          type: 'sync-no-callback',
        }),
      );
      queue.add(
        recordingTask(implementation, trace, 'sync callback', {
          type: 'sync-callback',
        }),
      );
      queue.add(
        recordingTask(implementation, trace, 'async callback', {
          type: 'async-callback',
          delay: 5,
        }),
      );

      await expect(run(queue)).resolves.toBeUndefined();
      expect(trace).toStrictEqual([
        'start:sync no callback',
        'end:sync no callback',
        'start:sync callback',
        'end:sync callback',
        'start:async callback',
        'end:async callback',
      ]);
    });

    it('starts callback-based parallel tasks before waiting for any task to finish', async () => {
      const trace: Trace = [];
      const queue = new ParallelImplementation('parallel callback tasks');

      queue.add(
        recordingTask(implementation, trace, 'slow', {
          type: 'async-callback',
          delay: 15,
        }),
      );
      queue.add(
        recordingTask(implementation, trace, 'fast', {
          type: 'async-callback',
          delay: 1,
        }),
      );
      queue.add(
        recordingTask(implementation, trace, 'middle', {
          type: 'async-callback',
          delay: 5,
        }),
      );

      await expect(run(queue)).resolves.toBeUndefined();
      expect(trace).toStrictEqual([
        'start:slow',
        'start:fast',
        'start:middle',
        'end:fast',
        'end:middle',
        'end:slow',
      ]);
    });

    it('runs a sequential collection containing a nested parallel collection in order', async () => {
      const trace: Trace = [];
      const queue = new SequentialImplementation('outer sequential');
      const nested = new ParallelImplementation('nested parallel');

      queue.add(
        recordingTask(implementation, trace, 'before nested', {
          type: 'sync-callback',
        }),
      );
      nested.add(
        recordingTask(implementation, trace, 'nested slow', {
          type: 'async-callback',
          delay: 10,
        }),
      );
      nested.add(
        recordingTask(implementation, trace, 'nested fast', {
          type: 'async-callback',
          delay: 1,
        }),
      );
      queue.add(nested as unknown as TTask);
      queue.add(
        recordingTask(implementation, trace, 'after nested', {
          type: 'sync-no-callback',
        }),
      );

      await expect(run(queue)).resolves.toBeUndefined();
      expect(trace).toStrictEqual([
        'start:before nested',
        'end:before nested',
        'start:nested slow',
        'start:nested fast',
        'end:nested fast',
        'end:nested slow',
        'start:after nested',
        'end:after nested',
      ]);
    });

    it('runs parallel sequential collections independently while preserving each nested serial order', async () => {
      const trace: Trace = [];
      const queue = new ParallelImplementation('outer parallel');
      const left = new SequentialImplementation('left sequential');
      const right = new SequentialImplementation('right sequential');

      left.add(
        recordingTask(implementation, trace, 'left first', {
          type: 'async-callback',
          delay: 10,
        }),
      );
      left.add(
        recordingTask(implementation, trace, 'left second', {
          type: 'sync-callback',
        }),
      );
      right.add(
        recordingTask(implementation, trace, 'right first', {
          type: 'async-callback',
          delay: 1,
        }),
      );
      right.add(
        recordingTask(implementation, trace, 'right second', {
          type: 'sync-no-callback',
        }),
      );
      queue.add(left as unknown as TTask);
      queue.add(right as unknown as TTask);

      await expect(run(queue)).resolves.toBeUndefined();
      expect(trace).toStrictEqual([
        'start:left first',
        'start:right first',
        'end:right first',
        'start:right second',
        'end:right second',
        'end:left first',
        'start:left second',
        'end:left second',
      ]);
    });

    it('stops a sequential collection after the first failing task', async () => {
      const trace: Trace = [];
      const error = new Error('expected sequential failure');
      const queue = new SequentialImplementation('failing sequential');

      queue.add(
        recordingTask(implementation, trace, 'before failure', {
          type: 'sync-callback',
        }),
      );
      queue.add(
        recordingTask(implementation, trace, 'failure', {
          type: 'async-callback',
          delay: 1,
          error,
        }),
      );
      queue.add(
        recordingTask(implementation, trace, 'after failure', {
          type: 'sync-callback',
        }),
      );

      await expect(run(queue)).resolves.toBe(error);
      expect(trace).toStrictEqual([
        'start:before failure',
        'end:before failure',
        'start:failure',
        'end:failure',
      ]);
    });

    it('lets all parallel tasks settle even when one task fails', async () => {
      const trace: Trace = [];
      const error = new Error('expected parallel failure');
      const queue = new ParallelImplementation('failing parallel');

      queue.add(
        recordingTask(implementation, trace, 'failure', {
          type: 'async-callback',
          delay: 1,
          error,
        }),
      );
      queue.add(
        recordingTask(implementation, trace, 'slow success', {
          type: 'async-callback',
          delay: 10,
        }),
      );

      await expect(run(queue)).resolves.toBeTruthy();
      expect(trace).toStrictEqual([
        'start:failure',
        'start:slow success',
        'end:failure',
        'end:slow success',
      ]);
    });

    it('supports scheduler variants without changing sequential task order', async () => {
      const trace: Trace = [];
      const queue = new SequentialImplementation('scheduled sequential tasks');

      queue.add(
        recordingTask(
          implementation,
          trace,
          'next tick',
          { type: 'sync-callback' },
          'nextTick',
        ),
      );
      queue.add(
        recordingTask(
          implementation,
          trace,
          'immediate',
          { type: 'sync-callback' },
          'setImmediate',
        ),
      );
      queue.add(
        recordingTask(
          implementation,
          trace,
          'timeout',
          { type: 'sync-callback' },
          'setTimeout',
        ),
      );

      await expect(run(queue)).resolves.toBeUndefined();
      expect(trace).toStrictEqual([
        'start:next tick',
        'end:next tick',
        'start:immediate',
        'end:immediate',
        'start:timeout',
        'end:timeout',
      ]);
    });
  });
};

for (const implementation of implementations) {
  defineTaskCollectionBehaviorSpecs(implementation);
}

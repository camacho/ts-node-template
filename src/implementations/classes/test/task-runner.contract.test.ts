import { describe, expect, it } from 'vitest';

import { implementations } from './implementations.ts';
import type {
  TaskCallback,
  TaskCollection,
  TaskFn,
  Task,
} from '../../../types.ts';

const run = async (task: Task) =>
  new Promise<unknown>((resolve) => {
    task.run(resolve);
  });

describe.each(implementations)('$name task runner contract', (impl) => {
  const task = (fn: TaskFn) => new impl.Task(fn);
  const sync = (trace: string[]) =>
    task(() => {
      trace.push(`start:sync`);
      trace.push(`end:sync`);
    });
  const asyncTask = (trace: string[], delay = 0) =>
    task((next) => {
      trace.push(`start:async`);
      setTimeout(() => {
        trace.push(`end:async`);
        next();
      }, delay);
    });
  const fail = (trace: string[], error: Error, delay = 0) =>
    task((next) => {
      trace.push(`start`);
      setTimeout(() => {
        trace.push(`end`);
        next(error);
      }, delay);
    });
  const add = (collection: TaskCollection, item: Task | TaskFn) => {
    const addItem = collection.add.bind(collection) as (
      task: Task | TaskFn,
    ) => void;

    addItem(item);
  };

  it('runs sequential tasks in order and stops on error', async () => {
    const trace: string[] = [];
    const error = new Error('stop');
    const success = new impl.SequentialTasks();
    const failure = new impl.SequentialTasks();

    add(success, sync(trace));
    add(success, asyncTask(trace));
    add(failure, sync(trace));
    add(failure, fail(trace, error));
    add(failure, sync(trace));

    await expect(run(success)).resolves.toBeUndefined();
    await expect(run(failure)).resolves.toBe(error);
    expect(trace).toStrictEqual([
      'start:sync',
      'end:sync',
      'start:async',
      'end:async',
      'start:sync',
      'end:sync',
      'start',
      'end',
    ]);
  });

  it('runs parallel tasks together and waits for failures to settle', async () => {
    const trace: string[] = [];
    const firstError = new Error('first');
    const secondError = new Error('second');
    const queue = new impl.ParallelTasks();

    add(queue, fail(trace, firstError, 1));
    add(queue, asyncTask(trace, 5));
    add(queue, fail(trace, secondError, 2));

    const result = await run(queue);

    expect(result).toBeInstanceOf(Set);
    expect(result).toHaveProperty('size', 2);
    expect([...(result as Set<unknown>).values()]).toStrictEqual([
      firstError,
      secondError,
    ]);
    expect(trace).toStrictEqual([
      'start',
      'start:async',
      'start',
      'end',
      'end',
      'end:async',
    ]);
  });

  it('supports nested sequential and parallel collections', async () => {
    const trace: string[] = [];
    const queue = new impl.SequentialTasks();
    const child = new impl.ParallelTasks();
    const sibling = new impl.SequentialTasks();

    add(child, asyncTask(trace, 5));
    add(child, asyncTask(trace, 1));
    add(sibling, sync(trace));
    add(sibling, sync(trace));
    add(queue, sync(trace));
    add(queue, child);
    add(queue, sibling);
    add(queue, sync(trace));

    await expect(run(queue)).resolves.toBeUndefined();
    expect(trace).toStrictEqual([
      'start:sync',
      'end:sync',
      'start:async',
      'start:async',
      'end:async',
      'end:async',
      'start:sync',
      'end:sync',
      'start:sync',
      'end:sync',
      'start:sync',
      'end:sync',
    ]);
  });

  it('propagates nested failures according to parent semantics', async () => {
    const trace: string[] = [];
    const error = new Error('nested');
    const queue = new impl.ParallelTasks();
    const failingSequential = new impl.SequentialTasks();
    const slowSibling = new impl.SequentialTasks();

    add(failingSequential, fail(trace, error, 1));
    add(failingSequential, sync(trace));
    add(slowSibling, asyncTask(trace, 5));
    add(slowSibling, sync(trace));
    add(queue, failingSequential);
    add(queue, slowSibling);

    const result = await run(queue);

    expect(result).toBeInstanceOf(Set);
    expect(result).toHaveProperty('size', 1);
    expect(trace).toStrictEqual([
      'start',
      'start:async',
      'end',
      'end:async',
      'start:sync',
      'end:sync',
    ]);
  });

  it('covers collection boundaries and add paths', async () => {
    const trace: string[] = [];
    const emptySequential = new impl.SequentialTasks();
    const emptyParallel = new impl.ParallelTasks();
    const rawFnQueue = new impl.SequentialTasks();
    const iterableQueue = new impl.SequentialTasks([sync(trace), sync(trace)]);

    add(rawFnQueue, (next: TaskCallback) => {
      trace.push('start:raw function');
      trace.push('end:raw function');
      next();
    });

    await expect(run(emptySequential)).resolves.toBeUndefined();
    await expect(run(emptyParallel)).resolves.toBeUndefined();
    expect(emptySequential.size).toBe(0);
    expect(emptyParallel.size).toBe(0);
    await expect(run(rawFnQueue)).resolves.toBeUndefined();
    await expect(run(iterableQueue)).resolves.toBeUndefined();
    expect(() => {
      emptySequential.run();
    }).toThrow(Error);
    expect(() => {
      emptyParallel.run();
    }).toThrow(Error);
    expect(() => {
      rawFnQueue.run();
    }).toThrow(Error);
    expect(trace).toStrictEqual([
      'start:raw function',
      'end:raw function',
      'start:sync',
      'end:sync',
      'start:sync',
      'end:sync',
    ]);
  });

  it('documents add-during-run behavior', async () => {
    const trace: string[] = [];
    const sequential = new impl.SequentialTasks();
    const parallel = new impl.ParallelTasks();

    add(sequential, (next: TaskCallback) => {
      trace.push('start:sequential appender');
      add(sequential, sync(trace));
      trace.push('end:sequential appender');
      next();
    });
    add(parallel, (next: TaskCallback) => {
      trace.push('start:parallel appender');
      add(parallel, sync(trace));
      setTimeout(() => {
        trace.push('end:parallel appender');
        next();
      }, 1);
    });
    add(parallel, asyncTask(trace, 5));

    await expect(run(sequential)).resolves.toBeUndefined();
    await expect(run(parallel)).resolves.toBeUndefined();
    expect(trace).toStrictEqual([
      'start:sequential appender',
      'end:sequential appender',
      'start:sync',
      'end:sync',
      'start:parallel appender',
      'start:async',
      'start:sync',
      'end:sync',
      'end:parallel appender',
      'end:async',
    ]);
  });
});

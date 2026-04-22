import { describe, expect, it } from 'vitest';

import { Task } from '../src/Task.ts';
import {
  ParallelTasks,
  SequentialTasks,
  TaskCollection,
} from '../src/TaskCollection.ts';
import type {
  TaskCallback,
  TaskCollectionInterface,
  TaskConstructor,
  TaskFn,
  TaskInterface,
  TaskRunnerImplementation,
} from '../src/contracts.ts';

const implementations = [
  { name: 'current implementation', Task, SequentialTasks, ParallelTasks },
] satisfies Array<TaskRunnerImplementation<Task, SequentialTasks | ParallelTasks>>;

const run = async (task: TaskInterface) =>
  new Promise<unknown>((resolve) => {
    task.run(resolve);
  });

describe.each(implementations)('$name task runner contract', (impl) => {
  const task = (name: string, fn: TaskFn) =>
    new (impl.Task as TaskConstructor)(fn, name);
  const sync = (trace: string[], name: string) =>
    task(name, () => {
      trace.push(`start:${name}`);
      trace.push(`end:${name}`);
    });
  const asyncTask = (trace: string[], name: string, delay = 0) =>
    task(name, (next) => {
      trace.push(`start:${name}`);
      setTimeout(() => {
        trace.push(`end:${name}`);
        next();
      }, delay);
    });
  const fail = (trace: string[], name: string, error: Error, delay = 0) =>
    task(name, (next) => {
      trace.push(`start:${name}`);
      setTimeout(() => {
        trace.push(`end:${name}`);
        next(error);
      }, delay);
    });
  const add = (
    collection: TaskCollectionInterface,
    item: TaskInterface | TaskFn,
  ) => {
    const addItem = collection.add.bind(collection) as (
      task: TaskInterface | TaskFn,
    ) => void;

    addItem(item);
  };

  it('runs sequential tasks in order and stops on error', async () => {
    const trace: string[] = [];
    const error = new Error('stop');
    const success = new impl.SequentialTasks('success');
    const failure = new impl.SequentialTasks('failure');

    add(success, sync(trace, 'first'));
    add(success, asyncTask(trace, 'second'));
    add(failure, sync(trace, 'before failure'));
    add(failure, fail(trace, 'failure', error));
    add(failure, sync(trace, 'after failure'));

    await expect(run(success)).resolves.toBeUndefined();
    await expect(run(failure)).resolves.toBe(error);
    expect(trace).toStrictEqual([
      'start:first',
      'end:first',
      'start:second',
      'end:second',
      'start:before failure',
      'end:before failure',
      'start:failure',
      'end:failure',
    ]);
  });

  it('runs parallel tasks together and waits for failures to settle', async () => {
    const trace: string[] = [];
    const firstError = new Error('first');
    const secondError = new Error('second');
    const queue = new impl.ParallelTasks('parallel');

    add(queue, fail(trace, 'first failure', firstError, 1));
    add(queue, asyncTask(trace, 'slow success', 5));
    add(queue, fail(trace, 'second failure', secondError, 2));

    const result = await run(queue);

    expect(result).toBeInstanceOf(Map);
    expect(result).toHaveProperty('size', 2);
    expect([...(result as Map<string, unknown>).values()]).toStrictEqual([
      firstError,
      secondError,
    ]);
    expect(trace).toStrictEqual([
      'start:first failure',
      'start:slow success',
      'start:second failure',
      'end:first failure',
      'end:second failure',
      'end:slow success',
    ]);
  });

  it('supports nested sequential and parallel collections', async () => {
    const trace: string[] = [];
    const queue = new impl.SequentialTasks('outer');
    const child = new impl.ParallelTasks('child');
    const sibling = new impl.SequentialTasks('sibling');

    add(child, asyncTask(trace, 'child slow', 5));
    add(child, asyncTask(trace, 'child fast', 1));
    add(sibling, sync(trace, 'sibling first'));
    add(sibling, sync(trace, 'sibling second'));
    add(queue, sync(trace, 'before child'));
    add(queue, child);
    add(queue, sibling);
    add(queue, sync(trace, 'after sibling'));

    await expect(run(queue)).resolves.toBeUndefined();
    expect(trace).toStrictEqual([
      'start:before child',
      'end:before child',
      'start:child slow',
      'start:child fast',
      'end:child fast',
      'end:child slow',
      'start:sibling first',
      'end:sibling first',
      'start:sibling second',
      'end:sibling second',
      'start:after sibling',
      'end:after sibling',
    ]);
  });

  it('propagates nested failures according to parent semantics', async () => {
    const trace: string[] = [];
    const error = new Error('nested');
    const queue = new impl.ParallelTasks('outer');
    const failingSequential = new impl.SequentialTasks('failing sequential');
    const slowSibling = new impl.SequentialTasks('slow sibling');

    add(failingSequential, fail(trace, 'nested failure', error, 1));
    add(failingSequential, sync(trace, 'skipped after failure'));
    add(slowSibling, asyncTask(trace, 'slow sibling first', 5));
    add(slowSibling, sync(trace, 'slow sibling second'));
    add(queue, failingSequential);
    add(queue, slowSibling);

    const result = await run(queue);

    expect(result).toBeInstanceOf(Map);
    expect(result).toHaveProperty('size', 1);
    expect(trace).toStrictEqual([
      'start:nested failure',
      'start:slow sibling first',
      'end:nested failure',
      'end:slow sibling first',
      'start:slow sibling second',
      'end:slow sibling second',
    ]);
  });

  it('covers collection boundaries and add paths', async () => {
    const trace: string[] = [];
    const emptySequential = new impl.SequentialTasks('empty sequential');
    const emptyParallel = new impl.ParallelTasks('empty parallel');
    const rawFnQueue = new impl.SequentialTasks('raw fn');
    const iterableQueue = new impl.SequentialTasks('iterable', [
      sync(trace, 'iterable first') as Task,
      sync(trace, 'iterable second') as Task,
    ]);

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
    expect(trace).toStrictEqual([
      'start:raw function',
      'end:raw function',
      'start:iterable first',
      'end:iterable first',
      'start:iterable second',
      'end:iterable second',
    ]);
  });

  it('documents add-during-run behavior', async () => {
    const trace: string[] = [];
    const sequential = new impl.SequentialTasks('mutating sequential');
    const parallel = new impl.ParallelTasks('mutating parallel');

    add(sequential, (next: TaskCallback) => {
      trace.push('start:sequential appender');
      add(sequential, sync(trace, 'sequential appended'));
      trace.push('end:sequential appender');
      next();
    });
    add(parallel, (next: TaskCallback) => {
      trace.push('start:parallel appender');
      add(parallel, sync(trace, 'parallel appended'));
      setTimeout(() => {
        trace.push('end:parallel appender');
        next();
      }, 1);
    });
    add(parallel, asyncTask(trace, 'parallel sibling', 5));

    await expect(run(sequential)).resolves.toBeUndefined();
    await expect(run(parallel)).resolves.toBeUndefined();
    expect(trace).toStrictEqual([
      'start:sequential appender',
      'end:sequential appender',
      'start:sequential appended',
      'end:sequential appended',
      'start:parallel appender',
      'start:parallel sibling',
      'start:parallel appended',
      'end:parallel appended',
      'end:parallel appender',
      'end:parallel sibling',
    ]);
  });
});

it('reports that the base task collection drain is abstract', async () => {
  await expect(
    run(new TaskCollection('base collection')),
  ).resolves.toBeInstanceOf(Error);
});

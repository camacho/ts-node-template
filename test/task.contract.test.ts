import { describe, expect, it } from 'vitest';

import { Task } from '../src/Task.ts';
import type {
  TaskCallback,
  TaskFn,
  TaskInterface,
  TaskScheduling,
  TaskConstructor,
} from '../src/contracts.ts';

const implementations = [{ name: 'current implementation', Task }];

const run = async (task: TaskInterface) =>
  new Promise<unknown>((resolve) => {
    task.run(resolve);
  });

const wait = async () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe.each(implementations)('$name Task contract', ({ Task }) => {
  const task = (fn: TaskFn, name = 'task', scheduling?: TaskScheduling) =>
    new (Task as TaskConstructor)(fn, name, scheduling);

  it('starts idle with identity', () => {
    const subject = task(() => undefined, 'named task');

    expect(subject.id).toBeTypeOf('string');
    expect(subject.name).toBe('named task');
    expect(subject.status).toBe('idle');
    expect(subject.error).toBeUndefined();
  });

  it('completes sync, callback, and async tasks', async () => {
    const trace: string[] = [];

    await expect(run(task(() => trace.push('sync')))).resolves.toBeUndefined();
    await expect(
      run(
        task((next) => {
          trace.push('callback');
          next();
        }),
      ),
    ).resolves.toBeUndefined();
    await expect(
      run(
        task((next) => {
          setTimeout(() => {
            trace.push('async');
            next();
          }, 0);
        }),
      ),
    ).resolves.toBeUndefined();

    expect(trace).toStrictEqual(['sync', 'callback', 'async']);
  });

  it('fails on thrown or callback errors', async () => {
    const thrown = new Error('thrown');
    const callback = new Error('callback');
    const thrownTask = task(() => {
      throw thrown;
    });
    const callbackTask = task((next) => { next(callback); });

    await expect(run(thrownTask)).resolves.toBe(thrown);
    await expect(run(callbackTask)).resolves.toBe(callback);
    expect(thrownTask.status).toBe('failed');
    expect(thrownTask.error).toBe(thrown);
    expect(callbackTask.status).toBe('failed');
    expect(callbackTask.error).toBe(callback);
  });

  it('runs every scheduling mode', async () => {
    const trace: string[] = [];

    for (const scheduling of [
      'sync',
      'nextTick',
      'setTimeout',
      'setImmediate',
    ] satisfies TaskScheduling[]) {
      await expect(
        run(task(() => trace.push(scheduling), scheduling, scheduling)),
      ).resolves.toBeUndefined();
    }

    expect(trace).toStrictEqual([
      'sync',
      'nextTick',
      'setTimeout',
      'setImmediate',
    ]);
  });

  it('settles only once and waits for callback tasks', async () => {
    const settled: unknown[] = [];
    const doubleCallback = task((next) => {
      next();
      next(new Error('ignored'));
    });
    const neverFinishes = task((next) => {
      void next;
    });

    doubleCallback.run((error) => settled.push(error));
    neverFinishes.run((error) => settled.push(error));
    await wait();

    expect(settled).toStrictEqual([undefined]);
    expect(doubleCallback.status).toBe('completed');
    expect(neverFinishes.status).toBe('running');
  });

  it('reports status errors when rerun', async () => {
    let finish: TaskCallback | undefined;
    const completed = task(() => undefined);
    const running = task((next) => {
      finish = next;
    });
    const runningErrors: unknown[] = [];

    await expect(run(completed)).resolves.toBeUndefined();
    await expect(run(completed)).resolves.toBeInstanceOf(Error);

    running.run((error) => runningErrors.push(error));
    running.run((error) => runningErrors.push(error));
    finish?.();
    await wait();

    expect(runningErrors).toHaveLength(2);
    expect(runningErrors[0]).toBeInstanceOf(Error);
    expect(runningErrors[1]).toBeInstanceOf(Error);
    expect(running.status).toBe('failed');
  });
});

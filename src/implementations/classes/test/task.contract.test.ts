import { describe, expect, it } from 'vitest';

import { implementations } from './implementations.ts';
import type { TaskFn, Task, TaskScheduling } from '../../../types.ts';

const run = async (task: Task) =>
  new Promise<unknown>((resolve) => {
    task.run(resolve);
  });

const wait = async () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe.each(implementations)('$name Task contract', ({ Task }) => {
  const task = (fn: TaskFn, scheduling?: TaskScheduling) =>
    new Task(fn, scheduling);

  it('starts idle with identity', () => {
    const subject = task(() => undefined);
    expect(subject.status).toBe('idle');
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
    const callbackTask = task((next) => {
      next(callback);
    });

    await expect(run(thrownTask)).resolves.toBe(thrown);
    await expect(run(callbackTask)).resolves.toBe(callback);
    expect(thrownTask.status).toBe('failed');
    expect(callbackTask.status).toBe('failed');
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
        run(task(() => trace.push(scheduling), scheduling)),
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

  it('throws when rerun', async () => {
    const completed = task(() => undefined);
    const running = task((next) => {
      void next;
    });

    await expect(run(completed)).resolves.toBeUndefined();
    expect(() => {
      completed.run();
    }).toThrow(Error);

    running.run();
    expect(() => {
      running.run();
    }).toThrow(Error);
    expect(running.status).toBe('running');
  });

  it.todo('fails a callback task when it exceeds a run timeout');

  it.todo('lets a task-specific timeout override the default timeout');
});

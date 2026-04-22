import { describe, expect, it } from 'vitest';

import {
  Task,
  type TaskCallback,
  type TaskFn,
  type TaskInterface,
} from '../src/Task.ts';

type Scheduling = ConstructorParameters<typeof Task>[2];
type TaskConstructor<TTask extends TaskInterface = TaskInterface> = new (
  ...args: ConstructorParameters<typeof Task>
) => TTask;
type TaskImplementation<TTask extends TaskInterface = TaskInterface> = {
  name: string;
  Task: TaskConstructor<TTask>;
};

const implementations = [
  {
    name: 'current implementation',
    Task,
  },
] satisfies TaskImplementation[];

const run = async (task: TaskInterface) =>
  new Promise<unknown>((resolve) => {
    task.run(resolve);
  });

const deferred = (callback: TaskCallback) => {
  setTimeout(callback, 0);
};

export const defineTaskContractSpecs = <TTask extends TaskInterface>({
  name,
  Task: TaskImplementation,
}: TaskImplementation<TTask>) => {
  const createTask = (
    fn: TaskFn,
    taskName = 'contract task',
    scheduling?: Scheduling,
  ) => new TaskImplementation(fn, taskName, scheduling);

  describe(name, () => {
    it('exposes stable identity and starts idle', () => {
      const task = createTask(() => undefined, 'named task');

      expect(task.id).toBeTypeOf('string');
      expect(task.id).not.toHaveLength(0);
      expect(task.name).toBe('named task');
      expect(task.status).toBe('idle');
      expect(task.error).toBeUndefined();
    });

    it('completes a synchronous task that does not use the callback', async () => {
      const trace: string[] = [];
      const task = createTask(() => {
        trace.push('ran task');
      });

      await expect(run(task)).resolves.toBeUndefined();
      expect(trace).toStrictEqual(['ran task']);
      expect(task.status).toBe('completed');
      expect(task.error).toBeUndefined();
    });

    it('completes a synchronous callback task', async () => {
      const trace: string[] = [];
      const task = createTask((next) => {
        trace.push('before callback');
        next();
        trace.push('after callback');
      });

      await expect(run(task)).resolves.toBeUndefined();
      expect(trace).toStrictEqual(['before callback', 'after callback']);
      expect(task.status).toBe('completed');
    });

    it('completes an asynchronous callback task', async () => {
      const trace: string[] = [];
      const task = createTask((next) => {
        trace.push('started');
        deferred(() => {
          trace.push('finished');
          next();
        });
      });

      await expect(run(task)).resolves.toBeUndefined();
      expect(trace).toStrictEqual(['started', 'finished']);
      expect(task.status).toBe('completed');
    });

    it('fails when the task throws synchronously', async () => {
      const error = new Error('expected thrown failure');
      const task = createTask(() => {
        throw error;
      });

      await expect(run(task)).resolves.toBe(error);
      expect(task.status).toBe('failed');
      expect(task.error).toBe(error);
    });

    it('fails when the callback receives an error', async () => {
      const error = new Error('expected callback failure');
      const task = createTask((next) => {
        deferred(() => {
          next(error);
        });
      });

      await expect(run(task)).resolves.toBe(error);
      expect(task.status).toBe('failed');
      expect(task.error).toBe(error);
    });

    it('settles only once when a task calls back more than once', async () => {
      const errors: unknown[] = [];
      const task = createTask((next) => {
        next();
        next(new Error('second callback should be ignored'));
      });

      task.run((error) => {
        errors.push(error);
      });

      await new Promise((resolve) => {
        deferred(resolve);
      });

      expect(errors).toStrictEqual([undefined]);
      expect(task.status).toBe('completed');
      expect(task.error).toBeUndefined();
    });

    it('keeps a callback task running until the callback is called', async () => {
      const errors: unknown[] = [];
      const task = createTask((next) => {
        void next;
      });

      task.run((error) => {
        errors.push(error);
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });

      expect(errors).toStrictEqual([]);
      expect(task.status).toBe('running');
      expect(task.error).toBeUndefined();
    });

    it.each([
      ['sync', 'sync'],
      ['nextTick', 'nextTick'],
      ['setTimeout', 'setTimeout'],
      ['setImmediate', 'setImmediate'],
    ] satisfies Array<[string, Scheduling]>)(
      'runs tasks scheduled with %s',
      async (_label, scheduling) => {
        const trace: string[] = [];
        const task = createTask(
          () => {
            trace.push('ran task');
          },
          `${scheduling} task`,
          scheduling,
        );

        await expect(run(task)).resolves.toBeUndefined();
        expect(trace).toStrictEqual(['ran task']);
        expect(task.status).toBe('completed');
      },
    );

    it('reports a status error when a completed task is run again', async () => {
      const task = createTask(() => undefined);

      await expect(run(task)).resolves.toBeUndefined();
      await expect(run(task)).resolves.toBeInstanceOf(Error);
      expect(task.status).toBe('completed');
    });

    it('fails a running task when it is run again', async () => {
      let finish: TaskCallback | undefined;
      const errors: unknown[] = [];
      const task = createTask((next) => {
        finish = next;
      });

      task.run((error) => {
        errors.push(error);
      });
      task.run((error) => {
        errors.push(error);
      });
      finish?.();

      await new Promise((resolve) => {
        deferred(resolve);
      });

      expect(errors).toHaveLength(2);
      expect(errors[0]).toBeInstanceOf(Error);
      expect(errors[1]).toBeInstanceOf(Error);
      expect(task.status).toBe('failed');
    });
  });
};

for (const implementation of implementations) {
  defineTaskContractSpecs(implementation);
}

import { once } from 'es-toolkit';
import { Task, type TaskFn, type TaskCallback } from './Task.ts';
import { ParallelTasks, SequentialTasks } from './TaskCollection.ts';

const logResult = Object.assign(
  (name: string, predicate: (error?: unknown) => boolean) =>
    (error?: unknown) => {
      const output: string[] = [];

      if (predicate(error)) {
        output.push(`✅ ${name} completed as expected.`);
      } else {
        output.push(
          `❌ ${name} unintentionally failed with error(s):\n${logResult.indentError(error)}`,
        );
      }

      if (error !== undefined) {
        output.push(
          ...logResult
            .indentError(error)
            .split('\n')
            .map((line) => line.trimEnd()),
        );
      }

      output.push(
        logResult.divider(
          Math.min(output.join('\n').length, process.stdout.columns),
        ),
      );

      console.log(output.join('\n'));
    },
  {
    divider: (error?: number | unknown): string =>
      '-'.repeat(
        Math.max(
          logResult
            .extractError(error)
            .split('\n')
            .sort((a, b) => b.length - a.length)[0]?.length ?? 0,
          120,
        ),
      ),
    extractError: (error: unknown) =>
      String(
        error instanceof Error
          ? (error.stack ?? error.message)
          : error
            ? JSON.stringify(error, null, 2)
            : error,
      )
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n'),
    indentError: (error: unknown, indentSize = 2): string => {
      const indent = ' '.repeat(indentSize);
      return logResult
        .extractError(error)
        .split('\n')
        .map((line) => `${indent}${line}`)
        .join('\n');
    },
  },
);

const testCases = new SequentialTasks('Test Cases');
const addTestCase = (
  predicate: (error?: unknown) => boolean,
  fn: Task | TaskFn,
  name?: typeof fn extends Task ? undefined : string,
  scheduling?: typeof fn extends Task
    ? undefined
    : (typeof Task.SCHEDULING)[number],
) => {
  const taskName = `Test Case: ${fn instanceof Task ? fn.name : (name ?? testCases.size + 1)}`;

  testCases.add(
    (callback: TaskCallback) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const done: TaskCallback = once((error?: unknown) => {
        logResult(taskName, predicate)(error);
        // Swallow error to allow remaining test cases to run
        callback();
      });

      const run = (fn instanceof Task ? fn.run : fn).bind(fn);

      let error;
      try {
        run(done);
      } catch (err) {
        error = err;
      }

      if (!run.length || error) {
        done(error);
      }
    },
    taskName,
    scheduling,
  );
};

addTestCase(
  (error) => error === undefined,
  () => {
    // NOTE: blank task function to test default no-op callback
  },
  'Blank Sync Task',
);

addTestCase(
  (error) => error === undefined,
  new Task((next: (error?: unknown) => void) => {
    next();
  }, 'Async Task'),
);

addTestCase(
  (error) => error === undefined,
  new Task((next: (error?: unknown) => void) => {
    setTimeout(() => {
      next();
    }, 1000);
  }, 'Async Task'),
);

addTestCase(
  (error) => error !== undefined,
  new Task((next) => {
    setTimeout(() => {
      next(new Error('Async Error'));
    }, 1000);
  }, 'Async Error Task'),
);

addTestCase(
  (error) => error !== undefined,
  new Task(() => {
    throw new Error('Sync Thrown Error');
  }, 'Sync Thrown Error Task'),
);

addTestCase(
  (err) => err !== undefined,
  () => {
    throw new Error('Sync Error');
  },
  'Sync Error Task',
);

{
  const sequentialTasks = new SequentialTasks('Sequential Tasks');

  sequentialTasks.add((next) => {
    next();
  }, 'Sequential Async Task');

  sequentialTasks.add(
    new Task((next) => {
      setTimeout(() => {
        next();
      }, 1000);
    }, 'Sequential Sync Task'),
  );

  addTestCase((error) => error === undefined, sequentialTasks);
}

{
  const sequentialTasks = new SequentialTasks('Sequential Tasks with Error');

  sequentialTasks.add((next) => {
    setTimeout(() => {
      next();
    }, 1000);
  }, 'Sequential Async Task');

  sequentialTasks.add((next) => {
    setTimeout(() => {
      next(new Error('Sequential Async Intentional Error'));
    }, 1000);
  }, 'Sequential Async Error Task');

  addTestCase((error) => error !== undefined, sequentialTasks);
}

{
  const parallelTasks = new ParallelTasks('Parallel Tasks');

  parallelTasks.add((next) => {
    next();
  }, 'Parallel Async Task');
  parallelTasks.add(
    new Task((next) => {
      setTimeout(() => {
        next();
      }, 1000);
    }, 'Parallel Sync Task'),
  );

  addTestCase((error) => error === undefined, parallelTasks);
}

{
  const parallelTasks = new ParallelTasks('Parallel Tasks with Async Error');

  parallelTasks.add((next) => {
    setTimeout(() => {
      next();
    }, 1000);
  }, 'Parallel Async Task');

  parallelTasks.add((next) => {
    setTimeout(() => {
      next(new Error('Parallel Async Intentional Error'));
    }, 1000);
  }, 'Parallel Async Error Task');

  addTestCase(
    (error) => error instanceof Map && error.size === 1,
    parallelTasks,
  );
}

console.log(testCases.size);

testCases.run((error) => {
  if (error) {
    console.error('🏁 Test cases completed with error(s):\n', error);
  } else {
    console.log('🏁 All test cases completed successfully.');
  }
});

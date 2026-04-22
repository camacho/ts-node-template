import { once } from 'es-toolkit';

import { Task } from './Task.ts';
import type { TaskCallback, TaskFn } from './Task.ts';

export class TaskCollection extends Task {
  protected readonly tasks: Set<Task>;

  constructor(name: string, tasks?: Iterable<Task>) {
    super((next) => {
      this.drain(next);
    }, name);

    this.tasks = new Set(tasks);
  }

  public add(task: Task, name?: undefined, scheduling?: undefined): void;
  public add(
    fn: TaskFn,
    name?: string,
    scheduling?: (typeof Task.SCHEDULING)[number],
  ): void;
  public add(
    task: Task | TaskFn,
    name = `${this.name} - ${this.tasks.size + 1}`,
    scheduling: (typeof Task.SCHEDULING)[number] = 'sync',
  ) {
    this.tasks.add(
      task instanceof Task ? task : new Task(task, name, scheduling),
    );
  }

  public get size() {
    return this.tasks.size;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected drain(_callback?: TaskCallback) {
    throw new Error('`drain` is not implemented');
  }
}

export class ParallelTasks extends TaskCollection {
  protected override drain(callback?: TaskCallback) {
    const done = callback ? once(callback) : undefined;
    const errors = new Map<string, unknown>();

    const after = (id: string, error: unknown) => {
      if (error) {
        errors.set(id, error);
      }

      if (
        this.tasks
          .values()
          .every(({ status }) => status === 'failed' || status === 'completed')
      ) {
        done?.(errors.size ? errors : undefined);
      }
    };

    if (
      ![...this.tasks.values().filter(({ status }) => status === 'idle')].length
    ) {
      done?.();
      return;
    }

    for (const task of this.tasks
      .values()
      .filter(({ status }) => status === 'idle')) {
      task.run(after.bind(this, task.id));
    }
  }
}

export class SequentialTasks extends TaskCollection {
  protected override drain(callback?: TaskCallback) {
    const done = callback ? once(callback) : undefined;

    const next: TaskCallback = (error) => {
      if (error) {
        done?.(error);
        return;
      }

      // NOTE: this implementation allows adding tasks during run
      // NOTE: reducing the iterator is managed by changing task status
      const [task] = this.tasks.values().filter((t) => t.status === 'idle');

      if (!task) {
        done?.();
        return;
      }

      task.run(next);
    };

    next();
  }
}

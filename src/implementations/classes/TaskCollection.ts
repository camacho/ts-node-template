import { once } from 'es-toolkit';

import { Task } from './Task.ts';
import type { TaskCallback, TaskFn, TaskScheduling } from '../../types.ts';

export class TaskCollection extends Task {
  protected readonly tasks: Set<Task>;

  constructor(tasks?: Iterable<Task>) {
    super((next) => {
      this.drain(next);
    });

    this.tasks = new Set(tasks);
  }

  public add(task: Task, scheduling?: undefined): void;
  public add(fn: TaskFn, scheduling?: TaskScheduling): void;
  public add(task: Task | TaskFn, scheduling: TaskScheduling = 'sync') {
    this.tasks.add(task instanceof Task ? task : new Task(task, scheduling));
  }

  public get size() {
    return this.tasks.size;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected drain(_callback?: TaskCallback) {
    throw new Error(`Drain must be run by a task collection type.`);
  }

  protected isDrainable() {
    if (!this.tasks.size) {
      return false;
    }

    if (this.tasks.values().some(({ status }) => status !== 'idle')) {
      throw new Error(`TaskCollection has already started.`);
    }

    return true;
  }
}

export class ParallelTasks extends TaskCollection {
  protected override drain(callback?: TaskCallback) {
    const done = callback ? once(callback) : undefined;

    if (!this.isDrainable()) {
      done?.();
      return;
    }

    const errors = new Set<unknown>();

    const next = (error: unknown) => {
      if (error) {
        errors.add(error);
      }

      if (
        this.tasks
          .values()
          .every(({ status }) => ['failed', 'completed'].includes(status))
      ) {
        done?.(errors.size ? errors : undefined);
      }
    };

    for (const task of this.tasks
      .values()
      .filter(({ status }) => status === 'idle')) {
      task.run(next);
    }
  }
}

export class SequentialTasks extends TaskCollection {
  protected override drain(callback?: TaskCallback) {
    const done = callback ? once(callback) : undefined;

    if (!this.isDrainable()) {
      done?.();
      return;
    }

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

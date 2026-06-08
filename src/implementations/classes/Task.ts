import {
  taskSchedulings,
  taskStatuses,
  type TaskCallback,
  type TaskFn,
  type Task as TaskInterface,
  type TaskScheduling,
  type TaskStatus,
} from '../../types.ts';

import { normalizeTask } from '../../utils/normalize-task.ts';

export class Task implements TaskInterface {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  static STATUS = taskStatuses;

  // eslint-disable-next-line @typescript-eslint/naming-convention
  static readonly SCHEDULING = taskSchedulings;

  protected static generateId() {
    return Math.random().toString(36).slice(2, 10);
  }

  public status: TaskStatus;

  protected readonly scheduling: TaskScheduling;

  private readonly fn: TaskFn;

  constructor(fn: TaskFn, scheduling: TaskScheduling = 'sync') {
    this.status = 'idle';
    this.scheduling = scheduling;
    this.fn = normalizeTask(fn);
  }

  public run(callback?: TaskCallback) {
    this.enforceStatus('idle');
    this.status = 'running';
    this.schedule(this.done(callback));
  }

  protected enforceStatus(
    status: string | string[],
    errorMessage = `Cannot execute task because it is not in "${String(
      status,
    )}" status.`,
  ) {
    if (
      Array.isArray(status)
        ? !status.includes(this.status)
        : status !== this.status
    ) {
      throw new Error(errorMessage);
    }

    return true;
  }

  private done(callback?: TaskCallback): TaskCallback {
    return (error?) => {
      try {
        this.enforceStatus('running');
      } catch (statusError) {
        callback?.(error ?? statusError);
        return;
      }

      this.status = error ? 'failed' : 'completed';
      callback?.(error);
    };
  }

  private schedule(done: TaskCallback) {
    const fn = this.fn.bind(this, done);

    switch (this.scheduling) {
      case 'sync':
        fn();
        break;
      case 'nextTick':
        process.nextTick(fn);
        break;
      case 'setTimeout':
        setTimeout(fn, 0);
        break;
      case 'setImmediate':
        setImmediate(fn);
        break;
    }
  }
}

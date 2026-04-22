import { once } from 'es-toolkit';

export type TaskCallback = (error?: unknown) => void;
export type TaskFn = (next: TaskCallback) => void;

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TaskInterface {
  readonly id: string;
  readonly name: string;
  readonly status: (typeof Task.STATUS)[number];
  readonly error?: unknown;
  run(callback?: TaskCallback): void;
}

export class Task implements TaskInterface {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  static STATUS = ['idle', 'running', 'completed', 'failed'] as const;

  // eslint-disable-next-line @typescript-eslint/naming-convention
  static readonly SCHEDULING = [
    'sync',
    'nextTick',
    'setTimeout',
    'setImmediate',
  ] as const;

  protected static generateId() {
    return Math.random().toString(36).slice(2, 10);
  }

  private static normalize(fn: TaskFn): TaskFn {
    return (callback: TaskCallback) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const next = once(callback);

      let error;

      try {
        fn(next);
      } catch (err) {
        error = err;
      }

      if (error ?? !fn.length) {
        next(error);
      }
    };
  }

  public readonly id: string;
  public readonly name: string;
  public status: (typeof Task.STATUS)[number];
  public error?: unknown;

  protected readonly scheduling: (typeof Task.SCHEDULING)[number];

  private readonly fn: TaskFn;

  constructor(
    fn: TaskFn,
    name: string,
    scheduling: (typeof Task.SCHEDULING)[number] = 'sync',
  ) {
    this.id = Task.generateId();
    this.name = name;
    this.status = 'idle';
    this.scheduling = scheduling;
    this.fn = Task.normalize(fn);
  }

  public run(callback?: TaskCallback) {
    const done = this.done(callback);

    try {
      this.enforceStatus('idle');
    } catch (error) {
      done(error);
      return;
    }

    this.status = 'running';
    this.schedule(done);
  }

  protected enforceStatus(
    status: string | string[],
    errorMessage = `Cannot execute "${this.name}" because it is not in "${String(
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return (error?) => {
      try {
        this.enforceStatus('running');
      } catch (statusError) {
        callback?.(error ?? statusError);
        return;
      }

      this.status = error ? 'failed' : 'completed';
      this.error = error;

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

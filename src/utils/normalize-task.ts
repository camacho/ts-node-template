import { once } from 'es-toolkit';

import { type TaskCallback, type TaskFn } from '../types.ts';

export const normalizeTask = (fn: TaskFn): TaskFn => {
  return (callback: TaskCallback) => {
    // Wrapping callback in once to prevent multiple calls in case of sync functions that throw and
    // call the callback, or async functions that call the callback multiple times
    const next = once(callback);

    // Pass the next callback even if the original function doesn't expect it, to satisfy compiler
    try {
      fn(next);
    } catch (err) {
      // Relying on the callback to be called with an error to satisfy the contract
      next(err);
      return;
    }

    if (!fn.length) {
      next();
    }
  };
};

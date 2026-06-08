# Task Runner Contract Coverage

This project treats the task runner as a black box. Alternative implementations
should satisfy the public contracts in `src/types.ts`; the tests loop over an
implementation list and assert observable completion results plus trace order.

## Dimensions

The meaningful behavior dimensions are:

| Dimension        | Values                                                             |
| ---------------- | ------------------------------------------------------------------ |
| Task style       | sync no-callback, sync callback, async callback                    |
| Task outcome     | success, thrown error, callback error, never-callback              |
| Scheduling       | `sync`, `nextTick`, `setTimeout`, `setImmediate`                   |
| Collection type  | sequential, parallel                                               |
| Collection input | existing task, raw task function, constructor iterable             |
| Child count      | empty, one, many                                                   |
| Nesting          | task, sequential child, parallel child                             |
| Mutation         | add before run, add during sequential run, add during parallel run |

Full Cartesian coverage would be noisy and recursive. The contract suite uses
representative black-box cases, then code coverage can tell us whether any
implementation branches were missed.

## Contract Tests

`src/implementations/classes/test/task.contract.test.ts` covers the single-task
contract:

- identity and initial status
- sync, callback, and async completion
- thrown and callback errors
- every scheduling mode
- double-callback and never-callback behavior
- rerun status errors
- timeout behavior is planned and represented as TODO contract cases

`src/implementations/classes/test/task-runner.contract.test.ts` covers
collection behavior:

- sequential ordering and stop-on-error
- parallel start/wait/error aggregation
- nested sequential/parallel success
- nested failure propagation
- empty collections, raw functions, constructor iterables
- add-during-run behavior

## Intentional Policies

The `class-callback-drain` implementation and tests document these policies:

- A sequential collection runs tasks added while it is draining.
- A parallel collection also runs tasks added while its active iterator is
  draining.
- Rerunning a completed or currently running task throws immediately from
  `run()`.
- Parallel failures are reported as a `Set`.

These are contract decisions now. If they feel surprising, change the contract
first, then update the implementation and tests together.

## Timeout Recommendation

Prefer task-level timeouts first. Collections should usually rely on children to
timeout instead of computing aggregate deadlines. That keeps collection semantics
simple and avoids surprising timeout math for dynamic queues.

Recommended default: `30_000` ms. It is long enough for normal async work but
short enough to catch forgotten callbacks in development and CI.

Suggested future API:

```ts
task.run(callback, { timeoutMs: 5_000 });
```

If collection-level timeouts are later needed, treat them as an optional overall
deadline rather than deriving them from child timeouts.

## Coverage Guidance

Use coverage as the guardrail instead of expanding this into a giant matrix. The
coverage script includes all of `src`, so demo/entrypoint files can lower the
headline number even when the implementation contract is well covered. Good
future tests would be for new policies such as cancellation, timeout, retry, or a
stable error aggregation shape.

# Task Runner Contract Test Matrix

This document models the task runner as a black-box system. The public boundary
is the task/collection API, but the behavior under test includes task
normalization, scheduling, sequential draining, parallel draining, nesting, and
error propagation.

## Source-Derived Dimensions

These dimensions come directly from `src/Task.ts` and `src/TaskCollection.ts`.

| Dimension                 | Values                                                      | Source                                             |
| ------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Runnable shape            | `Task`, `TaskCollection`                                    | `TaskInterface.run`, `TaskCollection extends Task` |
| Collection type           | `SequentialTasks`, `ParallelTasks`                          | concrete `drain` implementations                   |
| Add input                 | existing `Task`, `TaskFn`                                   | `TaskCollection.add` overloads                     |
| Initial child count       | `0`, `1`, `2+`                                              | `tasks?: Iterable<Task>`, `add`                    |
| Task scheduling           | `sync`, `nextTick`, `setTimeout`, `setImmediate`            | `Task.SCHEDULING`                                  |
| Task function shape       | no callback, callback                                       | `TaskFn`, `fn.length` normalization                |
| Completion timing         | immediate, deferred                                         | direct `next()`, timer callback                    |
| Outcome                   | success, callback error, thrown error                       | `done(error)`, `try/catch`                         |
| Status transition         | idle to running to completed/failed; non-idle rerun         | `enforceStatus`, `done`                            |
| Sequential failure policy | stop on first error                                         | `SequentialTasks.drain`                            |
| Parallel failure policy   | start idle children, wait for all settled, aggregate errors | `ParallelTasks.drain`                              |
| Nesting shape             | leaf task, sequential collection, parallel collection       | collections are runnable tasks                     |

## State Space

Naive Cartesian coverage is too large and partly infinite because collections can
nest recursively:

```txt
task styles        ~= 6  (sync no-callback, sync callback, async callback,
                          callback error, thrown error, never-callback)
scheduling modes   = 4
collection modes   = 2
child counts       ~= 3  (0, 1, 2+)
nested child types = 3  (task, sequential, parallel)
error positions    ~= 4  (none, first, middle, last)
depth              = unbounded
```

Even with depth capped at 2, this is hundreds of combinations. The useful test
strategy is:

1. Use equivalence partitions for task style, collection mode, child count, and
   outcome.
2. Use pairwise-style coverage so every important pair appears together at
   least once.
3. Add explicit high-risk interaction cases for nested error propagation.
4. Keep a small number of property/invariant tests for status and callback
   behavior.

## Core Invariants

These are the rules every implementation should preserve.

| ID  | Invariant                                                                                     |
| --- | --------------------------------------------------------------------------------------------- |
| I01 | A task starts at most once during one successful run.                                         |
| I02 | A task records exactly one terminal transition: completed or failed.                          |
| I03 | A no-callback task completes automatically after returning.                                   |
| I04 | A thrown task fails and reports the thrown error.                                             |
| I05 | A callback task may complete synchronously or asynchronously.                                 |
| I06 | A callback invoked more than once only completes the task once.                               |
| I07 | A task that never calls its callback leaves the run pending unless a test timeout intervenes. |
| I08 | Sequential collections do not start child `n + 1` until child `n` has settled successfully.   |
| I09 | Sequential collections stop after the first child error.                                      |
| I10 | Parallel collections start all idle children before waiting for completion.                   |
| I11 | Parallel collections wait for all started children to settle.                                 |
| I12 | Parallel collections report errors after all started children settle.                         |
| I13 | A nested collection behaves like a task at its parent boundary.                               |
| I14 | Nested collection success lets the parent continue according to parent semantics.             |
| I15 | Nested collection failure propagates to the parent according to parent semantics.             |
| I16 | Scheduler choice does not change sequential ordering.                                         |
| I17 | Calling `run` on a non-idle task reports a status error.                                      |

## Curated Contract Cases

The matrix below is the recommended bounded case set. It is deliberately not a
full Cartesian product; it covers all core dimensions and high-risk interactions
with a small suite.

| ID  | Case                                              | Shape                                              | Outcome                            | Primary invariants                   | Current coverage         |
| --- | ------------------------------------------------- | -------------------------------------------------- | ---------------------------------- | ------------------------------------ | ------------------------ |
| C01 | Empty sequential collection completes             | `Seq()`                                            | success                            | I08, I14                             | Covered                  |
| C02 | Empty parallel collection completes               | `Par()`                                            | success                            | I10, I11                             | Covered                  |
| C03 | Single task as collection child                   | `Seq(task)` and/or `Par(task)`                     | success                            | I03, I05, I13                        | Covered                  |
| C04 | Add raw task function                             | `Seq(fn)`                                          | success                            | add overload, I03                    | Covered                  |
| C05 | Add existing task instance                        | `Seq(Task)`                                        | success                            | add overload, I13                    | Covered                  |
| C06 | Mixed sequential task styles                      | `Seq(sync no-cb, sync cb, async cb)`               | success                            | I03, I05, I08                        | Covered                  |
| C07 | Parallel async timing                             | `Par(slow, fast, middle)`                          | success                            | I10, I11                             | Covered                  |
| C08 | Scheduler variants in sequence                    | `Seq(nextTick, setImmediate, setTimeout)`          | success                            | I16                                  | Covered                  |
| C09 | Synchronous throw                                 | `Task(throw)` or `Seq(throw)`                      | failure                            | I04, I09                             | Covered at task level    |
| C10 | Callback error                                    | `Seq(success, fail, after)`                        | failure                            | I09, I15                             | Covered                  |
| C11 | Parallel single failure                           | `Par(fail, slow success)`                          | failure                            | I11, I12                             | Covered                  |
| C12 | Parallel multiple failures                        | `Par(fail A, fail B, success)`                     | failure                            | I11, I12, aggregation                | Covered                  |
| C13 | Sequential success with nested parallel           | `Seq(before, Par(slow, fast), after)`              | success                            | I08, I10, I13, I14                   | Covered                  |
| C14 | Sequential failure from nested parallel           | `Seq(before, Par(fail, slow), after)`              | failure                            | I09, I11, I12, I15                   | Covered                  |
| C15 | Parallel success with nested sequentials          | `Par(Seq(left1, left2), Seq(right1, right2))`      | success                            | I08, I10, I13, I14                   | Covered                  |
| C16 | Parallel failure from nested sequential           | `Par(Seq(fail, skipped), Seq(slow, after))`        | failure                            | I09, I11, I12, I15                   | Covered                  |
| C17 | Sequential success with nested sequential         | `Seq(before, Seq(child1, child2), after)`          | success                            | I08, I13, I14                        | Covered                  |
| C18 | Sequential failure from nested sequential         | `Seq(before, Seq(fail, skipped), after)`           | failure                            | I09, I13, I15                        | Covered                  |
| C19 | Parallel success with nested parallel             | `Par(Par(a, b), Par(c, d))`                        | success                            | I10, I11, I13, I14                   | Covered                  |
| C20 | Parallel failure from nested parallel             | `Par(Par(fail, slow), Par(success))`               | failure                            | I10, I11, I12, I15                   | Covered                  |
| C21 | Depth-three success chain                         | `Seq(Par(Seq(a, b), async), after)`                | success                            | I08, I10, I13, I14                   | Covered                  |
| C22 | Depth-three failure chain                         | `Par(Seq(Par(fail, slow), skipped), slow sibling)` | failure                            | I09, I11, I12, I15                   | Covered                  |
| C23 | Double callback is ignored after first completion | `Task(next(); next(error))`                        | success or first result wins       | I06                                  | Covered by task contract |
| C24 | Never-callback task leaves run pending            | `Task((_next) => {})`                              | timeout                            | I07                                  | Covered by task contract |
| C25 | Rerun completed task reports status error         | `task.run(); task.run()`                           | failure on second run              | Covered by task contract             |
| C26 | Constructor iterable children                     | `new Seq(name, [taskA, taskB])`                    | success                            | constructor path, I08                | Covered                  |
| C27 | Add during sequential run                         | task appends another task while running            | success                            | dynamic queue note in implementation | Covered                  |
| C28 | Add during parallel run                           | task appends another task while running            | appended task runs in active drain | Covered                              |

## Pairwise Coverage Summary

Current contract tests cover the highest-risk pairs:

| Pair                                         | Covered by    |
| -------------------------------------------- | ------------- |
| Sequential x mixed task styles               | C06           |
| Parallel x async timing                      | C07           |
| Sequential parent x parallel child x success | C13           |
| Sequential parent x parallel child x failure | C14           |
| Parallel parent x sequential child x success | C15           |
| Parallel parent x sequential child x failure | C16           |
| Sequential x scheduling mode                 | C08           |
| Sequential x callback error                  | C10           |
| Parallel x callback error                    | C11           |
| Single task x task styles                    | C06, C09, C23 |
| Single task x scheduling mode                | C08           |
| Single task x rerun status                   | C25           |

The curated matrix is fully covered by `test/task.contract.test.ts` and
`test/task-runner.contract.test.ts`.

## Suggested Next Test Additions

Future additions should be new contract decisions rather than matrix catch-up.
Good candidates:

1. More precise assertions for parallel error aggregation shape and keys.
2. A cancellation or timeout policy, if the runner grows one.
3. A documented policy for whether add-during-parallel-run should remain live or
   switch to snapshot semantics.

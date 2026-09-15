import { CleanupFailedError } from "./Error";
import { isThenable } from "./Util";

/**
 * Whether the block a {@link Cleanup} settles against succeeded.
 *
 * Handed to the cleanup so teardown can observe pass or fail without the
 * thenable-guarding that writing it by hand would otherwise require.
 */
export type Outcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: unknown };

/**
 * Teardown for one open extension scope, carried on the `Session` that
 * scope yielded — which is what gives it lexical access to whatever the scope
 * established, with no mutable variable in between.
 *
 * May be async; a thenable is settled before the value reaches the caller, so an
 * outer scope's cleanup runs only once an inner one has finished.
 */
export type Cleanup = (outcome: Outcome) => void | PromiseLike<void>;

/**
 * Collected cleanup errors, reported once.
 *
 * Logged always and thrown only when the block itself succeeded: a failing
 * block's own error is the one worth reading, and must reach the reporter
 * untouched rather than being displaced by a teardown fault.
 */
const report = (errors: readonly unknown[], outcome: Outcome): void => {
  if (errors.length === 0) return;

  const failure = new CleanupFailedError(errors);

  console.error(failure);

  if (outcome.ok) throw failure;
};

/**
 * Settle one extension's `cleanup` against `block`, *inside* that extension's
 * own open scope.
 *
 * Where it runs is what lets teardown reach what the scope established; a
 * continuation chained outside every scope would find an `AsyncLocalStorage`
 * frame already gone. Where its error is *collected* is a separate question, and
 * the answer is `errors` — one list owned by the composed scope, so several
 * extensions' failures still report as a single `CleanupFailedError` rather
 * than one at a time.
 *
 * Ordering needs no coordination: each scope encloses the next, so an inner
 * cleanup has settled by the time an outer one is reached, and an outer cleanup
 * waits on an inner *async* one.
 *
 * `aggregates` marks the outermost cleanup-bearing scope, whose settlement is
 * therefore the last — the only point at which `errors` is final. Nothing else
 * intercepts, so an instance whose extensions declare no cleanup keeps a
 * synchronous throw reporting at the user's own line.
 */
export const withCleanup = <$Return>(
  block: () => $Return,
  cleanup: Cleanup,
  errors: unknown[],
  aggregates: boolean,
): $Return => {
  const settle = <$Value>(
    outcome: Outcome,
    done: () => $Value,
  ): $Value | PromiseLike<$Value> => {
    const finish = (): $Value => {
      if (aggregates) report(errors, outcome);
      return done();
    };

    const failed = (error: unknown): $Value => {
      errors.push(error);
      return finish();
    };

    let settled: void | PromiseLike<void>;

    try {
      settled = cleanup(outcome);
    } catch (error) {
      return failed(error);
    }

    return isThenable(settled) ? settled.then(finish, failed) : finish();
  };

  let result: $Return;

  try {
    result = block();
  } catch (error) {
    return settle({ ok: false, error }, (): never => {
      throw error;
    }) as $Return;
  }

  if (!isThenable(result)) {
    return settle({ ok: true }, () => result) as $Return;
  }

  return (result as PromiseLike<unknown>).then(
    (value) => settle({ ok: true }, () => value as $Return),
    (error: unknown) =>
      settle({ ok: false, error }, (): never => {
        throw error;
      }),
  ) as $Return;
};

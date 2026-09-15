import type { Config } from "../Config";
import type { Context } from "../Context";
import { UnusedMocksError } from "../Error";
import type { TypeLambda } from "../Extension";
import { mocking, type Mocker } from "../Mocking";
import type { IdentityMap, Spy } from "../Spy";
import { never } from "../Types";
import { isThenable } from "../Util";

export type Testing<$Lambda extends TypeLambda = never> = <$Return>(
  fn: (mocker: Mocker<$Lambda>) => $Return,
) => $Return;

/**
 * Deliberately no `try`/`catch` around the body. A synchronous throw reports
 * at the user's own line on bun — the same property harness works to preserve.
 * The unused-mock check is skipped when the body throws (the throw happens
 * first), which matches the previous `await` path.
 */
export const testing =
  (config: Config): Testing<TypeLambda> =>
  <$Return>(fn: (mocker: Mocker<TypeLambda>) => $Return): $Return => {
    const { mock, spies } = mocking();
    const context: Context = { spies, productions: new Map() };

    const run = () => config.scope.run(context, () => fn(mock));

    /**
     * Skipped entirely when no extension was configured, so a suite that
     * never wires one up never enters an extension's scope — and can never be
     * subject to whatever constraints that scope imposes on the block it
     * wraps.
     */
    const result =
      config.extensions.all.length === 0 ?
        run()
      : config.extensions.scope((produce) => {
          /**
           * Assigned *before* `scope.run`, so it is already in place by the
           * time any test code — or a producible block reached from it — can
           * read it.
           */
          context.produce = produce;
          return run();
        });

    if (isThenable(result)) {
      return result.then((value) => {
        disallowUnusedMocks(spies);
        return value;
      }) as $Return;
    }

    disallowUnusedMocks(spies);
    return result;
  };

const disallowUnusedMocks = (spyMap: IdentityMap) => {
  const unused: Array<Spy> = [];

  const check = (spy: Spy) => {
    switch (spy.options.unused) {
      case "allow":
        return;
      case undefined:
      case "error":
        if (spy.executions.length === 0) unused.push(spy);
        return;
      default:
        never(spy.options.unused);
    }
  };

  spyMap.effects.forEach(check);
  spyMap.forEach((spies) => spies.forEach(check));

  if (unused.length > 0) {
    throw new UnusedMocksError(unused);
  }
};

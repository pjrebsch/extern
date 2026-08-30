import type { Config } from "../Config";
import type { Context } from "../Context";
import { UnusedMocksError } from "../Error";
import { OWN_ROOT, type TypeLambda } from "../Extension";
import { mocking, type Mocker } from "../Mocking";
import type { IdentityMap, Spy } from "../Spy";
import { never, type Promisable } from "../Types";

export type Testing<$Lambda extends TypeLambda = never> = (
  fn: (mocker: Mocker<$Lambda>) => Promisable<void>,
) => Promise<void>;

export const testing =
  (config: Config): Testing<TypeLambda> =>
  async (fn: (mocker: Mocker<TypeLambda>) => Promisable<void>) => {
    const { mock, spies } = mocking();
    const context: Context = { spies, productions: new Map() };

    /**
     * Skipped entirely when no extension was configured, so a suite that
     * never wires one up never enters an extension's scope — and can never be
     * subject to whatever constraints that scope imposes on the block it
     * wraps.
     */
    if (config.extensions.all.length === 0) {
      await config.scope.run(context, async () => fn(mock));
    } else {
      await config.extensions.scope({ ignore: [OWN_ROOT] }, async (produce) => {
        /**
         * Assigned *before* `scope.run`, so it is already in place by the
         * time any test code — or a producible block reached from it — can
         * read it.
         */
        context.produce = produce;
        await config.scope.run(context, async () => fn(mock));
      });
    }

    disallowUnusedMocks(spies);
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

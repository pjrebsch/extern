import type { Config } from "../Config";
import { NotMockedError } from "../Error";
import { approximately } from "../Mocking";
import { produce, shouldProduce } from "../Production";
import type { Execution } from "../Spy";
import { type AnyIdentity, type Params } from "../Types";

export const will = <$Out, $In>(
  config: Config,
  identity: AnyIdentity,
  params: Params.ForValue<$In>,
  fn: () => $Out,
): $Out => {
  const context = config.scope.current();

  /**
   * If not in an explicit testing block, simply run the original function.
   */
  if (!context) return fn();

  const spy = context.spies.get(identity)?.find(approximately(params));

  if (!spy) {
    /**
     * No stack captured and no scope opened here — both already sit on
     * `context` (set up once per testing block in `testing/index.ts`), so
     * this costs one `Map` lookup beyond the mocked path.
     */
    if (shouldProduce(config, identity)) {
      return produce(context, identity, params.named) as $Out;
    }

    throw new NotMockedError();
  }

  const record = (outcome: Execution.Outcome): void => {
    spy.executions.push({ ...params, mode: "typed", outcome });
  };

  const dispatch = (): $Out => {
    switch (spy.strategy.kind) {
      case "passthrough": {
        return fn();
      }
      case "substitute": {
        return spy.strategy.value as $Out;
      }
      /**
       * What `produce()` installs: produce exactly as the unmocked branch
       * above would. Routed through the same helper, so a `produce()`d block
       * and an unmocked one yield the identical value — and, with a callback,
       * the same value shaped by it.
       */
      case "produce": {
        return produce(
          context,
          identity,
          params.named,
          spy.strategy.using,
        ) as $Out;
      }
    }
  };

  /**
   * Recorded on both paths out of the block, rather than on entry: that is
   * what lets `outcome` be unconditionally present while still counting a
   * throwing block as used. `disallowUnusedMocks` reads `executions.length`,
   * so recording only successes would report a `skip()`ped block whose
   * original function threw — a block that plainly ran — as an unused mock.
   *
   * The error is rethrown unchanged: same object, same stack. Recording is
   * observational only, and never alters what a caller sees. Only the
   * strategy dispatch is guarded, so a fault in extern's own bookkeeping
   * cannot be misrecorded as the block's outcome.
   */
  try {
    const value = dispatch();
    record({ kind: "returned", value });
    return value;
  } catch (error) {
    record({ kind: "threw", error });
    throw error;
  }
};

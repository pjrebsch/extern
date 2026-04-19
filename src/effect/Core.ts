import type { $$Config } from "../Config";
import { type $$Params, type Promisable } from "../Types";

export const $will = <$Out extends Promisable<void>, $In>(
  config: $$Config,
  params: Partial<$$Params.$$ForEffect<$In>>,
  fn: () => $Out,
): $Out => {
  const context = config.scope.current();

  /**
   * If not in an explicit testing block, simply run the original function.
   */
  if (!context) return fn();

  /**
   * If the source code block does not name this, then don't make it
   * available to spy on in tests.
   */
  if (typeof params.named !== "string") return Promise.resolve() as $Out;

  const spy = context.spies.effects.get(params.named);

  if (!spy) return Promise.resolve() as $Out;

  spy.executions.push({ ...params, mode: "effect" });

  switch (spy.strategy.kind) {
    case "passthrough": {
      return fn();
    }
    case "observe": {
      return Promise.resolve() as $Out;
    }
  }
};

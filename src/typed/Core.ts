import type { $$Config } from "../Config";
import { NotMockedError } from "../Error";
import { approximately } from "../Mocking";
import { type $$Identity, type $$Params } from "../Types";

export const $will = <$Out, $In>(
  config: $$Config,
  identity: $$Identity,
  params: $$Params.$$ForValue<$In>,
  fn: () => $Out,
): $Out => {
  const context = config.scope.current();

  /**
   * If not in an explicit testing block, simply run the original function.
   */
  if (!context) return fn();

  const spy = context.spies.get(identity)?.find(approximately(params));

  if (!spy) throw new NotMockedError();

  spy.executions.push({ ...params, mode: "typed" });

  switch (spy.strategy.kind) {
    case "passthrough": {
      return fn();
    }
    case "substitute": {
      return spy.strategy.value as $Out;
    }
  }
};

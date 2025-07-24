import type { $$Config } from "../Config";
import { NotMockedError } from "../Error";
import { approximately } from "../Mocking";
import type { StandardSchemaV1 } from "../StandardSchema";
import type { $$Params } from "../Types";

export const $will = <$Out, $In>(
  config: $$Config,
  schema: StandardSchemaV1<unknown>,
  params: $$Params<$In>,
  fn: () => $Out,
): $Out => {
  const context = config.scope.current();

  /**
   * If not in an explicit testing block, simply run the original function.
   */
  if (!context) return fn();

  const spy = context.spies.get(schema)?.find(approximately(params));

  if (!spy) throw new NotMockedError();

  spy.executions.push({ ...params, mode: "typed" });

  return spy.value as $Out;
};

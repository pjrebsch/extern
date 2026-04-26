import type { $$Config } from "../Config";
import { InvalidDataTypeError, NotMockedError } from "../Error";
import { approximately } from "../Mocking";
import type { StandardSchemaV1 } from "../StandardSchema";
import type { $$Params } from "../Types";

export const $will = async <$Out, $In>(
  config: $$Config,
  schema: StandardSchemaV1<$Out>,
  params: $$Params.$$ForValue<$In>,
  fn: () => Promise<$Out>,
): Promise<$Out> => {
  const context = config.scope.current();

  /**
   * If not in an explicit testing block, run the original function and
   * validate the result.
   */
  if (!context) {
    const result = await schema["~standard"].validate(await fn());
    if (result.issues) throw new InvalidDataTypeError(schema, result.issues);
    return result.value;
  }

  const spy = context.spies.get(schema)?.find(approximately(params));

  if (!spy) throw new NotMockedError();

  spy.executions.push({ ...params, mode: "validated" });

  switch (spy.strategy.kind) {
    case "passthrough": {
      return fn();
    }
    case "substitute": {
      return spy.strategy.value as $Out;
    }
  }
};

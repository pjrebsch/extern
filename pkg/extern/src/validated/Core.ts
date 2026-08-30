import type { Config } from "../Config";
import { InvalidDataTypeError, NotMockedError } from "../Error";
import { approximately } from "../Mocking";
import { produce } from "../Production";
import type { Execution } from "../Spy";
import type { StandardSchemaV1 } from "../StandardSchema";
import type { Params } from "../Types";

export const will = async <$Out, $In>(
  config: Config,
  schema: StandardSchemaV1<$Out>,
  params: Params.ForValue<$In>,
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

  /**
   * No implicit-production branch here, unlike `typed`: a `validated` block's
   * identity is a Standard Schema, which no extension lambda can widen this
   * signature to accept. A `produce()` mock is still reachable through a
   * plain JavaScript caller, so the strategy is still dispatched below.
   */
  if (!spy) throw new NotMockedError();

  const record = (outcome: Execution.Outcome): void => {
    spy.executions.push({ ...params, mode: "validated", outcome });
  };

  const dispatch = async (): Promise<$Out> => {
    switch (spy.strategy.kind) {
      case "passthrough": {
        return fn();
      }
      case "substitute": {
        return spy.strategy.value as $Out;
      }
      case "produce": {
        return produce(
          context,
          schema,
          params.named,
          spy.strategy.using,
        ) as $Out;
      }
    }
  };

  /**
   * `await`ed inside the `try`, not returned from it: a rejected promise
   * returned unawaited would settle after this frame has exited, and the
   * rejection would be recorded as a `"returned"` promise rather than as
   * `"threw"`. See `typed/Core.ts` for why both paths record.
   */
  try {
    const value = await dispatch();
    record({ kind: "returned", value });
    return value;
  } catch (error) {
    record({ kind: "threw", error });
    throw error;
  }
};

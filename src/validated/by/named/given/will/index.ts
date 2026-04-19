import type { $$Config } from "../../../../../Config";
import type { StandardSchemaV1 } from "../../../../../StandardSchema";
import type { $$Disambiguation, Promisable } from "../../../../../Types";
import { $will } from "../../../../Core";

export type $$will<$Out, $In> = (
  fn: (given: $In) => Promisable<$Out>,
) => Promise<$Out>;

export const $$will =
  <$Out, $In>(
    config: $$Config,
    schema: StandardSchemaV1<$Out>,
    given: $In,
    disamb: $$Disambiguation.$$ForValue,
  ): $$will<$Out, $In> =>
  async (fn: (given: $In) => Promisable<$Out>): Promise<$Out> => {
    return $will<$Out, $In>(config, schema, { ...disamb, given }, async () =>
      fn(given),
    );
  };

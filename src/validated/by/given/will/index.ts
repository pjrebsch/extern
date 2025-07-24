import type { $$Config } from "../../../../Config";
import type { StandardSchemaV1 } from "../../../../StandardSchema";
import type { Promisable } from "../../../../Types";
import { $will } from "../../../Will";

export type $$will<$Out, $In> = (
  fn: (given: $In) => Promisable<$Out>,
) => Promise<$Out>;

export const $$will =
  <$Out, $In>(
    config: $$Config,
    schema: StandardSchemaV1<$Out>,
    given: $In,
  ): $$will<$Out, $In> =>
  async (fn: (given: $In) => Promisable<$Out>): Promise<$Out> => {
    return $will<$Out, $In>(config, schema, { given }, async () => fn(given));
  };

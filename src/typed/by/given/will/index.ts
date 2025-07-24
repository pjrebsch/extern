import type { $$Config } from "../../../../Config";
import type { StandardSchemaV1 } from "../../../../StandardSchema";
import type { Promisable } from "../../../../Types";
import { $will } from "../../../Will";

export type $$will<$Out, $In> = <$O extends Promisable<$Out>>(
  fn: (given: $In) => $O,
) => $O;

export const $$will =
  <$Out, $In>(
    config: $$Config,
    schema: StandardSchemaV1<$Out>,
    given: $In,
  ): $$will<$Out, $In> =>
  <$O extends Promisable<$Out>>(fn: (given: $In) => $O): $O => {
    return $will<$O, $In>(config, schema, { given }, () => fn(given));
  };

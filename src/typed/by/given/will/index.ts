import type { $$Config } from "../../../../Config";
import type { StandardSchemaV1 } from "../../../../StandardSchema";
import type { Promisable, Promised } from "../../../../Types";
import { $will } from "../../../Will";

export type $$will<$Out, $In> = <$O extends Promisable<$Out>>(
  fn: (given: $In) => $O,
) => Promised<$Out, $O>;

export const $$will =
  <$Out, $In>(
    config: $$Config,
    schema: StandardSchemaV1<$Out>,
    given: $In,
  ): $$will<$Out, $In> =>
  <$O extends Promisable<$Out>>(fn: (given: $In) => $O): Promised<$Out, $O> => {
    return $will<$O, $In>(config, schema, { given }, () =>
      fn(given),
    ) as Promised<$Out, $O>;
  };

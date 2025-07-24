import type { $$Config } from "../../../../Config";
import type { StandardSchemaV1 } from "../../../../StandardSchema";
import type { $$Name } from "../../../../Types";
import { $$will } from "./will";

export interface $$Given<$Out, $Name extends $$Name, $In> {
  name: $Name;
  will: $$will<$Out, $In>;
}

export type $$given<$Out, $Name extends $$Name> = <const $In>(
  given: $In,
) => $$Given<$Out, $Name, $In>;

export const $$given =
  <$Out, $Name extends $$Name>(
    config: $$Config,
    schema: StandardSchemaV1<$Out>,
    name: $Name,
  ): $$given<$Out, $Name> =>
  <const $In>(given: $In): $$Given<$Out, $Name, $In> => ({
    name,
    will: $$will<$Out, $In>(config, schema, given, { named: name }),
  });

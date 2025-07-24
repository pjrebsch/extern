import type { $$Config } from "../../../Config";
import type { StandardSchemaV1 } from "../../../StandardSchema";
import type { $$Name } from "../../../Types";
import { $$given } from "./given";
import { $$will } from "./will";

export interface $$Named<$Out, $Name extends $$Name> {
  name: $Name;
  given: $$given<$Out, $Name>;
  will: $$will<$Out>;
}

export type $$named<$Out> = <$Name extends $$Name>(
  name: $Name,
) => $$Named<$Out, $Name>;

export const $$named =
  <$Out>(config: $$Config, schema: StandardSchemaV1<$Out>): $$named<$Out> =>
  <$Name extends $$Name>(name: $Name): $$Named<$Out, $Name> => ({
    name,
    given: $$given<$Out, $Name>(config, schema, name),
    will: $$will<$Out>(config, schema, { named: name }),
  });

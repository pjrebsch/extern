import type { $$Config } from "../../Config";
import type { StandardSchemaV1 } from "../../StandardSchema";
import { $$given } from "./given";
import { $$named } from "./named";
import { $$will } from "./will";

export interface $$By<$Out> {
  named: $$named<$Out>;
  given: $$given<$Out>;
  will: $$will<$Out>;
}

export const $$by =
  (config: $$Config) =>
  <$Out>(schema: StandardSchemaV1<$Out>): $$By<$Out> => ({
    named: $$named<$Out>(config, schema),
    given: $$given<$Out>(config, schema),
    will: $$will<$Out>(config, schema),
  });

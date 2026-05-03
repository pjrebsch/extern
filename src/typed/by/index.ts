import type { $$Config } from "../../Config";
import type { $$Identity } from "../../Types";
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
  <$Out>(identity: $$Identity<$Out>): $$By<$Out> => ({
    named: $$named<$Out>(config, identity),
    given: $$given<$Out>(config, identity),
    will: $$will<$Out>(config, identity),
  });

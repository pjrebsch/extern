import type { $$Config } from "../../../Config";
import type { $$Identity, $$Name } from "../../../Types";
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
  <$Out>(config: $$Config, identity: $$Identity<$Out>): $$named<$Out> =>
  <$Name extends $$Name>(name: $Name): $$Named<$Out, $Name> => ({
    name,
    given: $$given<$Out, $Name>(config, identity, name),
    will: $$will<$Out>(config, identity, { named: name }),
  });

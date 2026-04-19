import type { $$Config } from "../../Config";
import type { $$Name } from "../../Types";
import { $$given } from "./given";
import { $$will } from "./will";

export interface $$Named<$Name extends $$Name> {
  name: $Name;
  given: $$given<$Name>;
  will: $$will;
}

export type $$named = <$Name extends $$Name>(name: $Name) => $$Named<$Name>;

export const $$named =
  (config: $$Config): $$named =>
  <$Name extends $$Name>(name: $Name): $$Named<$Name> => ({
    name,
    given: $$given<$Name>(config, name),
    will: $$will(config, { named: name }),
  });

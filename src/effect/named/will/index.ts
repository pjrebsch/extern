import type { $$Config } from "../../../Config";
import type { $$Disambiguation, Promisable } from "../../../Types";
import { $will } from "../../Core";

export type $$will = <$O extends Promisable<void>>(fn: () => $O) => $O;

export const $$will =
  (config: $$Config, disamb: $$Disambiguation.$$ForEffect): $$will =>
  <$O extends Promisable<void>>(fn: () => $O): $O => {
    return $will<$O, never>(config, disamb, () => fn());
  };

import type { $$Config } from "../../Config";
import type { Promisable } from "../../Types";
import { $will } from "../Core";

export type $$will = <$O extends Promisable<void>>(fn: () => $O) => $O;

export const $$will =
  (config: $$Config): $$will =>
  <$O extends Promisable<void>>(fn: () => $O): $O => {
    return $will<$O, never>(config, {}, () => fn());
  };

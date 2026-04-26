import type { $$Config } from "../../../../Config";
import type { $$Disambiguation, Promisable } from "../../../../Types";
import { $will } from "../../../Core";

export type $$will<$In> = <$Out extends Promisable<void>>(
  fn: (given: $In) => $Out,
) => $Out;

export const $$will =
  <$In>(
    config: $$Config,
    given: $In,
    disamb: $$Disambiguation.$$ForEffect,
  ): $$will<$In> =>
  <$Out extends Promisable<void>>(fn: (given: $In) => $Out): $Out => {
    return $will<$Out, $In>(config, { ...disamb, given }, () => fn(given));
  };

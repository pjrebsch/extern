import type { $$Config } from "../../../Config";
import type { $$Identity } from "../../../Types";
import { $$will } from "./will";

export interface $$Given<$Out, $In> {
  will: $$will<$Out, $In>;
}

export type $$given<$Out> = <const $In>(given: $In) => $$Given<$Out, $In>;

export const $$given =
  <$Out>(config: $$Config, identity: $$Identity<$Out>): $$given<$Out> =>
  <const $In>(given: $In): $$Given<$Out, $In> => ({
    will: $$will<$Out, $In>(config, identity, given),
  });

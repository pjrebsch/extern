import type { $$Config } from "../../../../Config";
import type { $$Identity, $$Name } from "../../../../Types";
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
    identity: $$Identity<$Out>,
    name: $Name,
  ): $$given<$Out, $Name> =>
  <const $In>(given: $In): $$Given<$Out, $Name, $In> => ({
    name,
    will: $$will<$Out, $In>(config, identity, given),
  });

import type { $$Config } from "../../../../../Config";
import type { $$Identity, Promisable, Promised } from "../../../../../Types";
import { $will } from "../../../../Core";

export type $$will<$Out, $In> = <$O extends Promisable<$Out>>(
  fn: (given: $In) => $O,
) => Promised<$Out, $O>;

export const $$will =
  <$Out, $In>(
    config: $$Config,
    identity: $$Identity<$Out>,
    given: $In,
  ): $$will<$Out, $In> =>
  <$O extends Promisable<$Out>>(fn: (given: $In) => $O): Promised<$Out, $O> => {
    return $will<$O, $In>(config, identity, { given }, () =>
      fn(given),
    ) as Promised<$Out, $O>;
  };

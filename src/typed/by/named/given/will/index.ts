import type { Config } from "../../../../../Config";
import type {
  Disambiguation,
  Identity,
  Promisable,
  Promised,
} from "../../../../../Types";
import { will as $will } from "../../../../Core";

export type will<$Out, $In> = <$O extends Promisable<$Out>>(
  fn: (given: $In) => $O,
) => Promised<$Out, $O>;

export const will =
  <$Out, $In>(
    config: Config,
    identity: Identity<$Out>,
    given: $In,
    disamb: Disambiguation.ForValue,
  ): will<$Out, $In> =>
  <$O extends Promisable<$Out>>(fn: (given: $In) => $O): Promised<$Out, $O> => {
    return $will<$O, $In>(config, identity, { ...disamb, given }, () =>
      fn(given),
    ) as Promised<$Out, $O>;
  };

import type { $$Config } from "../../../../Config";
import type {
  $$Disambiguation,
  $$Identity,
  Promisable,
  Promised,
} from "../../../../Types";
import { $will } from "../../../Core";

export type $$will<$Out> = <$O extends Promisable<$Out>>(
  fn: () => $O,
) => Promised<$Out, $O>;

export const $$will =
  <$Out>(
    config: $$Config,
    identity: $$Identity<$Out>,
    disamb: $$Disambiguation.$$ForValue,
  ): $$will<$Out> =>
  <$O extends Promisable<$Out>>(fn: () => $O): Promised<$Out, $O> => {
    return $will<$O, never>(config, identity, disamb, () => fn()) as Promised<
      $Out,
      $O
    >;
  };

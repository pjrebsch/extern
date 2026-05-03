import type { $$Config } from "../../../Config";
import type { $$Identity, Promisable, Promised } from "../../../Types";
import { $will } from "../../Core";

export type $$will<$Out> = <$O extends Promisable<$Out>>(
  fn: () => $O,
) => Promised<$Out, $O>;

export const $$will =
  <$Out>(config: $$Config, identity: $$Identity<$Out>): $$will<$Out> =>
  <$O extends Promisable<$Out>>(fn: () => $O): Promised<$Out, $O> => {
    return $will<$O, never>(config, identity, {}, () => fn()) as Promised<
      $Out,
      $O
    >;
  };

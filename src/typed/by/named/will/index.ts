import type { $$Config } from "../../../../Config";
import type { StandardSchemaV1 } from "../../../../StandardSchema";
import type { $$Disambiguation, Promisable, Promised } from "../../../../Types";
import { $will } from "../../../Core";

export type $$will<$Out> = <$O extends Promisable<$Out>>(
  fn: () => $O,
) => Promised<$Out, $O>;

export const $$will =
  <$Out>(
    config: $$Config,
    schema: StandardSchemaV1<$Out>,
    disamb: $$Disambiguation.$$ForValue,
  ): $$will<$Out> =>
  <$O extends Promisable<$Out>>(fn: () => $O): Promised<$Out, $O> => {
    return $will<$O, never>(config, schema, disamb, () => fn()) as Promised<
      $Out,
      $O
    >;
  };

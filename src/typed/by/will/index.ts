import type { $$Config } from "../../../Config";
import type { StandardSchemaV1 } from "../../../StandardSchema";
import type { Promisable, Promised } from "../../../Types";
import { $will } from "../../Will";

export type $$will<$Out> = <$O extends Promisable<$Out>>(
  fn: () => $O,
) => Promised<$Out, $O>;

export const $$will =
  <$Out>(config: $$Config, schema: StandardSchemaV1<$Out>): $$will<$Out> =>
  <$O extends Promisable<$Out>>(fn: () => $O): Promised<$Out, $O> => {
    return $will<$O, never>(config, schema, {}, () => fn()) as Promised<
      $Out,
      $O
    >;
  };

import type { $$Config } from "../../../../Config";
import type { StandardSchemaV1 } from "../../../../StandardSchema";
import type { $$Disambiguation, Promisable } from "../../../../Types";
import { $will } from "../../../Will";

export type $$will<$Out> = <$O extends Promisable<$Out>>(fn: () => $O) => $O;

export const $$will =
  <$Out>(
    config: $$Config,
    schema: StandardSchemaV1<$Out>,
    disamb: $$Disambiguation,
  ): $$will<$Out> =>
  <$O extends Promisable<$Out>>(fn: () => $O): $O => {
    return $will<$O, never>(config, schema, disamb, () => fn());
  };

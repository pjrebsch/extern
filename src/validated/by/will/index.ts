import type { $$Config } from "../../../Config";
import type { StandardSchemaV1 } from "../../../StandardSchema";
import type { $$Disambiguation, Promisable } from "../../../Types";
import { $will } from "../../Will";

export type $$will<$Out> = (fn: () => Promisable<$Out>) => Promise<$Out>;

export const $$will =
  <$Out>(
    config: $$Config,
    schema: StandardSchemaV1<$Out>,
    disamb: $$Disambiguation,
  ): $$will<$Out> =>
  async (fn: () => Promisable<$Out>): Promise<$Out> => {
    return $will<$Out, never>(config, schema, disamb, async () => fn());
  };

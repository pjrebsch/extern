import type { $$Config } from "../Config";
import type { StandardSchemaV1 } from "../StandardSchema";
import { $$by, type $$By } from "./by";

export interface $$Typed {
  by: <$Out>(schema: StandardSchemaV1<$Out>) => $$By<$Out>;
}

export const $$typed = (config: $$Config): $$Typed => ({ by: $$by(config) });

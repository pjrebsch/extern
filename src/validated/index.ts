import type { $$Config } from "../Config";
import type { StandardSchemaV1 } from "../StandardSchema";
import { $$by, type $$By } from "./by";

export interface $$Validated {
  by: <$Out>(schema: StandardSchemaV1<$Out>) => $$By<$Out>;
}

export const $$validated = ($config: $$Config): $$Validated => ({
  by: $$by($config),
});

import type { $$Config } from "../Config";
import type { $$Identity } from "../Types";
import { $$by, type $$By } from "./by";

export interface $$Typed {
  by: <$Out>(identity: $$Identity<$Out>) => $$By<$Out>;
}

export const $$typed = (config: $$Config): $$Typed => ({ by: $$by(config) });

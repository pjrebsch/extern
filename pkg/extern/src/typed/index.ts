import type { Config } from "../Config";
import type { TypeLambda } from "../Extension";
import type { Identity } from "../Types";
import { by, type By } from "./by";

/**
 * `$Lambda` carries this instance's extensions, widening what `by()` accepts
 * as an identity — see {@link Identity}.
 */
export interface Typed<$Lambda extends TypeLambda = never> {
  by: <$Out>(identity: Identity<$Out, $Lambda>) => By<$Out>;
}

export const typed = (config: Config): Typed<TypeLambda> => ({
  by: by(config),
});

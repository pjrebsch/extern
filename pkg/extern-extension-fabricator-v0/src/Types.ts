import type { HandleLambda, TypeLambda } from "@ghostry/extern";
import type {
  AsFabricator,
  Kind,
  Meta,
  NaiveFabricator,
  Produces,
} from "@ghostry/fabricator/internal";

/**
 * A raw fabricator Schema producing `$T`.
 *
 * Keyed on fabricator's own branded symbols rather than on shape. A lambda
 * emitting something as loose as `{ fabricate: () => $T }` would accept any
 * object with a same-named method and silently claim identities that were
 * never fabricator's. So this satisfies the structural-narrowness rule
 * that extern's contract documents for lambda authors.
 */
export type Schema<$T> = {
  readonly [Kind]: unknown;
  readonly [Meta]: unknown;
  readonly [Produces]?: $T;
};

/** A built Fabricator producing `$T` — equally usable as a block identity. */
export type Built<$T> = NaiveFabricator<$T> & {
  readonly [Kind]: unknown;
  readonly [Meta]: unknown;
};

/**
 * What `mock(schema).produce(({ via }) => …)` hands the caller: the built
 * Fabricator for this identity.
 *
 * `AsFabricator` is fabricator's own schema -> Fabricator mapping, so the
 * handle is whatever that kind actually builds to — an object Fabricator
 * whose `fabricate(overrides?)` carries `Override<$Definition>`, an array's,
 * a string's, and so on. Nothing is re-derived here, and it stays correct for
 * free as fabricator's own API grows.
 */
export type HandleFor<$Of> = AsFabricator<$Of>;

/**
 * The type-level function this extension contributes.
 *
 * `In`/`Out` widens `Identity` so a fabricator schema is accepted where a
 * block identity is expected; `Of`/`Handle` says what a `produce()` callback
 * receives for a given one. The two pairs are independent, which is why
 * `HandleLambda` is a separate interface to extend rather than more slots on
 * `TypeLambda` — see extern's own note there.
 */
export interface FabricatorLambda extends TypeLambda, HandleLambda {
  readonly Out: Schema<this["In"]> | Built<this["In"]>;
  readonly Handle: HandleFor<this["Of"]>;
}

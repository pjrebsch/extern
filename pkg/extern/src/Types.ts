import type { Apply, TypeLambda } from "./Extension";
import type { StandardSchemaV1 } from "./StandardSchema";
import type { T } from "./T";

export type Promisable<$T> = $T | Promise<$T>;

export type Promised<$T, $Promisable extends Promisable<$T>> =
  $Promisable extends Promise<$T> ? Promise<$T> : $T;

export type Name = string;

export type Mode = "typed" | "validated" | "effect";

/**
 * What may be passed to `typed.by()` (and to `mock()` inside a testing
 * block).
 *
 * `$Lambda` is the union of the {@link TypeLambda}s contributed by whichever
 * extensions were passed to this instance's `initialize()` — the canonical
 * meaning of that parameter wherever it appears. It is what widens the
 * accepted set per instance rather than globally. With no extensions
 * `$Lambda` is `never`, `Apply<never, $T>` is `never`, and this collapses to
 * the two built-in members.
 */
export type Identity<$T = unknown, $Lambda extends TypeLambda = never> =
  | StandardSchemaV1<$T>
  | T<$T>
  | Apply<$Lambda, $T>;

/**
 * An identity of any kind, whatever extensions may contribute — `unknown`,
 * since `Apply<TypeLambda, $T>` admits everything.
 *
 * Used where the identity is stored or passed through rather than inspected:
 * the spy store is per-instance but not lambda-aware, and the internal
 * `by()` chain is keyed on the produced type rather than on the identity's
 * kind. The precise, `$Lambda`-aware form lives on the public signatures that
 * callers actually see.
 */
export type AnyIdentity = Identity<unknown, TypeLambda>;

/**
 * Options to control some mocking behaviors.
 */
export interface Options {
  /**
   * Determines if an unused mock in an `extern.testing` block will throw
   * an error or not.
   *
   * Allowing a mocks to go unused can be helpful to make assertions that
   * certain source code paths (extern blocks) did *not* execute.
   *
   * @default "error"
   */
  unused?: "error" | "allow";
}

export namespace Disambiguation {
  type Base = { readonly named: string };

  export type ForValue = Partial<Base>;
  export type ForEffect = Required<Base>;
}

export namespace Params {
  type Base<$In> = { readonly given?: $In };

  export type ForValue<$In> = Base<$In> & Disambiguation.ForValue;
  export type ForEffect<$In> = Base<$In> & Disambiguation.ForEffect;
}

export const never = (never: never): never => never;

import { fromConfiguration, type Configuration } from "./Config.ts";
import { effect, type Effect } from "./effect/index.ts";
import type { Extension, LambdaOf, TypeLambda } from "./Extension.ts";
import { T } from "./T.ts";
import { testing, type Testing } from "./testing/index.ts";
import { typed, type Typed } from "./typed/index.ts";
import { validated, type Validated } from "./validated/index.ts";

export type { Configuration } from "./Config.ts";

export type {
  Apply,
  Extension,
  HandleLambda,
  HandleOf,
  LambdaOf,
  Produce,
  Session,
  TypeLambda,
} from "./Extension.ts";

export type { AnyIdentity, Identity, Options } from "./Types";

export type { Execution, Spy } from "./Spy.ts";

export type { Mocker } from "./Mocking.ts";

export { T } from "./T.ts";

export type {
  AmbiguousIdentityError,
  DuplicateMockError,
  ExtensionUnavailableError,
  ExternError,
  IllegalConcurrencyTestingError,
  InvalidDataTypeError,
  NotMockedError,
  UnusedMocksError,
} from "./Error.ts";

/**
 * Initialization of the library provides this interface.
 *
 * `$Lambda` is the union of the lambdas contributed by the extensions this
 * instance was initialized with — `never` when there were none.
 */
export interface Initialized<$Lambda extends TypeLambda = never> {
  /**
   * Start defining an extern block in `validated` mode.
   */
  readonly validated: Validated;

  /**
   * Start defining an extern block in `typed` mode.
   */
  readonly typed: Typed<$Lambda>;

  /**
   * Start defining an extern block in `effect` mode.
   */
  readonly effect: Effect;

  /**
   * Run a supplied function in a testing context in which to mock source
   * extern blocks.
   */
  readonly testing: Testing<$Lambda>;

  /**
   * Build a type-only stand-in for a real schema, usable as the identity
   * passed to `typed.by()` (and `mock()` inside a testing block).
   */
  readonly T: typeof T;
}

/**
 * Initializes an instance of the usable library API according to the
 * provided configuration.
 *
 * `$Extensions` is inferred from the `extensions` array itself, so the accepted
 * identity set widens with no explicit type argument: `$Extensions[number]` is the
 * union of the element types, and `LambdaOf` distributes over it to give the
 * union of their lambdas. With no extensions `$Extensions` is `[]`, `$Extensions[number]` is
 * `never`, and every identity type stays exactly as it was.
 */
export const initialize = async <
  $Extensions extends readonly Extension.Any[] = readonly [],
>(
  config: Configuration<$Extensions> = {},
): Promise<Initialized<LambdaOf<$Extensions[number]>>> => {
  const $config = await fromConfiguration(config);

  return {
    validated: validated($config),
    typed: typed($config),
    effect: effect($config),
    testing: testing($config),
    T,
    /**
     * Cast, for the same reason `Mocking.ts`'s own cast exists: the parts are
     * built against the widest lambda, while the caller is handed the precise
     * one inferred from `$Extensions`. TypeScript cannot relate a concrete
     * instance to a type whose lambda parameter is still generic, and no
     * runtime value differs between the two — `$Lambda` is phantom throughout.
     */
  } as unknown as Initialized<LambdaOf<$Extensions[number]>>;
};

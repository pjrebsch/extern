import type { TypeLambda } from "../Extension";
import type { Mocker } from "../Mocking";

/**
 * What identifies one registered test or suite.
 *
 * Declared here rather than imported from `@ghostry/harness`, so neither
 * package depends on the other — the same arrangement extern's own `Extension`
 * contract uses for the other direction. Satisfied structurally.
 *
 * This integration reads only `kind`, to tell a test from a suite hook. The
 * rest is carried because the contract carries it: a hook that ignores a field
 * still has to be assignable to the shape harness passes.
 */
export type Identity = {
  /**
   * Disambiguates an empty-named test from its enclosing suite scope — `name`
   * is `""` for both, and `path` never carries a leaf's own name.
   */
  readonly kind: "test" | "suite";
  /** Enclosing describe names, outer → inner. */
  readonly path: ReadonlyArray<string>;
  /** The test name; empty for a suite-scoped callback. */
  readonly name: string;
  /** `.each` row index (0-based), `undefined` when the test is not from `.each`. */
  readonly row: number | undefined;
};

/**
 * What `@ghostry/harness` hands {@link Integration.frame}: one object, never
 * positional arguments, so a field added to the contract later is a key an
 * existing hook ignores rather than a parameter it has to thread past.
 */
export type FrameArgs = { readonly identity: Identity };

/**
 * What it hands each provider: everything {@link FrameArgs} carries, plus what
 * this integration's own wrapper established — here the testing block's mocker,
 * or `undefined` for a suite hook, which this integration does not frame.
 */
export type ProviderArgs<$Established = void> = FrameArgs & {
  readonly established: $Established;
};

/**
 * One context key's value, as a function of the test's `Identity` rather than a
 * fixed value.
 */
export type Provider<$Value, $Established = void> = (
  args: ProviderArgs<$Established>,
) => $Value;

/**
 * The keys an integration contributes, and how each is produced. Homomorphic
 * over `$Context`, so the contributed context is read back out of this object's
 * shape with no separate key declaration to keep in sync.
 */
export type Provides<$Context extends object, $Established = void> = {
  readonly [$Key in keyof $Context]: Provider<$Context[$Key], $Established>;
};

/**
 * How an integration runs the body when the body must run _inside_ something.
 * Here that is `extern.testing`, whose callback parameter is already this shape
 * — the mocker it opens is what reaches `body`, and therefore what reaches the
 * providers.
 *
 * Generic in its return and must hand the body's value back unchanged: that is
 * what keeps a synchronous test synchronous and what lets frames nest.
 */
export type Wrapper<$Established = void> = <$Return>(
  body: (established: $Established) => $Return,
) => $Return;

/**
 * What {@link Integration.frame} returns: a generator with **one** suspension
 * point, or none at all.
 *
 * Only the synchronous arm is declared, where harness accepts an
 * `AsyncGenerator` too. The narrower satisfies the wider, and entering a
 * testing block is synchronous — declaring the async arm would invite a frame
 * that promotes every test in the suite to a promise for no reason.
 */
export type Frame<$Established = void> = Generator<
  Wrapper<$Established> | void,
  void,
  unknown
>;

/**
 * What `integration(instance)` is, as `@ghostry/harness`'s `initialize` sees
 * it. The subset of that package's contract this integration actually uses: an
 * object lacking an optional member still satisfies the contract structurally,
 * so `frame` is required here though optional there.
 *
 * A `type` alias rather than an `interface`, and load-bearing: harness checks
 * an `integrations` array against `Integration<Record<string, unknown>, any>`,
 * and only an object-literal type alias carries the implicit index signature
 * that makes a concrete `Provides` assignable to it.
 */
export type Integration<$Context extends object, $Established = void> = {
  readonly name: string;
  readonly provides: Provides<$Context, $Established>;
  frame(args: FrameArgs): Frame<$Established>;
};

/**
 * What the wrapper establishes, and what the `extern` context key holds.
 *
 * An object around the mocker rather than the mocker itself, so the key can
 * grow a sibling later without claiming a second top-level context key — and
 * so `context.extern` reads as the library it names rather than as a callable
 * whose name says nothing about what calling it does.
 */
export type Mocking<$Lambda extends TypeLambda = never> = {
  readonly mock: Mocker<$Lambda>;
};

/**
 * `undefined` wherever harness runs a provider outside a wrapper. That is the
 * suite path: this integration frames tests and not suite hooks, so a
 * `beforeAll`'s provider is reached with nothing established.
 *
 * Declared honestly rather than as the non-nullable half, so the provider
 * narrows with `??` instead of asserting.
 */
export type Established<$Lambda extends TypeLambda = never> =
  | Mocking<$Lambda>
  | undefined;

/**
 * The slice of the test context `integration(instance)` contributes — one key,
 * `extern`, holding the block's mocker.
 */
export type ExternTestContext<$Lambda extends TypeLambda = never> = {
  readonly extern: Mocking<$Lambda>;
};

import { AmbiguousIdentityError, ExtensionUnavailableError } from "./Error";

/**
 * A type-level function from `In` to `Out` — the carrier that lets an
 * extension widen `Identity` for the instances that opt into it, rather than
 * globally for every `initialize()` in a project.
 *
 * Encoded with the `this`-type trick: {@link Apply} intersects a concrete `In`
 * onto the lambda and reads `Out` back, and `this["In"]` inside a lambda's
 * `Out` resolves against that intersection.
 *
 * Two authoring rules, both established by compiling against real schema
 * types rather than reasoned about:
 *
 * 1. `this["In"]` cannot appear inside a *nested anonymous object type*. It
 *    has to pass through a named generic alias — `Schema<this["In"]>`
 *    resolves, `{ produces?: this["In"] }` does not.
 * 2. `Out` must be structurally *narrow*, keyed on a nominal marker the
 *    extension's own values carry. A shape as loose as
 *    `{ build: () => this["In"] }` accepts any object with a same-named
 *    method, silently making unrelated values look like identities — the
 *    reason a real lambda intersects its library's branded symbols.
 */
export interface TypeLambda {
  readonly In: unknown;
  readonly Out: unknown;
}

/**
 * Apply a type lambda to a concrete type.
 *
 * Distributes over a *union* of lambdas for free — both `&` and indexed
 * access distribute over unions — which is how several extensions compose
 * with no combinator involved. A combinator is in fact not expressible: with
 * a generic `$Lambda`, `($Lambda & { In: this["In"] })["Out"]` stays a
 * deferred indexed access and `this` never resolves.
 *
 * `Apply<never, $T>` is `never`, so an instance with no extensions needs no
 * sentinel lambda — the empty case falls out of the encoding.
 */
export type Apply<$Lambda extends TypeLambda, $T> = ($Lambda & {
  readonly In: $T;
})["Out"];

/**
 * The second type-level function an extension may carry: from a *concrete
 * identity* to the object its own API exposes for that identity — a builder, a
 * generator, whatever that library already offers. That object is
 * what `mock(x).produce(({ via }) => …)` hands the caller, so shaping a
 * production is expressed in the extension's own vocabulary and extern models
 * none of it.
 *
 * Deliberately **separate** from {@link TypeLambda} rather than two more slots
 * on it, and this is not a stylistic choice. An interface property is
 * inherited whether or not the extending interface redeclares it, so a
 * `Handle: unknown` on the base would land on *every* lambda — including the
 * handle-less ones this contract exists to support. `Handle | unknown` is
 * `unknown`, so a single observer extension configured beside a
 * handle-bearing one would collapse `via` to `unknown` for every identity in
 * the instance. Opting in by declaration is what keeps that unrepresentable.
 */
export interface HandleLambda {
  readonly Of: unknown;
  readonly Handle: unknown;
}

/**
 * Resolve what a callback receives for `$Identity`, or `never` when this
 * lambda offers nothing to hand it.
 *
 * The `$Lambda extends HandleLambda` guard is what makes the empty case `never`
 * rather than `unknown`, and it distributes over a union of lambdas, so each
 * member is judged on its own — a handle-less extension contributes nothing
 * instead of swallowing its neighbours' handles.
 */
export type HandleOf<$Lambda extends TypeLambda, $Identity> =
  $Lambda extends HandleLambda ?
    ($Lambda & { readonly Of: $Identity })["Handle"]
  : never;

/**
 * Produce a value for `identity`. `named` is the block's disambiguating name
 * when it has one, which an extension may fold into how it derives the value
 * so that two differently-named blocks over one identity differ.
 *
 * `using` is present when the caller wrote `produce(fn)` rather than
 * `produce()`. Only the extension can construct a handle, so it — not extern —
 * invokes the callback: build whatever `HandleLambda`'s `Handle` promised for
 * this identity, pass it, and return the result. The caller's own destructuring
 * is already wrapped away, so an extension sees a plain one-argument function.
 *
 * An extension with no handle to offer ignores `using` entirely; its lambda
 * declares no `Handle`, `HandleOf` resolves to `never`, and the callback form
 * never appears on the identity's types in the first place.
 */
export type Produce = (
  identity: unknown,
  named: string | undefined,
  using?: (handle: unknown) => unknown,
) => unknown;

/**
 * What an extension hands back for the duration of one open scope.
 *
 * `produce` is optional *here* because this is the erased form extern's core
 * holds — a session it has not yet attributed to a variant. Which variant an
 * extension is decides what it must yield: see {@link Session.Producer}.
 */
export interface Session {
  /** Produce values for the identities this extension claims. */
  readonly produce?: Produce;
}

export namespace Session {
  /**
   * What a {@link Extension.Producer} must yield. `produce` is required: an
   * extension that claims identities has to serve them, and making that a
   * different type is what keeps "claims, but serves nothing" from compiling.
   */
  export type Producer = Required<Session>;
}

/**
 * What a library supplies to participate in an extern instance.
 *
 * A **union of two variants**, discriminated by `kind`, not one interface with
 * optional fields. Producer is a cluster — `lambda`, `supports`, `unmocked`,
 * and a session that actually serves values — and every member of it is
 * meaningless without the rest.
 *
 * `Extension<SomeLambda>` is precisely {@link Extension.Producer}, and a bare
 * `Extension` is precisely {@link Extension.Observer}. Neither admits the
 * other.
 *
 * Passed to `initialize()` as a value, so any widening applies to that
 * instance alone.
 */
export type Extension<$Lambda extends TypeLambda = never> =
  [$Lambda] extends [never] ? Extension.Observer : Extension.Producer<$Lambda>;

export namespace Extension {
  /**
   * The shared half: every extension is named, and every extension gets a
   * scope opened per `extern.testing` block.
   */
  interface Base {
    /** Names this extension in diagnostics, e.g. `"schema-library"`. */
    readonly name: string;
  }

  /**
   * `ignore` carries extern's own source roots. An extension that resolves
   * the calling test file from a stack must exclude these *in addition to*
   * its own frames — the stack reads library -> extension -> extern -> test,
   * so a walk that passes over only the extension's own code stops at
   * extern's internals instead of reaching the test.
   */
  export interface ScopeOptions {
    readonly ignore: readonly string[];
  }

  /**
   * An extension that contributes identities: its own schemas become usable
   * as block identities, and a block built from one produces a value instead
   * of throwing when it has no mock.
   */
  export interface Producer<
    $Lambda extends TypeLambda = TypeLambda,
  > extends Base {
    readonly kind: "producer";

    /**
     * Phantom, never read at runtime — the sole carrier of `$Lambda`, which
     * is what lets `initialize` infer it from the value a caller passes
     * rather than requiring an explicit type argument.
     */
    readonly '~lambda'?: $Lambda;

    /**
     * Does this extension recognize `identity` as something it can produce?
     *
     * It must agree with `$Lambda`: a value this returns `true` for should be
     * one the lambda accepts, and vice versa. Where they disagree, the type
     * level and the runtime disagree about which blocks are producible.
     */
    readonly supports: (identity: unknown) => boolean;

    /**
     * What a block that this extension claims does when it has no matching
     * mock.
     *
     * Read by extern's core but sourced from the extension value, so that
     * configuring it without supplying an extension stays unrepresentable.
     *
     * @default "produce"
     */
    readonly unmocked?: "produce" | "error";

    /**
     * Open one scope per `extern.testing` block, and run `block` inside it —
     * where this extension sets up and tears down whatever it needs for the
     * duration of one test. See {@link ScopeOptions} for `ignore`.
     *
     * The session must carry a `produce`: claiming identities and serving
     * none is the contract violation this variant exists to rule out.
     */
    readonly scope: <$Return>(
      options: ScopeOptions,
      block: (session: Session.Producer) => Promise<$Return>,
    ) => Promise<$Return>;
  }

  /**
   * An extension that claims nothing and only wants a scope per block — a
   * debugging helper collecting which blocks ran, say, and reporting on them
   * afterwards.
   *
   * It contributes no lambda, so `Identity` is unwidened and its presence
   * leaves every block behaving exactly as it would with no extension
   * configured.
   */
  export interface Observer extends Base {
    readonly kind: "observer";

    /**
     * Open one scope per `extern.testing` block, and run `block` inside it.
     * See {@link ScopeOptions} for `ignore`.
     */
    readonly scope: <$Return>(
      options: ScopeOptions,
      block: (session: Session) => Promise<$Return>,
    ) => Promise<$Return>;
  }

  /**
   * Any extension, whichever variant — the form extern's core stores
   * and iterates.
   */
  export type Any = Producer | Observer;
}

/**
 * Reads the lambda back off an extension value.
 *
 * Matches {@link Extension.Producer} rather than `Extension<infer $Lambda>`:
 * `Extension` is a *conditional* alias, and a conditional's own parameter is
 * not inferrable through. An observing extension matches nothing here and
 * yields `never`, which is exactly its contribution to the union.
 *
 * Distributes over a union, so `LambdaOf<$Es[number]>` turns a tuple of
 * extensions into the union of their lambdas — the whole mechanism by which
 * `initialize({ extensions: [a, b] })` widens `Identity` by both.
 */
export type LambdaOf<$Extension> =
  $Extension extends Extension.Producer<infer $Lambda> ? $Lambda : never;

/**
 * This package's own source root — `src/` in this repo's own tests,
 * `dist/esm/` once built.
 *
 * `new URL(".", ...)` because this file sits *directly* in `src/`. It must
 * cover every extern file that can sit between the user's test and a
 * production — the `typed`/`validated` cores above all. A root scoped any
 * more narrowly leaves those frames eligible, and an extension walking the
 * stack then attributes a production to extern's internals instead of to the
 * user's test.
 *
 * That failure hides easily. A core's frame only appears in the stack when
 * its call into the extension is not in tail position, so an engine that
 * elides tail calls can mask it on one code path while another path — one
 * that happens to wrap the call — resolves somewhere else entirely. The two
 * paths then produce different values for the same block. Assert resolved
 * attribution directly; downstream determinism will not catch it.
 */
export const OWN_ROOT = new URL(".", import.meta.url).href;

/**
 * The configured extensions, composed into the single surface extern's core
 * consumes. Built once per `initialize()`.
 */
export interface Extensions {
  /** Empty when no extension was configured. */
  readonly all: readonly Extension.Any[];

  /**
   * The one extension that recognizes `identity`, or `undefined` when none
   * does — including when no configured extension produces anything at all.
   *
   * Counts matches rather than taking the first. Two extensions whose lambdas
   * both match an identity resolve `$Out` to a winner TypeScript picks by its
   * own inference-candidate selection — independent of the order they appear
   * in, verified both ways — so a first-match-wins dispatch here cannot be
   * made to agree with the type the caller was handed. Ordering does not fix
   * it; refusing does, by turning a silent divergence into a loud error at
   * the point of use.
   */
  readonly claimant: (identity: unknown) => Extension.Producer | undefined;

  /**
   * Open every extension's scope, innermost last, and run `block` with a
   * {@link Produce} that routes to whichever extension claims each identity.
   */
  readonly scope: <$Return>(
    options: Extension.ScopeOptions,
    block: (produce: Produce) => Promise<$Return>,
  ) => Promise<$Return>;
}

export const compose = (extensions: readonly Extension.Any[]): Extensions => {
  /**
   * Keyed on the discriminant, so every caller downstream then knows a
   * claimant serves what it claims, with no additional check.
   */
  const claimant = (identity: unknown): Extension.Producer | undefined => {
    const claimants = extensions.filter(
      (e): e is Extension.Producer =>
        e.kind === "producer" && e.supports(identity),
    );

    if (claimants.length > 1) {
      throw new AmbiguousIdentityError(claimants.map((e) => e.name));
    }

    return claimants[0];
  };

  /**
   * Each extension's scope wraps the next, so every one is open by the time
   * `block` runs. Recursive rather than a fold: each level has to await the
   * level below *inside* its own `scope` callback, which a reduce over thunks
   * expresses far less directly.
   */
  const scope = <$Return>(
    options: Extension.ScopeOptions,
    block: (produce: Produce) => Promise<$Return>,
  ): Promise<$Return> => {
    const enter = (
      index: number,
      opened: ReadonlyArray<{
        readonly extension: Extension.Any;
        readonly session: Session;
      }>,
    ): Promise<$Return> => {
      const extension = extensions[index];

      if (extension === undefined) {
        return block((identity, named, using) => {
          const claim = claimant(identity);

          const match =
            claim === undefined ? undefined : (
              opened.find((o) => o.extension === claim)
            );

          /**
           * Also thrown when the claiming extension's session yielded no
           * `produce`. {@link Extension.Producer} now makes that
           * unrepresentable — its `scope` must hand `block` a
           * {@link Session.Producer} — so this is reachable only by defeating
           * the types: a plain JavaScript caller, or a cast. It stays a real
           * error rather than an assertion for exactly that reason.
           */
          if (match?.session.produce === undefined) {
            throw new ExtensionUnavailableError();
          }

          return match.session.produce(identity, named, using);
        });
      }

      return extension.scope(options, (session) =>
        enter(index + 1, [...opened, { extension, session }]),
      );
    };

    return enter(0, []);
  };

  return { all: extensions, claimant, scope };
};

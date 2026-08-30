import { describe, expect, it } from "bun:test";
import * as S from "sury";
import { initialize, type Initialized } from "../src";
import type {
  Apply,
  Extension,
  HandleOf,
  LambdaOf,
  Produce,
  Session,
} from "../src/Extension";
import type { Identity } from "../src/Types";
import {
  boxed,
  boxedExtension,
  observerExtension,
  tagged,
  taggedExtension,
  type Box,
  type Boxed,
  type BoxedLambda,
  type Tagged,
  type TaggedLambda,
} from "./fixtures/extension";

/**
 * These assertions are enforced by `tsc --noEmit` (the package's `check`
 * script, which `test` runs first), not by the runtime bodies below — a
 * failing one is a compile error, and the `it(...)` wrappers exist only to
 * keep the file legible alongside the rest of the suite.
 *
 * `Equals` is the invariant comparison, not `extends` in both directions:
 * the latter reports `any` as equal to everything, which is exactly the
 * failure mode these assertions need to catch.
 */
type Equals<$X, $Y> =
  (<$P>() => $P extends $X ? 1 : 2) extends <$P>() => $P extends $Y ? 1 : 2 ?
    true
  : false;

/**
 * A call rather than a `type _ = Expect<…>` alias: an unused type alias trips
 * `noUnusedLocals`, and naming each one just to satisfy the compiler adds
 * nothing a reader wants.
 */
const assertType = <_$T extends true>(): void => {};

describe("the extension type mechanism", () => {
  describe("`Apply`", () => {
    it("distributes over a union of lambdas with no combinator", () => {
      assertType<
        Equals<
          Apply<BoxedLambda | TaggedLambda, string>,
          Apply<BoxedLambda, string> | Apply<TaggedLambda, string>
        >
      >();

      expect(true).toBe(true);
    });

    it("collapses to `never` for the empty case", () => {
      assertType<Equals<Apply<never, string>, never>>();

      expect(true).toBe(true);
    });
  });

  describe("`LambdaOf`", () => {
    it("reads the union of lambdas off a tuple of extension values", () => {
      type Tuple = readonly [Extension<BoxedLambda>, Extension<TaggedLambda>];

      assertType<Equals<LambdaOf<Tuple[number]>, BoxedLambda | TaggedLambda>>();

      expect(true).toBe(true);
    });
  });

  describe("`Identity`", () => {
    it("is exactly the two built-in members when no extension is present", () => {
      assertType<
        Equals<Identity<string, never>, Identity<string> | Apply<never, string>>
      >();

      expect(true).toBe(true);
    });
  });
});

describe("`initialize`", () => {
  it("infers the lambda union from the extension values, with no type argument", async () => {
    const extern = await initialize({
      extensions: [boxedExtension(), taggedExtension()],
    });

    assertType<
      Equals<typeof extern, Initialized<BoxedLambda | TaggedLambda>>
    >();

    expect(extern).toBeDefined();
  });

  it("infers a single lambda from a single extension", async () => {
    const extern = await initialize({ extensions: [boxedExtension()] });

    assertType<Equals<typeof extern, Initialized<BoxedLambda>>>();

    expect(extern).toBeDefined();
  });

  it("resolves to `never` with no extensions, and with an empty list", async () => {
    const bare = await initialize();
    const empty = await initialize({ extensions: [] });

    assertType<Equals<typeof bare, Initialized<never>>>();
    assertType<Equals<typeof empty, Initialized<never>>>();

    expect(bare).toBeDefined();
    expect(empty).toBeDefined();
  });
});

describe("an extension that contributes no identities", () => {
  it("leaves the lambda union untouched", async () => {
    const alone = await initialize({ extensions: [observerExtension()] });
    const beside = await initialize({
      extensions: [observerExtension(), boxedExtension()],
    });

    assertType<Equals<typeof alone, Initialized<never>>>();
    assertType<Equals<typeof beside, Initialized<BoxedLambda>>>();

    expect([alone, beside]).toBeDefined();
  });

  it("offers no `produce()` anywhere", async () => {
    const extern = await initialize({ extensions: [observerExtension()] });

    await extern.testing((mock) => {
      const spyable = mock(S.string);

      // @ts-expect-error — this extension produces nothing, so nothing on
      // this instance is producible.
      spyable.produce;

      spyable.with("v", { unused: "allow" });
    });
  });
});

describe("`typed.by`", async () => {
  const extern = await initialize({
    extensions: [boxedExtension(), taggedExtension()],
  });

  const bare = await initialize();

  it("infers the produced type from an extension identity", () => {
    const result = extern.typed
      .by(boxed<{ id: number }>("a"))
      .will(() => ({ id: 1 }));

    assertType<Equals<typeof result, { id: number }>>();

    expect(result).toBeDefined();
  });

  it("infers through a four-member union target", () => {
    const fromBoxed = extern.typed.by(boxed<string>("a")).will(() => "s");
    const fromTagged = extern.typed.by(tagged<number>("b")).will(() => 1);
    const fromStandard = extern.typed.by(S.boolean).will(() => true);
    const fromT = extern.typed.by(extern.T<symbol>()).will(() => Symbol());

    assertType<Equals<typeof fromBoxed, string>>();
    assertType<Equals<typeof fromTagged, number>>();
    assertType<Equals<typeof fromStandard, boolean>>();
    assertType<Equals<typeof fromT, symbol>>();

    expect([fromBoxed, fromTagged, fromStandard, fromT]).toBeDefined();
  });

  it("survives the curried chain, inferring the given type too", () => {
    const result = extern.typed
      .by(boxed<string>("a"))
      .named("x")
      .given({ q: 1 })
      .will((input) => {
        /**
         * `{ readonly q: 1 }`, not `{ q: number }`: `given` takes a `const`
         * type parameter, so the literal survives the chain.
         */
        assertType<Equals<typeof input, { readonly q: 1 }>>();
        return "s";
      });

    assertType<Equals<typeof result, string>>();

    expect(result).toBeDefined();
  });

  it("rejects an extension identity on an instance without that extension", () => {
    // @ts-expect-error — `Identity` is unwidened here: no extensions were
    // passed to this instance's `initialize()`.
    bare.typed.by(boxed<string>("a"));

    // @ts-expect-error — an arbitrary object is not an identity either.
    bare.typed.by({ not: "an identity" });

    expect(bare).toBeDefined();
  });
});

describe("the `produce()` gate", async () => {
  const extern = await initialize({ extensions: [boxedExtension()] });
  const bare = await initialize();

  it("offers `produce()` for an extension identity, top level and under `named`", async () => {
    await extern.testing((mock) => {
      const spyable = mock(boxed<string>("a"));

      assertType<Equals<ReturnType<typeof spyable.produce>["kind"], "value">>();

      spyable.produce({ unused: "allow" });
      mock(boxed<string>("b")).named("n").produce({ unused: "allow" });
    });
  });

  it("still offers every ordinary terminal alongside it", async () => {
    await extern.testing((mock) => {
      const spyable = mock(boxed<string>("a"));

      spyable.with("v", { unused: "allow" });
      mock(boxed<string>("b")).substitute("v", { unused: "allow" });
      mock(boxed<string>("c")).passthrough({ unused: "allow" });
      mock(boxed<string>("d")).skip({ unused: "allow" });
      mock(boxed<string>("e")).named("n").with("v", { unused: "allow" });
      mock(boxed<string>("f")).named("n").skip({ unused: "allow" });
    });
  });

  it("withholds `produce()` from a Standard Schema and from `T<>`", async () => {
    await extern.testing((mock) => {
      const standard = mock(S.string);
      const t = mock(extern.T<number>());

      // @ts-expect-error — a Standard Schema validates; it does not produce.
      standard.produce;

      // @ts-expect-error — nor under `named(...)`.
      standard.named("n").produce;

      // @ts-expect-error — a `T<>` carries no schema to produce from.
      t.produce;

      // @ts-expect-error — nor under `named(...)`.
      t.named("n").produce;

      standard.with("v", { unused: "allow" });
      t.with(1, { unused: "allow" });
    });
  });

  it("withholds `produce()` entirely from an instance with no extensions", async () => {
    await bare.testing((mock) => {
      const spyable = mock(S.string);

      // @ts-expect-error — nothing can produce on this instance.
      spyable.produce;

      spyable.with("v", { unused: "allow" });
    });
  });
});

/**
 * `HandleOf` is the second type-level function, and the *separation* it rests
 * on is what these assert. Putting `Of`/`Handle` on the base `TypeLambda`
 * resolves correctly in isolation and then poisons any union: an extension
 * that never declares `Handle` still inherits `Handle: unknown`, and
 * `Box<string> | unknown` is `unknown`. One observer extension beside a
 * handle-bearing one would collapse `via` to `unknown` for every identity in
 * the instance.
 */
describe("`HandleOf`", () => {
  it("resolves a declared handle, and `never` for a lambda without one", () => {
    assertType<Equals<HandleOf<BoxedLambda, Boxed<string>>, Box<string>>>();

    /**
     * `never`, not `unknown` — that distinction is the entire fix, since
     * `unknown` is the absorbing element of a union and `never` the neutral
     * one.
     */
    assertType<Equals<HandleOf<TaggedLambda, Tagged<string>>, never>>();

    expect(true).toBe(true);
  });

  it("does not let a handle-less lambda swallow its neighbour's handle", () => {
    type Mixed = BoxedLambda | TaggedLambda;

    assertType<Equals<HandleOf<Mixed, Boxed<string>>, Box<string>>>();
    assertType<Equals<HandleOf<Mixed, Tagged<string>>, never>>();

    expect(true).toBe(true);
  });

  it("leaves `Apply` alone", () => {
    assertType<Equals<Apply<BoxedLambda, string>, Boxed<string>>>();

    assertType<
      Equals<
        Apply<BoxedLambda | TaggedLambda, string>,
        Boxed<string> | Tagged<string>
      >
    >();

    expect(true).toBe(true);
  });

  it("is `never` for the empty case", () => {
    assertType<Equals<HandleOf<never, Boxed<string>>, never>>();

    expect(true).toBe(true);
  });
});

describe("the `produce(fn)` gate", async () => {
  const extern = await initialize({ extensions: [boxedExtension()] });

  const mixed = await initialize({
    extensions: [boxedExtension(), taggedExtension()],
  });

  const beside = await initialize({
    extensions: [observerExtension(), boxedExtension()],
  });

  const handleless = await initialize({ extensions: [taggedExtension()] });

  it("types `via` as the extension's own handle", async () => {
    await extern.testing((mock) => {
      mock(boxed<string>("a")).produce(
        (context) => {
          /**
           * The invariant comparison, deliberately: a two-way `extends` check
           * reports `any` as equal to everything, which is the one failure this
           * assertion exists to catch.
           */
          assertType<Equals<typeof context.via, Box<string>>>();

          return context.via.build();
        },
        { unused: "allow" },
      );
    });
  });

  it("keeps `via` precise when a handle-less extension is configured beside it", async () => {
    await mixed.testing((mock) => {
      mock(boxed<string>("a")).produce(
        ({ via }) => {
          assertType<Equals<typeof via, Box<string>>>();
          return via.build();
        },
        { unused: "allow" },
      );
    });

    /** And likewise beside one that contributes no lambda at all. */
    await beside.testing((mock) => {
      mock(boxed<string>("a")).produce(
        ({ via }) => {
          assertType<Equals<typeof via, Box<string>>>();
          return via.build();
        },
        { unused: "allow" },
      );
    });
  });

  /**
   * The callback form is what `never` withdraws, not the terminal: a
   * handle-less extension can still produce perfectly well, it just has
   * nothing to hand a callback.
   */
  it("withholds the callback from a handle-less extension, keeping `produce()`", async () => {
    await handleless.testing((mock) => {
      /**
       * A fresh identity per assertion: these bodies really execute, and two
       * terminals on one identity with the same disambiguation is a
       * `DuplicateMockError` regardless of what the compiler thinks of them.
       */
      // @ts-expect-error — `TaggedLambda` declares no `Handle`.
      mock(tagged<string>("a")).produce(() => "v", { unused: "allow" });

      /**
       * Bound first, deliberately. A `@ts-expect-error` suppresses only the
       * line immediately after it, and prettier breaks a longer chain across
       * lines — which silently moves the diagnostic out from under the
       * directive and turns the assertion into a no-op.
       */
      const under = mock(tagged<string>("b")).named("n");

      // @ts-expect-error — nor under `named(...)`.
      under.produce(() => "v", { unused: "allow" });

      /**
       * The single-argument form matters most: it is the one that would
       * silently swallow a callback if this gate regressed, rather than
       * failing on arity. It is rejected because the sole remaining signature
       * takes `Options`, and a function has no property in common with it —
       * which holds as long as `Options` stays a weak (all-optional) type.
       *
       * Read afterwards rather than left unused, since the mock is really
       * registered: the rejection is the compiler's alone, and at runtime the
       * extension simply ignores a callback it has no handle for.
       */
      const swallowed = tagged<string>("z");

      // @ts-expect-error — a bare callback has nowhere to go here either.
      mock(swallowed).produce(() => "v");

      expect(handleless.typed.by(swallowed).will(() => "x")).toBe("tagged(z)");

      /** The terminal itself is untouched — only the callback is withdrawn. */
      mock(tagged<string>("c")).produce({ unused: "allow" });
      mock(tagged<string>("d")).named("n").produce({ unused: "allow" });
    });
  });

  it("still accepts both plain forms where a handle exists", async () => {
    await extern.testing((mock) => {
      mock(boxed<string>("a")).produce({ unused: "allow" });
      mock(boxed<string>("b")).named("n").produce({ unused: "allow" });
      mock(boxed<string>("c"))
        .named("n")
        .produce(({ via }) => via.build(), { unused: "allow" });
    });
  });

  it("holds the callback to the identity's produced type", async () => {
    await extern.testing((mock) => {
      // @ts-expect-error — the identity produces `string`, not `number`.
      mock(boxed<string>("a")).produce(() => 1, { unused: "allow" });

      // @ts-expect-error — and the handle has no such method.
      mock(boxed<string>("b")).produce(({ via }) => via.nope(), {
        unused: "allow",
      });
    });
  });
});

/**
 * The contract is a union of two variants, not one interface whose fields are
 * all optional. As one interface, four broken extensions type-checked — each
 * one a state the doc comments called impossible while nothing enforced it.
 */
describe("the `Extension` union", () => {
  const p = (() => "v") as Produce;

  it("resolves each public spelling to exactly one variant", () => {
    assertType<
      Equals<Extension<BoxedLambda>, Extension.Producer<BoxedLambda>>
    >();
    assertType<Equals<Extension, Extension.Observer>>();

    expect(true).toBe(true);
  });

  it("accepts a well-formed producer and a well-formed observer", () => {
    const producer: Extension<BoxedLambda> = {
      kind: "producer",
      name: "p",
      unmocked: "produce",
      supports: () => true,
      scope: async (_o, block) => block({ produce: p }),
    };

    const observer: Extension = {
      kind: "observer",
      name: "o",
      scope: async (_o, block) => block({}),
    };

    expect([producer.kind, observer.kind]).toEqual(["producer", "observer"]);
  });

  it("rejects all four states the single interface allowed", () => {
    /**
     * On the declaration, not on a property: a *missing* required member is
     * reported where the literal is assigned, while a *wrong* one is reported
     * on the offending line. The directive has to sit above whichever it is.
     */
    // @ts-expect-error — a producer must declare `supports`.
    const lambdaWithoutSupports: Extension<BoxedLambda> = {
      kind: "producer",
      name: "x",
      scope: async (_o, block) => block({ produce: p }),
    };

    const unmockedWithoutSupports: Extension = {
      kind: "observer",
      name: "x",
      // @ts-expect-error — `unmocked` is meaningless without claiming.
      unmocked: "error",
      scope: async (_o, block) => block({}),
    };

    const claimsButServesNothing: Extension<BoxedLambda> = {
      kind: "producer",
      name: "x",
      supports: () => true,
      // @ts-expect-error — a producer's session must carry `produce`.
      scope: async (_o, block) => block({}),
    };

    const supportsWithoutLambda: Extension = {
      kind: "observer",
      name: "x",
      // @ts-expect-error — an observer claims nothing.
      supports: () => true,
      scope: async (_o, block) => block({}),
    };

    expect([
      lambdaWithoutSupports,
      unmockedWithoutSupports,
      claimsButServesNothing,
      supportsWithoutLambda,
    ]).toHaveLength(4);
  });

  /**
   * The reason `kind` exists. Without a discriminant TypeScript cannot select
   * a member of the union, so contextual typing for `scope`'s parameters
   * collapses and even a *valid* extension fails to compile with "parameter
   * implicitly has an 'any' type" under `noImplicitAny`.
   *
   * `_o` and `block` are deliberately left un-annotated: that is the whole
   * assertion. Annotating them would test nothing.
   *
   * `satisfies` is load-bearing here, and not because of the union.
   * `initialize`'s `$Extensions` carries a default (`readonly []`), and a
   * defaulted type parameter falls back to its default rather than inferring
   * from a bare object literal that still needs contextual typing — so the
   * literal never gets a contextual type to begin with. Any of `satisfies`, a
   * hoisted annotated `const`, or an extension factory resolves it; all three
   * were checked. An extension is normally a factory, so this is the unusual
   * path, not the common one.
   */
  it("contextually types an inline extension given a contextual type", async () => {
    const extern = await initialize({
      extensions: [
        {
          kind: "observer",
          name: "inline",
          scope: async (_o, block) => block({}),
        } satisfies Extension,
        {
          kind: "producer",
          name: "inline-producer",
          supports: (identity) => typeof identity === "object",
          scope: async (_o, block) => block({ produce: p }),
        } satisfies Extension<BoxedLambda>,
      ],
    });

    expect(extern).toBeDefined();
  });

  /** `LambdaOf` reads through the variant, so an observer contributes `never`. */
  it("recovers a lambda from a producer and nothing from an observer", () => {
    assertType<Equals<LambdaOf<Extension<BoxedLambda>>, BoxedLambda>>();
    assertType<Equals<LambdaOf<Extension>, never>>();
    assertType<
      Equals<LambdaOf<Extension<BoxedLambda> | Extension>, BoxedLambda>
    >();

    expect(true).toBe(true);
  });

  /** A producer's session is `Required<Session>`; an observer's is not. */
  it("requires `produce` on a producer's session alone", () => {
    assertType<Equals<Session.Producer, Required<Session>>>();
    assertType<Equals<Session.Producer["produce"], Produce>>();

    expect(true).toBe(true);
  });
});

/**
 * Guards the `Boxed`/`Tagged` fixtures themselves: if either lambda stopped
 * being structurally narrow, it would start claiming unrelated values and
 * every gate above would pass for the wrong reason.
 */
describe("the stub lambdas", () => {
  it("do not claim each other's identities", () => {
    assertType<Equals<Boxed<string> extends Tagged<string> ? 1 : 0, 0>>();
    assertType<Equals<Tagged<string> extends Boxed<string> ? 1 : 0, 0>>();

    expect(true).toBe(true);
  });

  it("do not claim a plain object of the same shape", () => {
    type Lookalike = { readonly label: string };

    assertType<Equals<Lookalike extends Boxed<string> ? 1 : 0, 0>>();

    expect(true).toBe(true);
  });
});

import { describe, expect, it } from "bun:test";
import { initialize } from "../src";
import type { TypeLambda } from "../src/Extension";
import type { Mocker } from "../src/Mocking";
import {
  integration,
  type Established,
  type ExternTestContext,
  type Integration,
  type Mocking,
} from "../src/harnessing";
import {
  boxed,
  boxedExtension,
  tagged,
  taggedExtension,
  type BoxedLambda,
  type TaggedLambda,
} from "./fixtures/extension";

/**
 * These assertions are enforced by `tsc --noEmit` (the package's `check`
 * script, which `test` runs first), not by the runtime bodies below — a
 * failing one is a compile error, and the `it(...)` wrappers exist only to
 * keep the file legible alongside the rest of the suite.
 *
 * `Equals` is the invariant comparison rather than `extends` in both
 * directions, which is what lets it catch the failure that matters here: a
 * lambda fallen through to the `TypeLambda` constraint accepts essentially any
 * identity, and would pass a looser check while quietly accepting identities no
 * configured extension ever claimed.
 */
type Equals<$X, $Y> =
  (<$P>() => $P extends $X ? 1 : 2) extends <$P>() => $P extends $Y ? 1 : 2 ?
    true
  : false;

const assertType = <_$T extends true>(): void => {};

describe("the lambda `integration()` infers", () => {
  it("is the instance's own union, recovered exactly", async () => {
    const extern = await initialize({
      extensions: [boxedExtension(), taggedExtension()],
    });

    const wired = integration(extern);

    type Lambda = BoxedLambda | TaggedLambda;

    assertType<
      Equals<
        typeof wired,
        Integration<ExternTestContext<Lambda>, Established<Lambda>>
      >
    >();

    /**
     * The negative half. `$Lambda` has no inference site inside `Mocker` — it
     * appears only in a nested call signature's constraint — so inference has
     * to come from `Initialized<$Lambda>` positionally. Were it to fall
     * through instead, the `= never` default is what makes the failure loud;
     * this pins that it is not silently the constraint.
     */
    assertType<
      Equals<
        Equals<
          typeof wired,
          Integration<ExternTestContext<TypeLambda>, Established<TypeLambda>>
        >,
        false
      >
    >();

    expect(wired.name).toBe("@ghostry/extern");
  });

  it("stays at `never` for an instance with no extensions", async () => {
    const wired = integration(await initialize());

    assertType<
      Equals<
        typeof wired,
        Integration<ExternTestContext<never>, Established<never>>
      >
    >();

    expect(Object.keys(wired.provides)).toEqual(["extern"]);
  });
});

describe("the context an integration contributes", () => {
  it("accepts an extension's identity only where that extension is configured", () => {
    const widened = { mock: null as unknown as Mocker<BoxedLambda> };
    const narrow: Mocking = { mock: null as unknown as Mocker };

    /** Type-level only: never invoked, and neither mocker is a real one. */
    const identities = () => {
      widened.mock(boxed<string>("label"));

      // @ts-expect-error a bare instance's mocker knows nothing of `boxed`
      narrow.mock(boxed<string>("label"));

      // @ts-expect-error nor of `tagged`
      narrow.mock(tagged<string>("label"));
    };

    expect(typeof identities).toBe("function");
  });

  /**
   * Harness passes `established: undefined` to every provider it runs outside a
   * wrapper — the suite path this integration leaves unframed — so the type
   * says so, rather than declaring the non-nullable half and comparing against
   * `undefined` anyway.
   */
  it("admits `undefined` as what a suite hook establishes", () => {
    assertType<Equals<Established, Mocking<never> | undefined>>();
    assertType<
      Equals<Established<BoxedLambda>, Mocking<BoxedLambda> | undefined>
    >();

    expect(true).toBe(true);
  });
});

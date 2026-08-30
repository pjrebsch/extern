import { initialize as initializeExtern } from "@ghostry/extern";
import { initialize as initializeFabricator } from "@ghostry/fabricator";
import { describe, expect, it } from "bun:test";
import * as S from "sury";
import { fabricatorExtension } from "../src";

/**
 * Enforced by `tsc --noEmit` (this package's `check` script, which `test` runs
 * first), not by the runtime bodies — a failing assertion is a compile error,
 * and the `it(...)` wrappers only keep this file legible beside the rest.
 */
type Equals<$X, $Y> =
  (<$P>() => $P extends $X ? 1 : 2) extends <$P>() => $P extends $Y ? 1 : 2 ?
    true
  : false;

const assertType = <_$T extends true>(): void => {};

const fabricator = initializeFabricator({ seed: "types-suite" });
const { T } = fabricator;

const user = T.object({
  id: T.number,
  name: T.string.whereby({ length: { max: 10 } }),
});

/** A non-object schema: fabricator offers no per-call overrides for one. */
const count = T.number;

const extern = await initializeExtern({
  scope: "async",
  extensions: [fabricatorExtension({ instance: fabricator })],
});

const bare = await initializeExtern({ scope: "async" });

describe("a fabricator schema as an identity", () => {
  it("is accepted, inferring the fabricated type", () => {
    const value = extern.typed.by(user).will(() => ({ id: 1, name: "a" }));

    assertType<Equals<typeof value, { id: number; name: string }>>();

    expect(value).toBeDefined();
  });

  it("is accepted when already built into a Fabricator", async () => {
    const built = new fabricator.Fabricator(user);

    await extern.testing(() => {
      const value = built.fabricate();
      assertType<Equals<typeof value, { id: number; name: string }>>();
      expect(value).toBeDefined();
    });
  });

  it("is rejected on an instance with no extension", () => {
    // @ts-expect-error — `Identity` is unwidened without the extension.
    bare.typed.by(user);

    expect(true).toBe(true);
  });

  it("does not admit an arbitrary object", () => {
    // @ts-expect-error — the lambda is keyed on fabricator's own brands.
    extern.typed.by({ not: "a schema" });

    expect(true).toBe(true);
  });
});

describe("the `produce()` gate", () => {
  it("offers the callback form for an object schema", async () => {
    await extern.testing((mock) => {
      mock(user).produce(({ via }) => via.fabricate({ name: "Ada" }), {
        unused: "allow",
      });
    });
  });

  it("types `via` as the built Fabricator, not `any`", async () => {
    await extern.testing((mock) => {
      mock(user).produce(
        ({ via }) => {
          /**
           * A two-way `extends` check would report `any` as equal to anything,
           * so this leans on real structure instead: the override is keyed on
           * the schema's own definition, and an unknown field is rejected.
           */
          // @ts-expect-error — `nope` is not a field of this schema.
          via.fabricate({ nope: 1 });

          // @ts-expect-error — `name` is a string in this schema.
          via.fabricate({ name: 1 });

          return via.fabricate({ name: "ok" });
        },
        { unused: "allow" },
      );
    });
  });

  /**
   * Offered for *every* fabricator kind, not object schemas alone. The handle
   * is the built Fabricator, and every kind's carries `fabricate()`, `trace`,
   * and `schema` — per-call overrides are just one object-only feature of it.
   */
  it("offers the callback form for a non-object schema too", async () => {
    await extern.testing((mock) => {
      mock(count).produce(
        ({ via }) => {
          const n = via.fabricate();
          assertType<Equals<typeof n, number>>();

          expect(via.trace.file).toBeDefined();

          return n;
        },
        { unused: "allow" },
      );
    });
  });

  /**
   * Which kinds accept overrides is fabricator's own type talking, not a rule
   * this package encodes: a number Fabricator's `fabricate` simply takes no
   * arguments.
   */
  it("lets fabricator itself say where overrides apply", async () => {
    await extern.testing((mock) => {
      mock(T.boolean).produce(
        ({ via }) => {
          // @ts-expect-error — a non-object Fabricator takes no overrides.
          via.fabricate({ anything: true });

          return via.fabricate();
        },
        { unused: "allow" },
      );
    });
  });

  it("is absent for `T<>` and for a Standard Schema", async () => {
    await extern.testing((mock) => {
      const t = mock(extern.T<number>());
      const standard = mock(S.string);

      // @ts-expect-error — a `T<>` carries no schema to fabricate from.
      t.produce;

      // @ts-expect-error — a Standard Schema validates; it does not produce.
      standard.produce;

      t.with(1, { unused: "allow" });
      standard.with("v", { unused: "allow" });
    });
  });
});

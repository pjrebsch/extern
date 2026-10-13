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

const fabricator = initializeFabricator({ salt: "types-suite" });
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

/**
 * A schema's own `undefined` and `null` have to survive the inference. The
 * value type is read off an optional brand, and this suite compiles without
 * `exactOptionalPropertyTypes` — the setting under which an optional property
 * reads as `X | undefined` and a bare `[Produces]?: $T` cannot tell the
 * schema's `undefined` from the modifier's. `Schema<$T>` matching through
 * fabricator's `Produced<$T>` is what every assertion here rests on.
 */
describe("a schema whose value may be `undefined` or `null`", () => {
  const text = T.string.whereby({ length: { max: 4 } });
  const row = T.object({ id: text });

  type Row = { id: string };

  const nothing = T.undefined;
  const undefinable = T.undefinable(text);
  const nullable = T.nullable(text);
  const nullish = T.nullish(text);

  it("keeps it for each wrapper kind", () => {
    const fromNothing = extern.typed.by(nothing).will(() => undefined);
    const fromUndefinable = extern.typed.by(undefinable).will(() => undefined);
    const fromNullable = extern.typed.by(nullable).will(() => null);
    const fromNullish = extern.typed.by(nullish).will(() => null);

    assertType<Equals<typeof fromNothing, undefined>>();
    assertType<Equals<typeof fromUndefinable, string | undefined>>();
    assertType<Equals<typeof fromNullable, string | null>>();
    assertType<Equals<typeof fromNullish, string | null | undefined>>();

    expect(fromNullable).toBeNull();
  });

  it("accepts a block that returns `undefined` for an undefinable schema", async () => {
    const lookup = async (): Promise<Row | undefined> => undefined;

    const value = await extern.typed
      .by(T.undefinable(row))
      .will(() => lookup());

    assertType<Equals<typeof value, Row | undefined>>();

    expect(value).toBeUndefined();
  });

  it("still rejects one for a schema that never produces it", () => {
    // @ts-expect-error — `row` never produces `undefined`.
    extern.typed.by(row).will((): Row | undefined => undefined);

    expect(true).toBe(true);
  });

  it("keeps it nested in an object", () => {
    const schema = T.object({
      nothing,
      undefinable,
      nullable,
      nullish,
      optional: T.optional(text),
    });

    const value = extern.typed
      .by(schema)
      .will(() => ({
        nothing: undefined,
        undefinable: undefined,
        nullable: null,
        nullish: null,
      }));

    /**
     * `undefinable` stays a required key whose value may be `undefined`;
     * only `optional` is a key that may be absent.
     */
    assertType<
      Equals<
        typeof value,
        {
          nothing: undefined;
          undefinable: string | undefined;
          nullable: string | null;
          nullish: string | null | undefined;
          optional?: string | undefined;
        }
      >
    >();

    expect(value.nullable).toBeNull();
  });

  it("keeps it nested in an array", () => {
    const length = { length: { max: 2 } };

    const ofNothing = extern.typed
      .by(T.array(nothing).whereby(length))
      .will(() => []);
    const ofUndefinable = extern.typed
      .by(T.array(undefinable).whereby(length))
      .will(() => []);
    const ofNullable = extern.typed
      .by(T.array(nullable).whereby(length))
      .will(() => []);
    const ofNullish = extern.typed
      .by(T.array(nullish).whereby(length))
      .will(() => []);

    assertType<Equals<typeof ofNothing, undefined[]>>();
    assertType<Equals<typeof ofUndefinable, (string | undefined)[]>>();
    assertType<Equals<typeof ofNullable, (string | null)[]>>();
    assertType<Equals<typeof ofNullish, (string | null | undefined)[]>>();

    expect(ofNullish).toEqual([]);
  });

  it("keeps it nested in a tuple", () => {
    const schema = T.tuple([nothing, undefinable, nullable, nullish]);

    const value = extern.typed
      .by(schema)
      .will((): [undefined, undefined, null, null] => [
        undefined,
        undefined,
        null,
        null,
      ]);

    assertType<
      Equals<
        typeof value,
        [
          undefined,
          string | undefined,
          string | null,
          string | null | undefined,
        ]
      >
    >();

    expect(value).toHaveLength(4);
  });

  it("keeps it nested in a record", () => {
    const size = { size: { max: 2 } };

    const ofNothing = extern.typed
      .by(T.record(text, nothing).whereby(size))
      .will(() => ({}));
    const ofUndefinable = extern.typed
      .by(T.record(text, undefinable).whereby(size))
      .will(() => ({}));
    const ofNullable = extern.typed
      .by(T.record(text, nullable).whereby(size))
      .will(() => ({}));
    const ofNullish = extern.typed
      .by(T.record(text, nullish).whereby(size))
      .will(() => ({}));

    assertType<Equals<typeof ofNothing, Record<string, undefined>>>();
    assertType<
      Equals<typeof ofUndefinable, Record<string, string | undefined>>
    >();
    assertType<Equals<typeof ofNullable, Record<string, string | null>>>();
    assertType<
      Equals<typeof ofNullish, Record<string, string | null | undefined>>
    >();

    expect(ofNullish).toEqual({});
  });

  it("keeps it beside `self` in a recursive schema", () => {
    const tree = T.recursive((self) =>
      T.object({
        value: T.undefinable(T.number),
        parent: T.undefinable(self),
        next: T.nullish(self),
        previous: T.nullable(self),
        children: T.array(self).whereby({ length: { max: 2 } }),
      }),
    ).whereby({ depth: { max: 2 } });

    const value = extern.typed
      .by(tree)
      .will(() => ({
        value: undefined,
        parent: undefined,
        next: null,
        previous: null,
        children: [],
      }));

    type Tree = typeof value;

    assertType<Equals<Equals<Tree, unknown>, false>>();
    assertType<Equals<Tree["value"], number | undefined>>();
    assertType<Equals<Tree["parent"], Tree | undefined>>();
    assertType<Equals<Tree["next"], Tree | null | undefined>>();
    assertType<Equals<Tree["previous"], Tree | null>>();
    assertType<Equals<Tree["children"], Tree[]>>();

    expect(value.children).toEqual([]);
  });

  it("keeps it when the identity is already a built Fabricator", () => {
    const built = new fabricator.Fabricator(T.undefinable(row));

    const value = extern.typed.by(built).will(() => undefined);

    assertType<Equals<typeof value, Row | undefined>>();

    expect(value).toBeUndefined();
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

          expect(via.trace.kind).toBe("number");

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

import { describe, expect, it } from "bun:test";
import { initialize } from "../src";
import type { Extension, HandleLambda, TypeLambda } from "../src/Extension";

/**
 * The README's `## Extensions` snippets, executed as written.
 *
 * Its examples are phrased against a hypothetical `my-library`, so the pieces
 * that stand in for it — `MySchema`, `isMySchema`, `buildFrom`,
 * `MyBuilderFor` — are given real implementations here. Everything the README
 * actually shows is then reproduced verbatim, so a snippet that stops being
 * true stops compiling or stops passing.
 */

const brand: unique symbol = Symbol("my-library");

interface MySchema<$T> {
  readonly [brand]: true;
  readonly label: string;
  readonly produces?: $T;
}

const mySchema = <$T>(label: string): MySchema<$T> => ({
  [brand]: true,
  label,
});

const isMySchema = (identity: unknown): boolean =>
  typeof identity === "object" && identity !== null && brand in identity;

interface MyBuilder<$T> {
  readonly value: () => $T;
  readonly with: (overrides: { readonly role: string }) => $T;
}

type MyBuilderFor<$Of> = $Of extends MySchema<infer $T> ? MyBuilder<$T> : never;

const buildFrom = (identity: unknown, named: string | undefined): string =>
  `${(identity as MySchema<unknown>).label}:${named ?? ""}`;

// --- the README's producer, verbatim but for the lambda's handle ------------

interface MyLambda extends TypeLambda, HandleLambda {
  readonly Out: MySchema<this["In"]>;
  readonly Handle: MyBuilderFor<this["Of"]>;
}

const myExtension = (): Extension<MyLambda> => ({
  kind: "producer",
  name: "my-library",

  supports: (identity) => isMySchema(identity),

  /** The README's `produce`, including its `using` third argument. */
  scope: (options, block) =>
    block({
      produce: (identity, named, using) => {
        void options;
        const value = buildFrom(identity, named);

        const built: MyBuilder<string> = {
          value: () => value,
          with: (overrides) => `${value}+${overrides.role}`,
        };

        return using === undefined ? built.value() : using(built);
      },
    }),
});

// --- the README's observer, verbatim ---------------------------------------

let recorded = 0;
const startRecording = () => {
  const at = ++recorded;
  return () => void at;
};

const recorder = (): Extension => ({
  kind: "observer",
  name: "recorder",
  scope: async (options, block) => {
    void options;
    const finish = startRecording();
    try {
      return await block({});
    } finally {
      finish();
    }
  },
});

describe("the README's `## Extensions` snippets", () => {
  it("runs the producer example, with both `produce()` forms", async () => {
    const user = mySchema<string>("user");

    const extern = await initialize({ extensions: [myExtension()] });

    await extern.testing((mock) => {
      mock(user).produce();
      mock(user)
        .named("admin")
        .produce(({ via }) => via.with({ role: "admin" }));

      const plain = extern.typed.by(user).will(() => "original");
      const admin = extern.typed
        .by(user)
        .named("admin")
        .will(() => "original");

      expect(plain).toBe("user:");
      expect(admin).toBe("user:admin+admin");
    });
  });

  it("runs the observer example, leaving every block unchanged", async () => {
    const before = recorded;

    const extern = await initialize({ extensions: [recorder()] });

    /** One identity, bound: `T<>()` mints a fresh one on every call. */
    const count = extern.T<number>();

    await extern.testing((mock) => {
      mock(count).with(1);
      expect(extern.typed.by(count).will(() => 0)).toBe(1);
    });

    expect(recorded).toBe(before + 1);
  });

  it("widens `Identity` per instance, not globally", async () => {
    const extern = await initialize({ extensions: [myExtension()] });
    const other = await initialize();

    const user = mySchema<string>("user");

    extern.typed.by(user);

    // @ts-expect-error — an instance given no extensions is unaffected.
    other.typed.by(user);

    expect(other).toBeDefined();
  });

  it("composes several extensions by appending to the list", async () => {
    const extern = await initialize({
      extensions: [myExtension(), recorder()],
    });

    const user = mySchema<string>("user");

    await extern.testing(() => {
      expect(extern.typed.by(user).will(() => "original")).toBe("user:");
    });
  });
});

import {
  initialize as initializeHarness,
  type Framework as HarnessFramework,
} from "@ghostry/harness";
import { describe, expect, it } from "bun:test";
import { initialize, MockingUnavailableError } from "../src";
import type { Extension, HandleLambda, TypeLambda } from "../src/Extension";
import { integration } from "../src/harnessing";

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
  *frame() {
    yield {
      produce: (
        identity: unknown,
        named: string | undefined,
        using?: (h: unknown) => unknown,
      ) => {
        const value = buildFrom(identity, named);

        const built: MyBuilder<string> = {
          value: () => value,
          with: (overrides) => `${value}+${overrides.role}`,
        };

        return using === undefined ? built.value() : using(built);
      },
    };
  },
});

// --- the README's observer, verbatim ---------------------------------------

const entries: string[] = [];
const record = (what: string) => void entries.push(what);

const recorder = (): Extension => ({
  kind: "observer",
  name: "recorder",
  *frame() {
    record("entered");
    yield {};
  },
});

// --- the README's teardown observer, verbatim ------------------------------

const reports: Array<{ elapsed: number; ok: boolean }> = [];
const report = (elapsed: number, ok: boolean) =>
  void reports.push({ elapsed, ok });

const profiler = (): Extension => ({
  kind: "observer",
  name: "profiler",
  *frame() {
    const started = performance.now();

    const outcome = yield {};

    report(performance.now() - started, outcome.ok);
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
    const before = entries.length;

    const extern = await initialize({ extensions: [recorder()] });

    /** One identity, bound: `T<>()` mints a fresh one on every call. */
    const count = extern.T<number>();

    await extern.testing((mock) => {
      mock(count).with(1);
      expect(extern.typed.by(count).will(() => 0)).toBe(1);
    });

    expect(entries.length).toBe(before + 1);
  });

  /**
   * This observer records on *entry* only — everything before its `yield`. The
   * point of the test is that entry happens exactly once per block and at the
   * same moment whether the body is sync or async, which is what lets the
   * README teach setup and teardown as two halves of one function.
   */
  it("records once per block, for a sync and an async body alike", async () => {
    const extern = await initialize({ extensions: [recorder()] });
    const before = entries.length;

    extern.testing(() => {});
    await extern.testing(async () => {
      await Promise.resolve();
    });

    expect(entries.length).toBe(before + 2);
  });

  it("runs the teardown example, reporting once per block", async () => {
    const extern = await initialize({ extensions: [profiler()] });
    const before = reports.length;

    /** Synchronous body: no promise, and the report lands before the call returns. */
    extern.testing(() => {});
    expect(reports.length).toBe(before + 1);

    /** Asynchronous body: the report waits for the body, not for the first `await`. */
    await extern.testing(async () => {
      await Promise.resolve();
    });

    expect(reports.length).toBe(before + 2);
    expect(reports.every((r) => r.ok)).toBe(true);
  });

  it("reports a failing body as such", async () => {
    const extern = await initialize({ extensions: [profiler()] });

    expect(() =>
      extern.testing(() => {
        throw new Error("nope");
      }),
    ).toThrowError("nope");

    expect(reports[reports.length - 1]?.ok).toBe(false);
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

/**
 * The README's `## Harnessing` snippets, executed as written.
 *
 * The `source.ts` the section imports from is the README's own earlier example,
 * reproduced here as {@link identity}/{@link example}; the framework a real
 * setup hands `initializeHarness` is a recording stand-in, so a registered body
 * can be invoked directly and its return value inspected. Everything the
 * section shows of extern's own surface is otherwise reproduced verbatim, so a
 * snippet that stops being true stops compiling or stops passing.
 */
describe("the README's `## Harnessing` snippets", () => {
  const registered: Array<{
    readonly name: string;
    readonly fn: () => unknown;
  }> = [];
  const suiteHooks: Array<() => unknown> = [];

  const bunTest = {
    describe: (_name: string, fn: () => unknown) => fn(),
    it: (name: string, fn: () => unknown) => void registered.push({ name, fn }),
    test: (name: string, fn: () => unknown) =>
      void registered.push({ name, fn }),
    expect,
    beforeAll: (fn: () => unknown) => void suiteHooks.push(fn),
    afterAll: (fn: () => unknown) => void suiteHooks.push(fn),
  } satisfies HarnessFramework;

  const runAll = (): void => {
    for (const entry of registered.splice(0)) entry.fn();
  };

  const wire = async () => {
    /** `extern.ts`, from the README's opening example. */
    const extern = await initialize({});

    /** `source.ts`, from the same. */
    const identity = extern.T<string>();
    const example = () =>
      extern.typed.by(identity).will(() => "quick" + " brown") + " fox";

    /** `harness.ts`, verbatim but for the instance it closes over. */
    const { describe, it, expect, beforeAll, beforeEach, framework } =
      initializeHarness({
        framework: bunTest,
        integrations: [integration(extern)],
      });

    return {
      extern,
      identity,
      example,
      describe,
      it,
      expect,
      beforeAll,
      beforeEach,
      framework,
    };
  };

  it("substitutes the external interaction, with no `testing` and no `await`", async () => {
    const { identity, example, it, expect: harnessExpect } = await wire();

    it("substitutes the external interaction", ({ extern: { mock } }) => {
      const spy = mock(identity).with("a");

      harnessExpect(example()).toEqual("a fox");
      harnessExpect(spy.executions).toHaveLength(1);
    });

    const registration = registered[registered.length - 1];
    const returned = registration?.fn();

    /** "a synchronous test stays synchronous". */
    expect(returned).toBeUndefined();

    registered.length = 0;
  });

  it("runs the original function under `passthrough()`", async () => {
    const { identity, example, it } = await wire();

    let value: string | undefined;

    it("wants the real thing", ({ extern: { mock } }) => {
      mock(identity).passthrough();
      value = example();
    });

    runAll();

    expect(value).toEqual("quick brown fox");
  });

  it("leaves a body registered through `framework` unframed", async () => {
    const { example, framework } = await wire();

    let value: string | undefined;

    framework.it("is not framed at all", () => {
      value = example();
    });

    runAll();

    expect(value).toEqual("quick brown fox");
  });

  it("refuses the mocker in `beforeAll`, and takes an explicit block instead", async () => {
    const { extern, identity, example, beforeAll } = await wire();

    let refused: unknown;
    let seeded: string | undefined;

    beforeAll(({ extern: { mock } }) => {
      try {
        mock(identity).with("a");
      } catch (error) {
        refused = error;
      }
    });

    beforeAll(async () => {
      await extern.testing((mock) => {
        mock(identity).with("a");
        seeded = example();
      });
    });

    for (const hook of suiteHooks.splice(0)) await hook();

    expect(refused).toBeInstanceOf(MockingUnavailableError);
    expect(seeded).toEqual("a fox");
  });

  it('keeps a `beforeEach` mock live for the body, and `{ unused: "allow" }` tolerant', async () => {
    const {
      identity,
      example,
      it,
      describe: harnessDescribe,
      beforeEach,
    } = await wire();

    let value: string | undefined;

    harnessDescribe("the suite", () => {
      beforeEach(({ extern: { mock } }) => {
        mock(identity).with("a", { unused: "allow" });
      });

      it("uses the shared mock", () => {
        value = example();
      });

      it("does not", () => {});
    });

    expect(runAll).not.toThrow();
    expect(value).toEqual("a fox");
  });
});

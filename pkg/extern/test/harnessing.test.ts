import {
  initialize as initializeHarness,
  type Framework,
} from "@ghostry/harness";
import { describe, expect, it } from "bun:test";
import {
  DuplicateMockError,
  IllegalConcurrencyTestingError,
  initialize,
  MockingUnavailableError,
  NotMockedError,
  T,
  UnusedMocksError,
  type Initialized,
} from "../src";
import { integration, type ExternTestContext } from "../src/harnessing";

/**
 * The integration, driven through the **real** `@ghostry/harness` rather than a
 * stand-in for its composer. What is asserted here is extern's doing — which
 * invocations get a testing block, what the context carries, how mocks and
 * their errors behave — so a harness bug is unlikely to counterfeit one
 * convincingly; but a failure here can now originate in two packages, and the
 * eager-provider and hook-ordering assertions in particular are statements
 * about harness's composer as much as about this integration.
 */

const Id = T<{ readonly id: number }>();

/** Throws if reached, so an unmocked block is never quietly satisfied. */
const block = (extern: Initialized): { readonly id: number } =>
  extern.typed.by(Id).will((): { readonly id: number } => {
    throw new Error("unreachable");
  });

/** The same block, written to be reachable: what an unframed call runs. */
const real = (extern: Initialized): { readonly id: number } =>
  extern.typed.by(Id).will(() => ({ id: -1 }));

/**
 * A recording framework and a harness wrapped around it. Bodies are *invoked
 * directly* rather than by a runner, which is what keeps a return value
 * inspectable — the synchronous cases below assert that nothing in the chain
 * promoted one to a promise.
 */
type Registered = { readonly name: string; readonly fn: () => unknown };

const wire = (extern: Initialized) => {
  const registered: Array<Registered> = [];
  const suiteHooks: Array<() => unknown> = [];

  const framework = {
    describe: (_name: string, fn: () => unknown) => fn(),
    it: (name: string, fn: () => unknown) => void registered.push({ name, fn }),
    test: (name: string, fn: () => unknown) =>
      void registered.push({ name, fn }),
    expect,
    beforeAll: (fn: () => unknown) => void suiteHooks.push(fn),
    afterAll: (fn: () => unknown) => void suiteHooks.push(fn),
  } satisfies Framework;

  const harnessed = initializeHarness({
    framework,
    integrations: [integration(extern)],
  });

  /** Register one body and run it, handing back whatever it returned. */
  const runTest = <$Return>(
    name: string,
    body: (context: Readonly<ExternTestContext>) => $Return,
  ): $Return => {
    const before = registered.length;

    harnessed.it(name, body);

    const added = registered[before];
    if (added === undefined) {
      throw new Error(`\`it(${name})\` registered nothing`);
    }

    return added.fn() as $Return;
  };

  /**
   * `beforeEach`/`afterEach` need a suite to register against — a top-level one
   * raises `AmbientHookError` — so anything exercising them registers inside
   * this.
   */
  const inSuite = (name: string, build: () => void): void => {
    harnessed.describe(name, build);
  };

  /** Run everything a `describe` registered, in order. */
  const runAll = (): void => {
    for (const entry of registered.splice(0)) entry.fn();
  };

  const runSuiteHooks = (): void => {
    for (const hook of suiteHooks.splice(0)) hook();
  };

  return { harnessed, framework, runTest, inSuite, runAll, runSuiteHooks };
};

const isThenable = (value: unknown): boolean =>
  typeof value === "object"
  && value !== null
  && typeof (value as PromiseLike<unknown>).then === "function";

describe("a framed test body", () => {
  it("is a testing block, and a synchronous one stays synchronous", async () => {
    const extern = await initialize({ scope: "async" });
    const { runTest } = wire(extern);

    const result = runTest("mocks", ({ extern: { mock } }) => {
      mock(Id).with({ id: 7 });
      return block(extern);
    });

    expect(isThenable(result)).toBe(false);
    expect(result).toEqual({ id: 7 });
  });

  it("awaits an async body, and checks unused mocks only once it settles", async () => {
    const extern = await initialize({ scope: "async" });
    const { runTest } = wire(extern);

    let settled = false;

    const result = runTest("async", async ({ extern: { mock } }) => {
      mock(Id).with({ id: 8 });
      await Promise.resolve();
      const value = block(extern);
      settled = true;
      return value;
    });

    expect(isThenable(result)).toBe(true);
    expect(settled).toBe(false);
    expect(await result).toEqual({ id: 8 });
    expect(settled).toBe(true);
  });

  it("carries the effect mocker too, not just the value one", async () => {
    const extern = await initialize({ scope: "async" });
    const { runTest } = wire(extern);

    runTest("effects", ({ extern: { mock } }) => {
      const spy = mock.effect.named("sends").observe();

      extern.effect.named("sends").will(() => {
        throw new Error("unreachable");
      });

      expect(spy.executions).toHaveLength(1);
    });
  });

  /**
   * The largest consequence of installing this integration, and the one that
   * reaches tests nobody thinks of as extern tests: every body is now inside a
   * block, so a block that previously ran its original function raises instead.
   */
  it("raises NotMockedError for a block it has no mock for", async () => {
    const extern = await initialize({ scope: "async" });
    const { runTest } = wire(extern);

    expect(() => runTest("unmocked", () => block(extern))).toThrow(
      NotMockedError,
    );
  });
});

describe("isolation between tests", () => {
  it("gives each test its own spies, with no collision across them", async () => {
    const extern = await initialize({ scope: "async" });
    const { runTest } = wire(extern);

    const seen = (name: string, id: number) =>
      runTest(name, ({ extern: { mock } }) => {
        mock(Id).with({ id });
        return block(extern);
      });

    expect(seen("a", 1)).toEqual({ id: 1 });
    expect(seen("b", 2)).toEqual({ id: 2 });

    /** The same identity again, in a third test: a fresh map, not a duplicate. */
    expect(() => seen("c", 3)).not.toThrow(DuplicateMockError);
  });

  it("keeps interleaved async bodies apart under the async scope", async () => {
    const extern = await initialize({ scope: "async" });
    const { runTest } = wire(extern);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const observe = (name: string, id: number) =>
      runTest(name, async ({ extern: { mock } }) => {
        mock(Id).with({ id });
        await gate;
        return block(extern);
      });

    const a = observe("a", 1);
    const b = observe("b", 2);
    release();

    expect(await a).toEqual({ id: 1 });
    expect(await b).toEqual({ id: 2 });
  });
});

describe("hooks", () => {
  /**
   * `beforeEach`/`afterEach` are not separately framed: harness runs them
   * inside the innermost wrapper, around the body. So they are inside the
   * block — a mock defined in one is live for the test, and `afterEach` can
   * still read what it recorded.
   */
  it("runs beforeEach and afterEach inside the block", async () => {
    const extern = await initialize({ scope: "async" });
    const { harnessed, inSuite, runAll } = wire(extern);

    let executions: number | undefined;
    let value: { readonly id: number } | undefined;

    inSuite("suite", () => {
      let spy: { readonly executions: ReadonlyArray<unknown> } | undefined;

      harnessed.beforeEach(({ extern: { mock } }) => {
        spy = mock(Id).with({ id: 9 });
      });

      harnessed.afterEach(() => {
        executions = spy?.executions.length;
      });

      harnessed.it("uses the shared mock", () => {
        value = block(extern);
      });
    });

    runAll();

    expect(value).toEqual({ id: 9 });
    expect(executions).toBe(1);
  });

  it("counts an unused beforeEach mock against the test, unless it is allowed", async () => {
    const extern = await initialize({ scope: "async" });
    const { harnessed, inSuite, runAll } = wire(extern);

    inSuite("strict", () => {
      harnessed.beforeEach(({ extern: { mock } }) => {
        mock(Id).with({ id: 1 });
      });

      harnessed.it("never reaches the block", () => {});
    });

    expect(runAll).toThrow(UnusedMocksError);

    const allowed = wire(extern);

    allowed.inSuite("lenient", () => {
      allowed.harnessed.beforeEach(({ extern: { mock } }) => {
        mock(Id).with({ id: 1 }, { unused: "allow" });
      });

      allowed.harnessed.it("never reaches the block", () => {});
    });

    expect(allowed.runAll).not.toThrow();
  });
});

/**
 * Suite hooks are deliberately unframed. A mock defined in one could never
 * reach a test — every block mints its own spies — so rather than hand out a
 * mocker whose effect is nil, `provides.extern` hands a stand-in that refuses
 * on use.
 */
describe("suite hooks", () => {
  it("leaves blocks reached from beforeAll running their original function", async () => {
    const extern = await initialize({ scope: "async" });
    const { harnessed, runSuiteHooks } = wire(extern);

    let value: { readonly id: number } | undefined;

    harnessed.beforeAll(() => {
      value = real(extern);
    });

    runSuiteHooks();

    expect(value).toEqual({ id: -1 });
  });

  it("refuses the mocker on use, for both halves of it", async () => {
    const extern = await initialize({ scope: "async" });
    const { harnessed, runSuiteHooks } = wire(extern);

    const refused: Array<unknown> = [];

    harnessed.beforeAll((context) => {
      expect(() => context.extern.mock(Id)).toThrow(MockingUnavailableError);

      /**
       * Reached through the `effect` member, which exists only because the
       * stand-in carries one: without it this would be a `TypeError` on
       * property access rather than the error the refusal exists to raise.
       */
      expect(() => context.extern.mock.effect.named("sends")).toThrow(
        MockingUnavailableError,
      );

      refused.push("beforeAll");
    });

    harnessed.afterAll((context) => {
      expect(() => context.extern.mock(Id)).toThrow(MockingUnavailableError);
      refused.push("afterAll");
    });

    runSuiteHooks();

    expect(refused).toEqual(["beforeAll", "afterAll"]);
  });

  /**
   * The reason the refusal is a stand-in rather than a throwing provider:
   * harness runs every provider eagerly on every framed invocation, touched or
   * not, so a throwing one would fail every suite hook in the suite.
   */
  it("runs a suite hook that never reaches for a mocker cleanly", async () => {
    const extern = await initialize({ scope: "async" });
    const { harnessed, runSuiteHooks } = wire(extern);

    let ran = 0;

    harnessed.beforeAll(() => {
      ran += 1;
    });

    expect(runSuiteHooks).not.toThrow();
    expect(ran).toBe(1);
  });
});

describe("errors out of a framed body", () => {
  it("reports an unused mock the body itself defined", async () => {
    const extern = await initialize({ scope: "async" });
    const { runTest } = wire(extern);

    expect(() =>
      runTest("unused", ({ extern: { mock } }) => {
        mock(Id).with({ id: 1 });
      }),
    ).toThrow(UnusedMocksError);
  });

  /**
   * The body's own failure is what the reader needs to see, so the unused-mock
   * check never runs ahead of it — on either settlement path.
   */
  it("lets the body's own error through ahead of the unused-mock check", async () => {
    const extern = await initialize({ scope: "async" });
    const { runTest } = wire(extern);

    expect(() =>
      runTest("throws", ({ extern: { mock } }) => {
        mock(Id).with({ id: 1 });
        throw new Error("from the body");
      }),
    ).toThrow("from the body");

    const rejected = runTest("rejects", async ({ extern: { mock } }) => {
      mock(Id).with({ id: 1 });
      throw new Error("from the async body");
    });

    await expect(rejected).rejects.toThrow("from the async body");
  });
});

describe("an explicit block nested inside a framed one", () => {
  /**
   * The likeliest thing a suite adopting this integration already contains.
   * Under the async scope it shadows: the inner block gets a fresh spy map, so
   * the enclosing test's mocks are invisible inside it — quiet, and worth
   * knowing before it is met in the wild.
   */
  it("shadows under the async scope rather than merging", async () => {
    const extern = await initialize({ scope: "async" });
    const { runTest } = wire(extern);

    runTest("nested", ({ extern: { mock } }) => {
      mock(Id).with({ id: 1 });

      expect(() => extern.testing(() => block(extern))).toThrow(NotMockedError);

      /** The enclosing block is intact once the inner one has closed. */
      expect(block(extern)).toEqual({ id: 1 });
    });
  });

  it("is refused outright under the sync scope", async () => {
    const extern = await initialize({ scope: "sync" });
    const { runTest } = wire(extern);

    runTest("nested", ({ extern: { mock } }) => {
      mock(Id).with({ id: 1 });

      expect(() => extern.testing(() => undefined)).toThrow(
        IllegalConcurrencyTestingError,
      );

      expect(block(extern)).toEqual({ id: 1 });
    });
  });
});

/**
 * With every test body inside a block, the sync scope's one-at-a-time rule
 * becomes a rule about tests rather than about explicit `testing` calls.
 */
it("refuses concurrent framed bodies under the sync scope", async () => {
  const extern = await initialize({ scope: "sync" });
  const { runTest } = wire(extern);

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const first = runTest("first", async ({ extern: { mock } }) => {
    mock(Id).with({ id: 1 });
    await gate;
    return block(extern);
  });

  expect(() => runTest("second", () => undefined)).toThrow(
    IllegalConcurrencyTestingError,
  );

  release();
  expect(await first).toEqual({ id: 1 });
});

describe("the rest of the surface", () => {
  it("frames each row of an `.each` table, with `row` alongside `extern`", async () => {
    const extern = await initialize({ scope: "async" });
    const { harnessed, runAll } = wire(extern);

    const seen: Array<{ readonly row: number; readonly value: number }> = [];

    harnessed.it.each([10, 20])("row %s", ({ extern: { mock }, row }) => {
      mock(Id).with({ id: row });
      seen.push({ row, value: block(extern).id });
    });

    runAll();

    expect(seen).toEqual([
      { row: 10, value: 10 },
      { row: 20, value: 20 },
    ]);
  });

  /**
   * `framework` is harness's escape hatch — the unchanged module. A body
   * registered through it is never framed, which is the way out for a test that
   * genuinely wants its extern blocks to run for real.
   */
  it("leaves a body registered through `framework` unframed", async () => {
    const extern = await initialize({ scope: "async" });
    const { harnessed, framework, runAll } = wire(extern);

    let value: { readonly id: number } | undefined;

    harnessed.framework.it("unframed", () => {
      value = real(extern);
    });

    expect(harnessed.framework).toBe(framework);

    runAll();

    expect(value).toEqual({ id: -1 });
  });
});

import { initialize as initializeExtern } from "@ghostry/extern";
import { initialize as initializeFabricator } from "@ghostry/fabricator";
import { describe, expect, it } from "bun:test";
import { fabricatorExtension } from "../src";
import { fabricateElsewhere } from "./fixtures/elsewhere";

const fabricator = initializeFabricator({ seed: "determinism-suite" });
const { T } = fabricator;

type Id = { id: number };
const schema = T.object({ id: T.number });
const other = T.object({ n: T.number });

const extern = await initializeExtern({
  scope: "async",
  extensions: [fabricatorExtension({ instance: fabricator })],
});

const block = (): Id =>
  extern.typed.by(schema).will((): Id => {
    throw new Error("unreachable");
  });

const named = (name: string): Id =>
  extern.typed
    .by(schema)
    .named(name)
    .will((): Id => {
      throw new Error("unreachable");
    });

describe("within one testing block", () => {
  it("reads the same value twice", async () => {
    await extern.testing(() => {
      expect(block()).toEqual(block());
    });
  });

  /**
   * The cache is what makes this hold, and it is load-bearing rather than an
   * optimization: a fabrication's distinctness comes from the scope's
   * construction ordinal, so asking twice without it would draw twice.
   */
  it("reads the same value twice under an explicit `produce()`", async () => {
    await extern.testing((mock) => {
      mock(schema).produce();

      expect(block()).toEqual(block());
    });
  });
});

describe("across testing blocks", () => {
  it("fabricates the same value in independent `testing()` calls", async () => {
    let first: Id | undefined;
    let second: Id | undefined;

    await extern.testing(() => void (first = block()));
    await extern.testing(() => void (second = block()));

    expect(first).toEqual(second!);
  });

  /**
   * Each block's stream is keyed by its own identity and name, so introducing
   * an unrelated block between two runs must not shift either.
   */
  it("is unperturbed by an unrelated block sandwiched between", async () => {
    let before: Id | undefined;
    let after: Id | undefined;

    await extern.testing(() => void (before = block()));

    await extern.testing(() => {
      extern.typed.by(other).will((): { n: number } => {
        throw new Error("unreachable");
      });
    });

    await extern.testing(() => void (after = block()));

    expect(before).toEqual(after!);
  });
});

describe("the per-file seed layer", () => {
  /**
   * Keyed on the file that opened the testing block, not on the file the
   * `by()` call sits in — so this compares two `testing()` call sites, not two
   * block bodies.
   */
  it("draws differently for the same schema from another file", async () => {
    let here: Id | undefined;

    await extern.testing(() => void (here = block()));

    const there = await fabricateElsewhere<Id>(extern, schema);

    expect(here).toBeDefined();
    expect(here).not.toEqual(there);
  });
});

describe("the production cache", () => {
  /**
   * Keyed on `(identity, named)`, so one schema reached through two different
   * helpers inside one block is a single production — the second read returns
   * the first's value rather than drawing again. Worth pinning down: the
   * intuitive guess is that two syntactically distinct call sites fabricate
   * separately, and they do not.
   */
  it("serves one value for one identity, however many call sites read it", async () => {
    await extern.testing(() => {
      const direct = block();

      const throughHelper = ((): Id =>
        extern.typed.by(schema).will((): Id => {
          throw new Error("unreachable");
        }))();

      expect(direct).toEqual(throughHelper);
    });
  });
});

describe("concurrency", () => {
  /**
   * Two named blocks resolved under `Promise.all`. Their values must depend on
   * their names, not on the order they happen to settle in — otherwise a
   * suite's data would shift with scheduling.
   */
  it("keeps named blocks stable regardless of settle order", async () => {
    const run = async (): Promise<[Id, Id]> => {
      let a: Id | undefined;
      let b: Id | undefined;

      await extern.testing(async () => {
        const [x, y] = await Promise.all([
          (async () => {
            await Promise.resolve();
            return named("alpha");
          })(),
          (async () => named("beta"))(),
        ]);
        a = x;
        b = y;
      });

      return [a!, b!];
    };

    const first = await run();
    const second = await run();

    expect(first[0]).toEqual(second[0]);
    expect(first[1]).toEqual(second[1]);
    expect(first[0]).not.toEqual(first[1]);
  });
});

describe("a user's own ambient construction", () => {
  /**
   * Deliberately *not* equal to the block's own value. Both draw from the same
   * scope, so they take successive ordinals — an ambient `fabricate()` is a
   * fresh draw, not a second view of the block's. Recorded because the
   * opposite is the intuitive guess, and a reader who assumes it would write
   * a test that passes for the wrong reason.
   */
  it("draws distinctly from the block's own fabrication", async () => {
    await extern.testing(() => {
      const fromBlock = block();
      const ambient = new fabricator.Fabricator(schema).fabricate();

      expect(ambient).not.toEqual(fromBlock);
    });
  });

  it("is itself deterministic across the await boundary", async () => {
    let sync: unknown;
    let afterAwait: unknown;

    await extern.testing(() => {
      sync = new fabricator.Fabricator(schema).fabricate();
    });

    await extern.testing(async () => {
      await Promise.resolve();
      afterAwait = new fabricator.Fabricator(schema).fabricate();
    });

    expect(sync).toEqual(afterAwait);
  });
});

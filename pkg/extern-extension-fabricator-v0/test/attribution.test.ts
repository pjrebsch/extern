import { initialize as initializeExtern } from "@ghostry/extern";
import { initialize as initializeFabricator } from "@ghostry/fabricator";
import { describe, expect, it } from "bun:test";
import { fabricatorExtension } from "../src";
import { loadUserService } from "./fixtures/service";

const fabricator = initializeFabricator({ seed: "attribution-suite" });
const { T } = fabricator;

const schema = T.object({ id: T.number });

const extern = await initializeExtern({
  scope: "async",
  extensions: [fabricatorExtension({ instance: fabricator })],
});

/**
 * Reads the file a fabrication was actually attributed to, through the handle
 * `produce()` hands the callback. Asserted *directly*, which is the whole
 * point: a root scoped too narrowly leaves extern's own frames eligible for
 * the stack walk, and the walk then names extern's internals instead of the
 * caller. That failure is masked wherever the call into this package sits in
 * tail position, so it cannot be caught reliably by observing fabricated
 * values downstream.
 */
const attributedFile = async (): Promise<string | undefined> => {
  let file: string | undefined;

  await extern.testing((mock) => {
    mock(schema).produce(({ via }) => {
      file = via.trace.file;
      return via.fabricate();
    });

    extern.typed.by(schema).will((): { id: number } => {
      throw new Error("unreachable");
    });
  });

  return file;
};

/**
 * Two *different* files feed one fabrication, and conflating them is easy:
 *
 * - the **seed layer** comes from the file that opened the testing block —
 *   whichever file called `extern.testing(...)`, i.e. the test;
 * - the **attribution** comes from the file that wrote the `by(...)` call —
 *   in ordinary use a source file, since that is where extern blocks live.
 *
 * Every other test here happens to write its block inline, which makes the two
 * coincide and hides the distinction. This one keeps them apart.
 */
describe("the two files behind one fabrication", () => {
  it("attributes to the file that wrote `by()`, not the file that ran the test", async () => {
    let file: string | undefined;
    let seed: ReadonlyArray<string> | undefined;

    await extern.testing((mock) => {
      mock(schema).produce(({ via }) => {
        file = via.trace.file;
        seed = via.trace.seed;
        return via.fabricate();
      });

      loadUserService<{ id: number }>(extern, schema);
    });

    /** The block lives in the fixture, so that is what it is attributed to. */
    expect(file).toContain("fixtures/service");
    expect(file).not.toContain("attribution.test");

    /** The seed layer, meanwhile, names the file that opened the block. */
    expect(seed).toContain("attribution.test.ts");
  });
});

describe("file attribution", () => {
  it("names this test file, not extern's internals or this package's", async () => {
    const file = await attributedFile();

    expect(file).toBeDefined();
    expect(file).toContain("attribution.test");

    /**
     * The three roots that must all have been walked past: fabricator's own
     * (which it always skips), this package's, and every one extern hands over
     * — `typed/Core.ts` above all, since that is what sits closest to the
     * caller and is the easiest to stop at by accident.
     */
    expect(file).not.toContain("typed/Core");
    expect(file).not.toContain("extern-extension-fabricator");
    expect(file).not.toContain("node_modules");
  });

  it("carries no `:line:col`, so the layer is per-file", async () => {
    const file = await attributedFile();

    expect(file).not.toMatch(/:\d+:\d+$/);
  });

  /**
   * Anchored to the instance's own attribution root, never to `process.cwd()`
   * — which differs between a repo-root `bun test` and a package-directory
   * one, and would silently re-seed every fabricated value in the suite
   * depending on how the command was invoked.
   */
  it("is unaffected by the directory the test command was run from", async () => {
    const before = await attributedFile();

    const cwd = process.cwd();
    try {
      process.chdir("/");
      const elsewhere = await attributedFile();

      expect(elsewhere).toBe(before);
    } finally {
      process.chdir(cwd);
    }
  });
});

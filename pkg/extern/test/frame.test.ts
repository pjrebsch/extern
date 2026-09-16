import { describe, expect, it, spyOn } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { initialize } from "../src";
import {
  CleanupFailedError,
  ExtensionFrameResultError,
  ExtensionFrameSessionError,
  ExtensionFrameYieldError,
} from "../src/Error";
import type { Extension } from "../src/Extension";

/**
 * The two hazards a per-block extension scope has to get right, each written the
 * way an extension author would naturally write it.
 *
 * Neither is about *capability* — both are expressible under any contract if you
 * already know the trap. They are about whether the obvious code is the correct
 * code, which is the property worth protecting: a scope that brackets a block,
 * and a scope whose own setup fails partway.
 */

/** Stands in for any resource an extension establishes for the block's duration. */
type Pool = { acquired: number; released: number };

const pool = (): Pool => ({ acquired: 0, released: 0 });

describe("trap 1: the extension's own setup throws", () => {
  /**
   * The natural shape: acquire, derive something from what was acquired, hand
   * the session over. The derivation throws, so the block never runs and the
   * session is never yielded — the window in which nothing outside the
   * extension knows a resource is outstanding. Setup and teardown sharing one
   * `try` is what closes it: the `finally` releases anyway.
   */
  const leaky = (p: Pool): Extension => ({
    kind: "observer",
    name: "leaky",
    *frame() {
      p.acquired += 1;

      try {
        /** Derived from the handle, and fallible — a connection's handshake, say. */
        const derive = (): string => {
          throw new Error("setup failed");
        };

        const label = derive();

        yield { produce: () => label };
      } finally {
        p.released += 1;
      }
    },
  });

  it("releases what it acquired", async () => {
    const p = pool();
    const extern = await initialize({ extensions: [leaky(p)] });

    expect(() => extern.testing(() => {})).toThrowError("setup failed");

    expect(p.acquired).toBe(1);
    expect(p.released).toBe(1);
  });
});

describe("trap 2: teardown written as a bracket around the body", () => {
  /**
   * The natural shape for "do something before and after the block", and under
   * the frame contract it is also the correct one: the `yield` suspends, so the
   * `finally` runs when the block finishes rather than when setup returns.
   */
  const bracketing = (log: string[]): Extension => ({
    kind: "observer",
    name: "bracketing",
    *frame() {
      log.push("open");

      try {
        yield {};
      } finally {
        log.push("close");
      }
    },
  });

  it("closes after a synchronous body", async () => {
    const log: string[] = [];
    const extern = await initialize({ extensions: [bracketing(log)] });

    extern.testing(() => void log.push("body"));

    expect(log).toEqual(["open", "body", "close"]);
  });

  it("closes after an asynchronous body", async () => {
    const log: string[] = [];
    const extern = await initialize({ extensions: [bracketing(log)] });

    await extern.testing(async () => {
      await Promise.resolve();
      log.push("body");
    });

    expect(log).toEqual(["open", "body", "close"]);
  });

  /** A failing body still reaches the `finally`, and its error still wins. */
  it("closes after a failing body, without displacing its error", async () => {
    const log: string[] = [];
    const extern = await initialize({ extensions: [bracketing(log)] });

    expect(() =>
      extern.testing(() => {
        throw new Error("body failed");
      }),
    ).toThrowError("body failed");

    expect(log).toEqual(["open", "close"]);
  });
});

describe("a wrapper's scope reaches its own teardown", () => {
  /**
   * The load-bearing detail of the descent: the resumption is chained *inside*
   * the wrapper's callback. A continuation runs in the async context active
   * where it was chained, so resuming from outside would find the
   * `AsyncLocalStorage` frame the wrapper opened already gone.
   *
   * A synchronous body would look correct either way, so the async case is what
   * actually pins it.
   */
  const store = new AsyncLocalStorage<string>();

  const scoped = (seen: string[]): Extension => ({
    kind: "observer",
    name: "scoped",
    *frame() {
      try {
        yield (body) => store.run("inside", () => body({}));
      } finally {
        seen.push(`teardown:${store.getStore() ?? "gone"}`);
      }
    },
  });

  it("sees the scope in teardown after an async body", async () => {
    const seen: string[] = [];
    const extern = await initialize({ extensions: [scoped(seen)] });

    await extern.testing(async () => {
      await Promise.resolve();
      seen.push(`body:${store.getStore() ?? "gone"}`);
    });

    expect(seen).toEqual(["body:inside", "teardown:inside"]);
  });
});

describe("the frame guards", () => {
  /** Each needs a cast: the types already rule these out. */
  const malformed = (frame: unknown): Extension =>
    ({ kind: "observer", name: "malformed", frame }) as unknown as Extension;

  it("refuses a `frame` that is not a generator", async () => {
    const extern = await initialize({
      extensions: [malformed(() => ({ produce: () => 1 }))],
    });

    expect(() => extern.testing(() => {})).toThrowError(
      ExtensionFrameResultError,
    );
  });

  it("refuses a `yield` carrying neither a session nor a wrapper", async () => {
    const extern = await initialize({
      extensions: [
        malformed(function* () {
          yield 42;
        }),
      ],
    });

    expect(() => extern.testing(() => {})).toThrowError(
      ExtensionFrameSessionError,
    );
  });

  it("refuses a frame that never yields", async () => {
    const extern = await initialize({
      extensions: [malformed(function* () {})],
    });

    expect(() => extern.testing(() => {})).toThrowError(
      ExtensionFrameYieldError,
    );
  });

  /**
   * Detected on resumption rather than on the way in, which is to say during
   * teardown — so it arrives as a teardown fault, collected and reported like
   * any other. The guard still fires; it is simply wrapped.
   */
  it("refuses a second `yield`, as a teardown fault", async () => {
    const extern = await initialize({
      extensions: [
        malformed(function* () {
          yield {};
          yield {};
        }),
      ],
    });

    const error = spyOn(console, "error");
    error.mockImplementation(() => {});

    try {
      extern.testing(() => {});
      throw new Error("expected a cleanup failure");
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(CleanupFailedError);
      if (thrown instanceof CleanupFailedError) {
        expect(thrown.errors).toHaveLength(1);
        expect(thrown.errors[0]).toBeInstanceOf(ExtensionFrameYieldError);
      }
    } finally {
      error.mockRestore();
    }
  });
});

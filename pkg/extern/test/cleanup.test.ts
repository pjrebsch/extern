import { describe, expect, it } from "bun:test";
import * as S from "sury";
import { initialize } from "../src";
import { CleanupFailedError } from "../src/Error";
import type { Extension } from "../src/Extension";
import { isThenable } from "../src/Util";
import { boxed, type BoxedLambda } from "./fixtures/extension";

/**
 * An observer with teardown, written the way an extension author writes one: the
 * cleanup rides on the session the scope already yields, so it closes over
 * whatever that scope established with nothing threaded in between.
 */
const observer = (log: string[], name: string): Extension => ({
  kind: "observer",
  name,
  *frame() {
    log.push(`${name}:enter`);

    const outcome = yield {};

    log.push(`${name}:cleanup:${outcome.ok ? "ok" : "failed"}`);
  },
});

/** The same, but its teardown is itself asynchronous. */
const slowObserver = (log: string[], name: string): Extension => ({
  kind: "observer",
  name,
  async *frame() {
    try {
      yield {};
    } finally {
      await Promise.resolve();
      log.push(`${name}:cleanup`);
    }
  },
});

describe("frame teardown", () => {
  describe("a synchronous body", () => {
    it("stays synchronous, and tears down at the body's end", async () => {
      const log: string[] = [];
      const extern = await initialize({ extensions: [observer(log, "a")] });

      const result = extern.testing(() => void log.push("body"));

      expect(isThenable(result)).toBe(false);
      expect(log).toEqual(["a:enter", "body", "a:cleanup:ok"]);
    });

    it("passes the body's return value through untouched", async () => {
      const sentinel = { ok: true };
      const extern = await initialize({ extensions: [observer([], "a")] });

      expect(extern.testing(() => sentinel)).toBe(sentinel);
    });
  });

  /**
   * The case a `finally` around `block(...)` gets wrong: it would fire at the
   * body's first `await`, landing between `body:before` and `body:after`.
   */
  describe("an asynchronous body", () => {
    it("tears down at settlement, not at the first `await`", async () => {
      const log: string[] = [];
      const extern = await initialize({ extensions: [observer(log, "a")] });

      await extern.testing(async () => {
        log.push("body:before");
        await Promise.resolve();
        log.push("body:after");
      });

      expect(log).toEqual([
        "a:enter",
        "body:before",
        "body:after",
        "a:cleanup:ok",
      ]);
    });
  });

  describe("across several extensions", () => {
    it("tears down inner-first, with no coordination between them", async () => {
      const log: string[] = [];
      const extern = await initialize({
        extensions: [observer(log, "outer"), observer(log, "inner")],
      });

      await extern.testing(async () => {
        await Promise.resolve();
        log.push("body");
      });

      expect(log).toEqual([
        "outer:enter",
        "inner:enter",
        "body",
        "inner:cleanup:ok",
        "outer:cleanup:ok",
      ]);
    });

    it("runs an outer cleanup only once an inner async one has settled", async () => {
      const log: string[] = [];
      const extern = await initialize({
        extensions: [slowObserver(log, "outer"), slowObserver(log, "inner")],
      });

      await extern.testing(() => void log.push("body"));

      expect(log).toEqual(["body", "inner:cleanup", "outer:cleanup"]);
    });
  });

  describe("when the body fails", () => {
    it("reports the failure to every cleanup and rethrows it", async () => {
      const log: string[] = [];
      const boom = new Error("boom");
      const extern = await initialize({
        extensions: [observer(log, "outer"), observer(log, "inner")],
      });

      expect(() =>
        extern.testing(() => {
          throw boom;
        }),
      ).toThrowError(boom);

      expect(log).toEqual([
        "outer:enter",
        "inner:enter",
        "inner:cleanup:failed",
        "outer:cleanup:failed",
      ]);
    });
  });

  describe("when cleanups throw", () => {
    const throwing = (name: string, error: Error): Extension => ({
      kind: "observer",
      name,
      *frame() {
        try {
          yield {};
        } finally {
          throw error;
        }
      },
    });

    it("propagates the failure when the body succeeded", async () => {
      const teardown = new Error("teardown");
      const extern = await initialize({
        extensions: [throwing("a", teardown)],
      });

      expect(() => extern.testing(() => {})).toThrowError(CleanupFailedError);
    });

    /**
     * The point of the shared list: a throwing cleanup does not stop a sibling,
     * and every failure is reported once rather than one scope at a time.
     */
    it("collects failures from separate scopes into one error", async () => {
      const outerError = new Error("outer teardown");
      const innerError = new Error("inner teardown");
      const extern = await initialize({
        extensions: [
          throwing("outer", outerError),
          throwing("inner", innerError),
        ],
      });

      try {
        extern.testing(() => {});
        expect.unreachable();
      } catch (thrown) {
        expect(thrown).toBeInstanceOf(CleanupFailedError);
        expect((thrown as CleanupFailedError).errors).toEqual([
          innerError,
          outerError,
        ]);
      }
    });

    /**
     * The body's error is the one worth reading, so it wins. The teardown
     * failure is logged rather than dropped.
     */
    it("keeps the body's error when the body also failed", async () => {
      const body = new Error("the-real-failure");
      const extern = await initialize({
        extensions: [throwing("a", new Error("teardown-noise"))],
      });

      expect(() =>
        extern.testing(() => {
          throw body;
        }),
      ).toThrowError(body);
    });
  });

  describe("for a producer", () => {
    const producing = (log: string[]): Extension<BoxedLambda> => ({
      kind: "producer",
      name: "boxed",
      supports: (identity) =>
        typeof identity === "object"
        && identity !== null
        && "label" in identity,
      *frame() {
        const outcome = yield {
          produce: (identity: unknown) =>
            `${(identity as { label: string }).label}!`,
        };

        log.push(`cleanup:${outcome.ok ? "ok" : "failed"}`);
      },
    });

    it("produces values and still tears down at settlement", async () => {
      const log: string[] = [];
      const extern = await initialize({ extensions: [producing(log)] });
      const schema = boxed<string>("a");

      await extern.testing(async () => {
        await Promise.resolve();
        log.push(extern.typed.by(schema).will(() => "x"));
      });

      expect(log).toEqual(["a!", "cleanup:ok"]);
    });
  });

  describe("alongside extern's own checks", () => {
    it("settles every cleanup before the unused-mock check fires", async () => {
      const log: string[] = [];
      const extern = await initialize({ extensions: [observer(log, "a")] });

      expect(() =>
        extern.testing((mock) => {
          mock(S.number).with(1);
        }),
      ).toThrowError(/did not get used/);

      expect(log).toEqual(["a:enter", "a:cleanup:ok"]);
    });

    it("leaves an extension with no cleanup entirely uninstrumented", async () => {
      const bare: Extension = {
        kind: "observer",
        name: "bare",
        *frame() {
          yield {};
        },
      };
      const boom = new Error("boom");
      const extern = await initialize({ extensions: [bare] });

      expect(() =>
        extern.testing(() => {
          throw boom;
        }),
      ).toThrowError(boom);
    });
  });
});

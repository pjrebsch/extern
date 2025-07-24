import * as S from "sury";
import { describe, expect, it } from "vitest";
import { initialize } from "../src";

describe("`extern.typed`", async () => {
  const extern = await initialize();

  describe("`by()`", () => {
    const schema = S.number;
    const subject = extern.typed.by(schema);

    it("returns from `will()`", () => {
      const result = subject.will(() => 123);

      expect(result).toBe(123);
    });

    describe("an async `will()` function", () => {
      it("returns a promise", async () => {
        const result = subject.will(async () => 123);

        await expect(result).resolves.toBe(123);
      });
    });

    describe("returning incorrect type", () => {
      it("returns the incorrectly typed data", () => {
        const result = subject.will(
          () =>
            /* @ts-expect-error */
            "abc",
        );

        expect(result).toBe("abc");
      });
    });

    describe("`named()`", () => {
      const subject = extern.typed.by(schema).named("abc");

      it("returns from `will()`", () => {
        const result = subject.will(() => 123);

        expect(result).toBe(123);
      });

      describe("an async `will()` function", () => {
        it("returns a promise", async () => {
          const result = subject.will(async () => 123);

          await expect(result).resolves.toBe(123);
        });
      });

      describe("returning incorrect type", () => {
        it("returns the incorrectly typed data", () => {
          const result = subject.will(
            () =>
              /* @ts-expect-error */
              "abc",
          );

          expect(result).toBe("abc");
        });
      });

      describe("`given()`", () => {
        const subject = extern.typed.by(schema).named("abc").given(987);

        it("returns from `will()`", () => {
          const result = subject.will((given) => 123 + given);

          expect(result).toBe(1110);
        });

        describe("an async `will()` function", () => {
          it("returns a promise", async () => {
            const result = subject.will(async (given) => 123 + given);

            await expect(result).resolves.toBe(1110);
          });
        });

        describe("returning incorrect type", () => {
          it("returns the incorrectly typed data", () => {
            const result = subject.will(
              () =>
                /* @ts-expect-error */
                "abc",
            );

            expect(result).toBe("abc");
          });
        });
      });
    });

    describe("`given()`", () => {
      const subject = extern.typed.by(S.number).given(987);

      it("returns from `will()`", () => {
        const result = subject.will((given) => 123 + given);

        expect(result).toBe(1110);
      });

      describe("an async `will()` function", () => {
        it("returns a promise", async () => {
          const result = subject.will(async (given) => 123 + given);

          await expect(result).resolves.toBe(1110);
        });
      });
    });
  });
});

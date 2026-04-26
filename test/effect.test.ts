import { describe, expect, expectTypeOf, it } from "bun:test";
import { initialize } from "../src";
import type { Promisable } from "../src/Types";

describe("`extern.effect`", async () => {
  const extern = await initialize();

  describe("`will()`", () => {
    const subject = extern.effect;

    it("runs the function", async () => {
      let ran = false;

      await subject.will(() => {
        ran = true;
      });

      expect(ran).toBe(true);
    });

    it("returns void", () => {
      const result = subject.will(() => {});

      expectTypeOf<typeof result>().toEqualTypeOf<void>();

      expect(result).toBeUndefined();
    });

    describe("an async `will()` function", () => {
      it("awaits the function", async () => {
        let ran = false;

        await subject.will(async () => {
          ran = true;
        });

        expect(ran).toBe(true);
      });

      it("returns a Promise<void>", async () => {
        const result = subject.will(async () => {});

        expectTypeOf<typeof result>().toEqualTypeOf<Promise<void>>();

        await expect(result).resolves.toBeUndefined();
      });
    });

    describe("returning a non-void value", () => {
      it("returns a Promisable<void>", () => {
        const result = subject.will(
          () =>
            /* @ts-expect-error */
            123,
        );

        expectTypeOf<typeof result>().toEqualTypeOf<Promisable<void>>();
      });
    });
  });

  describe("`named()`", () => {
    const subject = extern.effect.named("abc");

    describe("`will()`", () => {
      it("runs the function", async () => {
        let ran = false;

        await subject.will(() => {
          ran = true;
        });

        expect(ran).toBe(true);
      });

      it("returns void", () => {
        const result = subject.will(() => {});

        expectTypeOf<typeof result>().toEqualTypeOf<void>();

        expect(result).toBeUndefined();
      });

      describe("an async `will()` function", () => {
        it("awaits the function", async () => {
          let ran = false;

          await subject.will(async () => {
            ran = true;
          });

          expect(ran).toBe(true);
        });

        it("returns a Promise<void>", async () => {
          const result = subject.will(async () => {});

          expectTypeOf<typeof result>().toEqualTypeOf<Promise<void>>();

          await expect(result).resolves.toBeUndefined();
        });
      });

      describe("returning a non-void value", () => {
        it("returns a Promisable<void>", () => {
          const result = subject.will(
            () =>
              /* @ts-expect-error */
              123,
          );

          expectTypeOf<typeof result>().toEqualTypeOf<Promisable<void>>();
        });
      });
    });

    describe("`given()`", () => {
      const subject = extern.effect.named("abc").given(987);

      describe("`will()`", () => {
        it("runs the function with the given value", async () => {
          let received: number | undefined;

          await subject.will((given) => {
            received = given;
          });

          expect(received).toBe(987);
        });

        it("returns void", () => {
          const result = subject.will(() => {});

          expectTypeOf<typeof result>().toEqualTypeOf<void>();

          expect(result).toBeUndefined();
        });

        describe("an async `will()` function", () => {
          it("awaits the function with the given value", async () => {
            let received: number | undefined;

            await subject.will(async (given) => {
              received = given;
            });

            expect(received).toBe(987);
          });

          it("returns a Promise<void>", async () => {
            const result = subject.will(async () => {});

            expectTypeOf<typeof result>().toEqualTypeOf<Promise<void>>();

            await expect(result).resolves.toBeUndefined();
          });
        });

        describe("returning a non-void value", () => {
          it("returns a Promisable<void>", () => {
            const result = subject.will(
              () =>
                /* @ts-expect-error */
                123,
            );

            expectTypeOf<typeof result>().toEqualTypeOf<Promisable<void>>();
          });
        });

        describe("with a literal given value", () => {
          it("narrows the parameter type to the literal", () => {
            const subject = extern.effect.named("abc").given("literal");

            subject.will((given) => {
              expectTypeOf<typeof given>().toEqualTypeOf<"literal">();
            });
          });
        });
      });
    });
  });
});

import {
  initialize as initializeExtern,
  NotMockedError,
  UnusedMocksError,
  type Initialized,
} from "@ghostry/extern";
import { initialize as initializeFabricator } from "@ghostry/fabricator";
import { describe, expect, it } from "bun:test";
import * as S from "sury";
import { fabricatorExtension, type FabricatorLambda } from "../src";

const fabricator = initializeFabricator({ seed: "fabrication-suite" });
const { T } = fabricator;

const schema = T.object({
  id: T.number,
  name: T.string.whereby({ length: { max: 10 } }),
});

type User = { id: number; name: string };

/**
 * Throws rather than returning: the original function must never run when a
 * block fabricates, and a test that silently fell through to it would
 * otherwise pass on the wrong value.
 */
const block = (extern: Initialized<FabricatorLambda>): User =>
  extern.typed.by(schema).will((): User => {
    throw new Error("the original function must not run when producing");
  });

describe("implicit fabrication", async () => {
  const extern = await initializeExtern({
    scope: "async",
    extensions: [fabricatorExtension({ instance: fabricator })],
  });

  it("fabricates a value in place of an explicit mock", async () => {
    await extern.testing(() => {
      expect(block(extern)).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
      });
    });
  });

  it("leaves a non-fabricator identity throwing `NotMockedError`", async () => {
    await extern.testing(() => {
      expect(() =>
        extern.typed.by(S.number).will(() => {
          throw new Error("unreachable");
        }),
      ).toThrowError(NotMockedError);
    });
  });

  it("is overridden outright by an explicit `with()`", async () => {
    const substitute: User = { id: 1, name: "explicit" };

    await extern.testing((mock) => {
      mock(schema).with(substitute);

      expect(block(extern)).toBe(substitute);
    });
  });

  /**
   * The identity is keyed per schema, not per block, so one helper standing in
   * front of `by()` still fabricates the right shape for each.
   */
  it("serves several schemas reached through one generic helper", async () => {
    const other = T.object({ n: T.number });

    /**
     * The cast is the generic's fault, not the helper's: `will` returns
     * `Promised<$T, $T>`, which is `$T` for every non-promise `$T` but not
     * something TypeScript can prove while `$T` is still open.
     */
    const via = <$T>(s: Parameters<typeof extern.typed.by<$T>>[0]): $T =>
      extern.typed.by(s).will((): $T => {
        throw new Error("unreachable");
      }) as $T;

    await extern.testing(() => {
      expect(via<User>(schema)).toMatchObject({ id: expect.any(Number) });
      expect(via<{ n: number }>(other)).toMatchObject({
        n: expect.any(Number),
      });
    });
  });

  it("accepts a built Fabricator as an identity, exactly like a raw schema", async () => {
    const built = new fabricator.Fabricator(schema);

    await extern.testing(() => {
      const value = extern.typed.by(built).will((): User => {
        throw new Error("unreachable");
      });

      expect(value).toMatchObject({ id: expect.any(Number) });
    });
  });

  it("still raises `UnusedMocksError` for a mock that never runs", async () => {
    expect(
      extern.testing((mock) => {
        mock(schema).with({ id: 1, name: "unused" });
      }),
    ).rejects.toThrowError(UnusedMocksError);
  });
});

describe('`unmocked: "error"`', async () => {
  const strict = await initializeExtern({
    scope: "async",
    extensions: [
      fabricatorExtension({ instance: fabricator, unmocked: "error" }),
    ],
  });

  it("restores `NotMockedError` for a block that would otherwise fabricate", async () => {
    await strict.testing(() => {
      expect(() => block(strict)).toThrowError(NotMockedError);
    });
  });

  it("still fabricates for an explicit `produce()`", async () => {
    await strict.testing((mock) => {
      mock(schema).produce();

      expect(block(strict)).toMatchObject({ id: expect.any(Number) });
    });
  });
});

describe("an extern instance with no extension", async () => {
  const bare = await initializeExtern({ scope: "async" });

  it("does not accept a fabricator schema, and does not fabricate", async () => {
    await bare.testing(() => {
      expect(() =>
        // @ts-expect-error — `Identity` is unwidened without the extension.
        bare.typed.by(schema).will((): User => {
          throw new Error("unreachable");
        }),
      ).toThrowError(NotMockedError);
    });
  });
});

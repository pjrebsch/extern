import { initialize as initializeExtern } from "@ghostry/extern";
import { initialize as initializeFabricator } from "@ghostry/fabricator";
import { describe, expect, it } from "bun:test";
import { fabricatorExtension } from "../src";

const fabricator = initializeFabricator({ seed: "produce-suite" });
const { T } = fabricator;

const schema = T.object({
  id: T.number,
  name: T.string.whereby({ length: { max: 10 } }),
  address: T.object({
    city: T.string.whereby({ length: { max: 8 } }),
    zip: T.number,
  }),
});

type User = {
  id: number;
  name: string;
  address: { city: string; zip: number };
};

const extern = await initializeExtern({
  scope: "async",
  extensions: [fabricatorExtension({ instance: fabricator })],
});

const block = (): User =>
  extern.typed.by(schema).will((): User => {
    throw new Error("unreachable");
  });

describe("`produce()`", () => {
  it("fabricates exactly what the unmocked path would", async () => {
    let observed: User | undefined;
    let unmocked: User | undefined;

    await extern.testing((mock) => {
      mock(schema).produce();
      observed = block();
    });

    await extern.testing(() => void (unmocked = block()));

    expect(observed).toEqual(unmocked!);
  });

  it("hands back a spy recording the fabricated value", async () => {
    await extern.testing((mock) => {
      const spy = mock(schema).produce();

      const value = block();

      expect(spy.executions).toHaveLength(1);
      expect(spy.executions[0]?.outcome).toEqual({ kind: "returned", value });
    });
  });
});

describe("`produce(({ via }) => ...)`", () => {
  it("shapes the fabrication through fabricator's own `fabricate`", async () => {
    await extern.testing((mock) => {
      mock(schema).produce(({ via }) => via.fabricate({ name: "Ada" }));

      const value = block();

      expect(value.name).toBe("Ada");
      expect(value.id).toEqual(expect.any(Number));
    });
  });

  /**
   * The override type is fabricator's own `Override<$Definition>`, keyed on
   * the schema *definition* — so it recurses into nested objects, and extern
   * models none of it. A partial nested override leaves its siblings
   * fabricated.
   */
  it("accepts a nested override, leaving siblings fabricated", async () => {
    await extern.testing((mock) => {
      mock(schema).produce(({ via }) =>
        via.fabricate({ address: { city: "Paris" } }),
      );

      const value = block();

      expect(value.address.city).toBe("Paris");
      expect(value.address.zip).toEqual(expect.any(Number));
    });
  });

  /**
   * The handle is the built Fabricator, so everything it carries is reachable
   * — not just `fabricate`. `trace` is what makes attribution directly
   * assertable rather than inferred from downstream values.
   */
  it("exposes the built Fabricator itself, `trace` included", async () => {
    await extern.testing((mock) => {
      mock(schema).produce(({ via }) => {
        expect(via.trace.file).toBeDefined();
        expect(via.schema).toBeDefined();
        return via.fabricate();
      });

      block();
    });
  });

  it("agrees with `produce()` when the callback shapes nothing", async () => {
    let shaped: User | undefined;
    let plain: User | undefined;

    await extern.testing((mock) => {
      mock(schema).produce(({ via }) => via.fabricate());
      shaped = block();
    });

    await extern.testing((mock) => {
      mock(schema).produce();
      plain = block();
    });

    expect(shaped).toEqual(plain!);
  });

  it("runs the callback once, however many times the block is read", async () => {
    let calls = 0;

    await extern.testing((mock) => {
      mock(schema).produce(({ via }) => {
        calls += 1;
        return via.fabricate({ name: "once" });
      });

      expect(block()).toEqual(block());
      expect(calls).toBe(1);
    });
  });

  it("is available under `named(...)`", async () => {
    await extern.testing((mock) => {
      mock(schema)
        .named("n")
        .produce(({ via }) => via.fabricate({ name: "named" }));

      const value = extern.typed
        .by(schema)
        .named("n")
        .will((): User => {
          throw new Error("unreachable");
        });

      expect(value.name).toBe("named");
    });
  });
});

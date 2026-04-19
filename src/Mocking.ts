import { DuplicateMockError } from "./Error";
import { $$Map, type $$Spy, type $$Spyable } from "./Spy";
import type { StandardSchemaV1 } from "./StandardSchema";
import { type $$Disambiguation } from "./Types";
import { augmentFunction, callerStack } from "./Util";

/**
 * The function used to build a mock in a testing block.
 */
export type $$Mocker = {
  <$Out>(
    schema: StandardSchemaV1<$Out>,
  ): $$Spyable.$$ForValue.$$Interface<$Out>;
  readonly effect: $$Spyable.$$ForEffect.$$Interface;
};

export const exactly =
  (disamb: $$Disambiguation.$$ForValue) =>
  (spy: $$Spy): boolean => {
    if ("named" in disamb || "named" in spy) {
      if ("named" in disamb !== "named" in spy) return false;
      if (disamb.named !== spy.named) return false;
    }

    return true;
  };

export const approximately =
  (disamb: $$Disambiguation.$$ForValue) =>
  (spy: $$Spy): boolean => {
    if ("named" in spy) {
      if (disamb.named !== spy.named) return false;
    }

    return true;
  };

/**
 * Defines a bit field to easily compare the specificity of a mock definition.
 */
const Specificity = { named: 0b1, none: 0b0 } as const;

export const mocking = () => {
  const spies = $$Map.build();

  const forValue = <$Out>(
    schema: StandardSchemaV1<$Out>,
  ): $$Spyable.$$ForValue.$$Interface<$Out> => {
    const $use = (
      disamb: $$Disambiguation.$$ForValue,
      strategy: $$Spy.$$Strategy.$$ForValue.$$Any<$Out>,
    ): $$Spy.$$ForValue<$Out> => {
      const exactlyMatches = exactly(disamb);
      const existing = spies.get(schema) ?? [];

      const specificity =
        "named" in disamb ? Specificity.named : Specificity.none;

      const spy: $$Spy.$$ForValue<$Out> = {
        ...disamb,
        schema,
        specificity,
        executions: [],
        stack: callerStack($use, 1),
        strategy,
        kind: "value",
      };

      /**
       * This logic keeps the list of spies ordered from most-to-least
       * specific.
       *
       * Doing this work upfront makes finding the "best" mock during a
       * testing block simple and performant.
       */
      let insertionPoint = 0;
      for (; insertionPoint < existing.length; insertionPoint++) {
        const next = existing[insertionPoint]!;
        if (exactlyMatches(next)) throw new DuplicateMockError();
        if (specificity >= next.specificity) break;
      }

      existing.splice(insertionPoint, 0, spy);
      spies.set(schema, existing);

      return spy;
    };

    const $substitute =
      (disamb: $$Disambiguation.$$ForValue) =>
      (value: $Out): $$Spy.$$ForValue<$Out> => {
        return $use(disamb, { kind: "substitute", value });
      };

    const $passthrough =
      (disamb: $$Disambiguation.$$ForValue) => (): $$Spy.$$ForValue<$Out> => {
        return $use(disamb, { kind: "passthrough" });
      };

    return {
      substitute: $substitute({}),
      with: $substitute({}),

      passthrough: $passthrough({}),
      skip: $passthrough({}),

      named: (name: string) => ({
        substitute: $substitute({ named: name }),
        with: $substitute({ named: name }),

        passthrough: $passthrough({ named: name }),
        skip: $passthrough({ named: name }),
      }),
    };
  };

  const forEffect = (): $$Spyable.$$ForEffect.$$Interface => {
    const $use = (
      { named }: $$Disambiguation.$$ForEffect,
      strategy: $$Spy.$$Strategy.$$ForEffect.$$Any,
    ): $$Spy.$$ForEffect => {
      const existing = spies.effects.get(named);
      if (existing) throw new DuplicateMockError();

      const spy: $$Spy.$$ForEffect = {
        named,
        specificity: Specificity.named,
        executions: [],
        stack: callerStack($use, 1),
        strategy,
        kind: "effect",
      };

      spies.effects.set(named, spy);

      return spy;
    };

    const $observe = (disamb: $$Disambiguation.$$ForEffect) => () =>
      $use(disamb, { kind: "observe" });

    const $passthrough = (disamb: $$Disambiguation.$$ForEffect) => () =>
      $use(disamb, { kind: "passthrough" });

    return {
      named: (name: string) => ({
        observe: $observe({ named: name }),
        passthrough: $passthrough({ named: name }),
      }),
    };
  };

  const mock: $$Mocker = augmentFunction(forValue, { effect: forEffect() });

  return { mock, spies };
};

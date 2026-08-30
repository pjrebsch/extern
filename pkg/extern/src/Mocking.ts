import { DuplicateMockError } from "./Error";
import type { TypeLambda } from "./Extension";
import { IdentityMap, type Spy, type Spyable } from "./Spy";
import {
  type AnyIdentity,
  type Disambiguation,
  type Identity,
  type Options,
} from "./Types";
import { augmentFunction, callerStack } from "./Util";

/**
 * The function used to build a mock in a testing block.
 *
 * One signature, not an overload: {@link Spyable} discriminates on the
 * identity's own type and recovers the produced type in the same step, so an
 * identity an extension can produce from gets the richer interface — the one
 * that additionally offers `produce()` — without a second declaration whose
 * parameter has to be narrowed by hand.
 */
export type Mocker<$Lambda extends TypeLambda = never> = {
  <$Identity extends Identity<any, $Lambda>>(
    schema: $Identity,
  ): Spyable<$Identity, $Lambda>;

  /**
   * The interface used to spy on effect blocks.
   */
  readonly effect: Spyable.ForEffect.Interface;
};

export const exactly =
  (disamb: Disambiguation.ForValue) =>
  (spy: Spy): boolean => {
    if ("named" in disamb || "named" in spy) {
      if ("named" in disamb !== "named" in spy) return false;
      if (disamb.named !== spy.named) return false;
    }

    return true;
  };

export const approximately =
  (disamb: Disambiguation.ForValue) =>
  (spy: Spy): boolean => {
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
  const spies = IdentityMap.build();

  /**
   * Always builds the richer, producible-shaped interface — `produce()` is
   * present on every returned object at runtime, in its widest form. Which of
   * the two is actually *offered* to a caller is a purely type-level decision
   * made by {@link Spyable}: there is no runtime check that could tell an
   * extension's schema from a Standard Schema here without duplicating the
   * extension's own `supports`, and no need to, since calling `produce()` on a
   * non-producible identity is already unreachable through the public types
   * and lands on `ExtensionUnavailableError` for an untyped JavaScript caller
   * anyway. The same goes for the callback form against a handle-less
   * extension: the extension simply ignores it.
   */
  const forValue = <$Out>(
    schema: AnyIdentity,
  ): Spyable.ForValue.Producible.Interface<$Out, unknown> => {
    const $use = <$Strategy extends Spy.Strategy.ForValue.Any<$Out>>(
      disamb: Disambiguation.ForValue,
      strategy: $Strategy,
      options: Options,
    ): Spy.ForValue<$Out, $Strategy> => {
      const exactlyMatches = exactly(disamb);
      const existing = spies.get(schema) ?? [];

      const specificity =
        "named" in disamb ? Specificity.named : Specificity.none;

      const spy = {
        ...disamb,
        schema,
        specificity,
        executions: [],
        stack: callerStack($use, 1),
        strategy,
        options,
        kind: "value" as const,
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
      (disamb: Disambiguation.ForValue) => (value: $Out, options?: Options) => {
        return $use(disamb, { kind: "substitute", value }, { ...options });
      };

    const $passthrough =
      (disamb: Disambiguation.ForValue) => (options?: Options) => {
        return $use(disamb, { kind: "passthrough" }, { ...options });
      };

    const $produce =
      (disamb: Disambiguation.ForValue) =>
      (
        first?: ((context: { readonly via: never }) => $Out) | Options,
        second?: Options,
      ) => {
        const [fn, options] =
          typeof first === "function" ? [first, second] : [undefined, first];

        const strategy =
          fn ?
            ({
              kind: "produce",
              using: (handle: unknown) => fn({ via: handle as never }),
            } as const)
          : ({ kind: "produce" } as const);

        return $use(disamb, strategy, { ...options });
      };

    return {
      substitute: $substitute({}),
      with: $substitute({}),

      passthrough: $passthrough({}),
      skip: $passthrough({}),

      produce: $produce({}),

      named: (name: string) => ({
        substitute: $substitute({ named: name }),
        with: $substitute({ named: name }),

        passthrough: $passthrough({ named: name }),
        skip: $passthrough({ named: name }),

        produce: $produce({ named: name }),
      }),
    };
  };

  const forEffect = (): Spyable.ForEffect.Interface => {
    const $use = <$Strategy extends Spy.Strategy.ForEffect.Any>(
      { named }: Disambiguation.ForEffect,
      strategy: $Strategy,
      options: Options,
    ): Spy.ForEffect<$Strategy> => {
      const existing = spies.effects.get(named);
      if (existing) throw new DuplicateMockError();

      const spy = {
        named,
        specificity: Specificity.named,
        executions: [],
        stack: callerStack($use, 1),
        strategy,
        options,
        kind: "effect" as const,
      };

      spies.effects.set(named, spy);

      return spy;
    };

    const $observe =
      (disamb: Disambiguation.ForEffect) => (options?: Options) =>
        $use(disamb, { kind: "observe" }, { ...options });

    const $passthrough =
      (disamb: Disambiguation.ForEffect) => (options?: Options) =>
        $use(disamb, { kind: "passthrough" }, { ...options });

    return {
      named: (name: string) => ({
        observe: $observe({ named: name }),
        passthrough: $passthrough({ named: name }),
      }),
    };
  };

  /**
   * Cast, unavoidably: `forValue` has one concrete return type, while
   * `Mocker`'s is the conditional {@link Spyable}, and TypeScript cannot
   * relate a concrete type to a conditional one whose checked type is still
   * generic.
   *
   * Sound because `forValue` always builds the *widest* shape: every branch
   * of `Spyable` is a subset of the producible interface it returns.
   */
  const mock = augmentFunction(forValue, {
    effect: forEffect(),
  }) as unknown as Mocker<TypeLambda>;

  return { mock, spies };
};

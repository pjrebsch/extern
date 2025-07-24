import { DuplicateMockError } from "./Error";
import type { StandardSchemaV1 } from "./StandardSchema";
import type { $$Disambiguation, $$Mode } from "./Types";

/**
 * Defining a mock returns this spy interface that can be used to
 * make assertions about the use of the mock and its identity.
 */
export type $$Spy<$Out = unknown> = $$Disambiguation & {
  readonly schema: StandardSchemaV1<$Out>;
  readonly value: $Out;
  readonly specificity: number;
  readonly executions: Array<$$Execution>;
};

export type $$SpyMap = Map<StandardSchemaV1, Array<$$Spy>>;

/**
 * The function used to build a mock in a testing block.
 */
export type $$Mocker = <$Out>(schema: StandardSchemaV1<$Out>) => $$Mock<$Out>;

/**
 * Information captured about each use of a mock during a testing block.
 */
export interface $$Execution {
  mode: $$Mode;
  named?: string;
  given?: unknown;
}

type $$With<$Out> = (value: $Out) => $$Spy<$Out>;
type $$Named<$Out> = (name: string) => { with: $$With<$Out> };

interface $$Mock<$Out> {
  with: $$With<$Out>;
  named: $$Named<$Out>;
}

export const exactly =
  (disamb: $$Disambiguation) =>
  (spy: $$Spy): boolean => {
    if ("named" in disamb || "named" in spy) {
      if ("named" in disamb !== "named" in spy) return false;
      if (disamb.named !== spy.named) return false;
    }

    return true;
  };

export const approximately =
  (disamb: $$Disambiguation) =>
  (spy: $$Spy): boolean => {
    if ("named" in spy) {
      if (disamb.named !== spy.named) return false;
    }

    return true;
  };

export const mocking = () => {
  const spies: $$SpyMap = new Map();

  const mock: $$Mocker = <$Out>(
    schema: StandardSchemaV1<$Out>,
  ): $$Mock<$Out> => {
    const $with =
      (disamb: $$Disambiguation) =>
      (value: $Out): $$Spy<$Out> => {
        const exactlyMatches = exactly(disamb);
        const existing = spies.get(schema) ?? [];

        /**
         * A bit field to easily compare the specificity of a mock definition.
         */
        const specificity = "named" in disamb ? 0b1 : 0b0;

        const spy = { ...disamb, schema, value, specificity, executions: [] };

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

    return {
      with: $with({}),
      named: (name: string) => ({ with: $with({ named: name }) }),
    };
  };

  return { mock, spies };
};

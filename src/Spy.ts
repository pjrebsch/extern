import type { $$Disambiguation, $$Identity, $$Mode, $$Name } from "./Types";

/**
 * Information captured about each use of a mock during a testing block.
 */
export interface $$Execution {
  /**
   * The defined mode of the source extern block.
   */
  readonly mode: $$Mode;

  /**
   * The name assigned to the source extern block.
   */
  readonly named?: string;

  /**
   * The runtime value supplied to the source function.
   */
  readonly given?: unknown;
}

/**
 * Defining a mock returns this spy interface that can be used to
 * make assertions about the use of the mock and its identity.
 */
export type $$Spy<$Out = unknown> = $$Spy.$$Any<$Out>;

export namespace $$Spy {
  export type $$Any<$Out = unknown> = $$ForValue<$Out> | $$ForEffect;

  export type $$ForValue<
    $Out = unknown,
    $Strategy extends $$Strategy.$$ForValue.$$Any<$Out> =
      $$Strategy.$$ForValue.$$Any<$Out>,
  > = $$Base
    & $$Disambiguation.$$ForValue & {
      readonly kind: "value";
      readonly schema: $$Identity<$Out>;
      readonly strategy: $Strategy;
    };

  export type $$ForEffect<
    $Strategy extends $$Strategy.$$ForEffect.$$Any =
      $$Strategy.$$ForEffect.$$Any,
  > = $$Base
    & $$Disambiguation.$$ForEffect & {
      readonly kind: "effect";
      readonly strategy: $Strategy;
    };

  type $$Base = {
    readonly specificity: number;
    readonly executions: Array<$$Execution>;
    readonly stack: string;
  };

  export namespace $$Strategy {
    export namespace $$ForValue {
      export type $$Any<$Out> = $$Substitute<$Out> | $$Passthrough;

      export type $$Substitute<$Out> = {
        readonly kind: "substitute";
        readonly value: $Out;
      };

      export type $$Passthrough = { readonly kind: "passthrough" };
    }

    export namespace $$ForEffect {
      export type $$Any = $$Observe | $$Passthrough;

      export type $$Observe = { readonly kind: "observe" };

      export type $$Passthrough = { readonly kind: "passthrough" };
    }
  }
}

export namespace $$Spyable {
  export namespace $$ForValue {
    export type $$Interface<$Out> = {
      /** Define the substitution value for tests. */
      substitute: $$ForValue.$$Substitute<$Out>;
      /** @alias `substitute` */
      with: $$ForValue.$$Substitute<$Out>;

      /** Configure the source extern block to run the original function. */
      passthrough: $$ForValue.$$Passthrough<$Out>;
      /** @alias `passthrough` */
      skip: $$ForValue.$$Passthrough<$Out>;

      /** Target source extern blocks with the specified name. */
      named: (name: string) => {
        /** Define the substitution value for tests. */
        substitute: $$Substitute<$Out>;
        /** @alias `substitute` */
        with: $$Substitute<$Out>;

        /** Configure the source extern block to run the original function. */
        passthrough: $$Passthrough<$Out>;
        /** @alias `passthrough` */
        skip: $$Passthrough<$Out>;
      };
    };

    export type $$Substitute<$Out> = (
      value: $Out,
    ) => $$Spy.$$ForValue<$Out, $$Spy.$$Strategy.$$ForValue.$$Substitute<$Out>>;

    export type $$Passthrough<$Out> = () => $$Spy.$$ForValue<
      $Out,
      $$Spy.$$Strategy.$$ForValue.$$Passthrough
    >;
  }

  export namespace $$ForEffect {
    export type $$Interface = {
      /** Target source extern blocks with the specified name. */
      named: (name: string) => {
        /** Obtain a spy for the source extern block. */
        observe: $$Observe;

        /** Configure the source extern block to run the original function. */
        passthrough: $$Passthrough;
      };
    };

    export type $$Observe =
      () => $$Spy.$$ForEffect<$$Spy.$$Strategy.$$ForEffect.$$Observe>;

    export type $$Passthrough =
      () => $$Spy.$$ForEffect<$$Spy.$$Strategy.$$ForEffect.$$Passthrough>;
  }
}

export type $$Map = $$Map.$$Interface<$$Identity, Array<$$Spy.$$ForValue>> & {
  readonly effects: $$Map.$$Interface<$$Name, $$Spy.$$ForEffect>;
};

export namespace $$Map {
  export type $$ForValue = Map<$$Identity, Array<$$Spy.$$ForValue>>;
  export type $$ForEffect = Map<$$Name, $$Spy.$$ForEffect>;

  export interface $$Interface<$K, $V> {
    readonly get: (k: $K) => $V | undefined;
    readonly set: (k: $K, spies: $V) => void;
    readonly forEach: (fn: (spies: $V) => void) => void;
  }

  namespace $$Interface {
    export const build = <$K, $V>(m: Map<$K, $V>): $$Interface<$K, $V> => ({
      get: (...args) => m.get(...args),
      set: (...args) => m.set(...args),
      forEach: (...args) => m.forEach(...args),
    });
  }

  export const build = (): $$Map => ({
    ...$$Interface.build(new Map()),
    effects: $$Interface.build(new Map()),
  });
}

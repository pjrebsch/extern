import type { Apply, HandleOf, TypeLambda } from "./Extension";
import type { StandardSchemaV1 } from "./StandardSchema";
import type { T } from "./T";
import type { AnyIdentity, Disambiguation, Mode, Name, Options } from "./Types";

/**
 * Information captured about each use of a mock during a testing block.
 */
export type Execution<$Out = unknown> =
  | Execution.ForValue<$Out>
  | Execution.ForEffect;

export namespace Execution {
  type Base = {
    /**
     * The defined mode of the source extern block.
     */
    readonly mode: Mode;

    /**
     * The name assigned to the source extern block.
     */
    readonly named?: string;

    /**
     * The runtime value supplied to the source function.
     */
    readonly given?: unknown;
  };

  /**
   * One use of a value block's mock. Unlike an effect block, a value block
   * hands something back, so how it settled is recorded here — whichever
   * strategy produced it.
   */
  export type ForValue<$Out = unknown> = Base & {
    /**
     * How the source extern block settled. Always present: an execution is
     * recorded on *both* paths out of the block, so a `skip()`ped block whose
     * original function threw is still recorded — and still counts as used by
     * `disallowUnusedMocks`, which would otherwise report a mock that plainly
     * did run as unused.
     */
    readonly outcome: Outcome<$Out>;
  };

  /**
   * How one use of a value block settled — the value it handed back, or the
   * error it threw. A union rather than an optional `returned`, because a
   * throwing block has no value to report and every strategy can throw: the
   * original function under `skip()`, and production itself under
   * `produce()` (an extension's own resolver, a caller's own `via` callback,
   * an unsatisfiable schema, or no extension available at all).
   *
   * `"threw"` is purely a record of what happened. The error is always
   * rethrown — extern never swallows one — so a test asserting a block throws
   * behaves exactly as it did before, and can now additionally assert on what
   * was thrown.
   *
   * Under `typed`, which is synchronous, `value` is whatever the block handed
   * back — for an async block, the un-awaited promise, and a later rejection
   * is not reflected here. `validated` awaits internally, so it always
   * records a settled value.
   */
  export type Outcome<$Out = unknown> =
    | { readonly kind: "returned"; readonly value: $Out }
    | { readonly kind: "threw"; readonly error: unknown };

  /**
   * One use of an effect block's mock. Effect blocks resolve to `void`, so
   * there is nothing produced to record.
   */
  export type ForEffect = Base;
}

/**
 * Defining a mock returns this spy interface that can be used to
 * make assertions about the use of the mock and its identity.
 */
export type Spy<$Out = unknown> = Spy.Any<$Out>;

export namespace Spy {
  /** A spy for either a value block or an effect block. */
  export type Any<$Out = unknown> = ForValue<$Out> | ForEffect;

  /** A spy for a value block. */
  export type ForValue<
    $Out = unknown,
    $Strategy extends Strategy.ForValue.Any<$Out> = Strategy.ForValue.Any<$Out>,
  > = Base
    & Disambiguation.ForValue & {
      readonly kind: "value";
      readonly schema: AnyIdentity;
      readonly strategy: $Strategy;
      readonly executions: Array<Execution.ForValue<$Out>>;
    };

  /** A spy for an effect block. */
  export type ForEffect<
    $Strategy extends Strategy.ForEffect.Any = Strategy.ForEffect.Any,
  > = Base
    & Disambiguation.ForEffect & {
      readonly kind: "effect";
      readonly strategy: $Strategy;
      readonly executions: Array<Execution.ForEffect>;
    };

  type Base = {
    readonly specificity: number;
    readonly stack: string;
    readonly options: Options;
  };

  export namespace Strategy {
    /** The mock/spy strategy for a value block. */
    export namespace ForValue {
      /** The mock/spy strategy for a value block. */
      export type Any<$Out> = Substitute<$Out> | Passthrough | Produce;

      /** Substitution strategy for a value block.*/
      export type Substitute<$Out> = {
        readonly kind: "substitute";
        readonly value: $Out;
      };

      /** Passthrough strategy for a value block. */
      export type Passthrough = { readonly kind: "passthrough" };

      /** Production strategy for a value block — what `produce()` installs. */
      export type Produce = {
        readonly kind: "produce";

        /**
         * Set when the caller wrote `produce(fn)`. Already adapted from the
         * caller's destructured `({ via })` shape to the plain one-argument
         * function an extension receives, so the destructuring never has to be
         * understood anywhere below `mock()`.
         */
        readonly using?: (handle: unknown) => unknown;
      };
    }

    /** The mock/spy strategy for an effect block. */
    export namespace ForEffect {
      /** The mock/spy strategy for an effect block. */
      export type Any = Observe | Passthrough;

      /** Observation strategy for an effect block. */
      export type Observe = { readonly kind: "observe" };

      /** Passthrough strategy for an effect block. */
      export type Passthrough = { readonly kind: "passthrough" };
    }
  }
}

/**
 * Selects the interface that `mock()` hands back for a given identity, judged
 * against what `$Lambda` admits.
 *
 * This is what replaces an overload. Discrimination has to key on the
 * *identity's own type*, while a single signature generic over the identity's
 * **produced** type cannot tell the cases apart — an extension's schema
 * producing `number` and a Standard Schema producing `number` both infer
 * `$Out = number`. Matching `$Identity` against `Apply<$Lambda, infer $Out>`
 * discriminates and recovers the produced type in one step.
 *
 * With no extensions `$Lambda` is `never`, `Apply<never, …>` is `never`, and
 * the first branch is unreachable — which is what keeps `produce()` off the
 * interface entirely for instances that never opted in.
 */
export type Spyable<$Identity, $Lambda extends TypeLambda> =
  $Identity extends Apply<$Lambda, infer $Out> ?
    Spyable.ForValue.Producible.Interface<$Out, HandleOf<$Lambda, $Identity>>
  : $Identity extends StandardSchemaV1<infer $Out> ?
    Spyable.ForValue.Interface<$Out>
  : $Identity extends T<infer $Out> ? Spyable.ForValue.Interface<$Out>
  : never;

export namespace Spyable {
  export namespace ForValue {
    export type Interface<$Out> = {
      /** Define the substitution value for tests. */
      substitute: ForValue.Substitute<$Out>;
      /** @alias `substitute` */
      with: ForValue.Substitute<$Out>;

      /** Configure the source extern block to run the original function. */
      passthrough: ForValue.Passthrough<$Out>;
      /** @alias `passthrough` */
      skip: ForValue.Passthrough<$Out>;

      /** Target source extern blocks with the specified name. */
      named: (name: string) => Named<$Out>;
    };

    /** The terminals available under `named(...)` for any value identity. */
    export type Named<$Out> = {
      /** Define the substitution value for tests. */
      substitute: Substitute<$Out>;
      /** @alias `substitute` */
      with: Substitute<$Out>;

      /** Configure the source extern block to run the original function. */
      passthrough: Passthrough<$Out>;
      /** @alias `passthrough` */
      skip: Passthrough<$Out>;
    };

    /**
     * What `mock()` returns for an identity an extension can produce from —
     * the ordinary value interface plus `produce()`. Kept as a distinct type,
     * and selected by {@link Spyable}, so `produce()` is offered *only*
     * where production is actually possible: on a plain `T<>` or a Standard
     * Schema it does not appear at all.
     *
     * `Omit<…, "named">` rather than a bare intersection: intersecting two
     * object types that both carry `named` produces an *overloaded* `named`,
     * and a call would resolve to the first signature — the one returning the
     * non-producible `Named`, silently dropping `produce` from under
     * `named(...)`. Replacing the property outright is what keeps it present.
     */
    export namespace Producible {
      export type Interface<$Out, $Handle> = Omit<
        ForValue.Interface<$Out>,
        "named"
      > & {
        /** Produce a value for this identity, and hand back a spy. */
        produce: ForValue.Produce<$Out, $Handle>;

        /** Target source extern blocks with the specified name. */
        named: (name: string) => Named<$Out, $Handle>;
      };

      export type Named<$Out, $Handle> = ForValue.Named<$Out> & {
        /** Produce a value for this identity, and hand back a spy. */
        produce: ForValue.Produce<$Out, $Handle>;
      };
    }

    export type Substitute<$Out> = (
      value: $Out,
      options?: Options,
    ) => Spy.ForValue<$Out, Spy.Strategy.ForValue.Substitute<$Out>>;

    export type Passthrough<$Out> = (
      options?: Options,
    ) => Spy.ForValue<$Out, Spy.Strategy.ForValue.Passthrough>;

    /**
     * `produce()` lets the extension decide the value outright;
     * `produce(({ via }) => …)` shapes it, where `via` is the extension's own
     * object for this identity — so overrides are expressed through whatever
     * API that library already has, and extern re-derives none of it.
     *
     * Both forms **cache**, keyed by identity and name, so the callback runs
     * once per block. That is not a neutral default: an extension typically
     * derives distinctness from per-construction state, so an uncached
     * callback would hand back a different value on every read of one block,
     * which is never what the line means.
     *
     * The callback form is withdrawn when `$Handle` is `never` — an extension
     * that declares no `Handle` has nothing to pass, though it can still
     * produce, so `produce()` stays. The overloads are ordered callback-first:
     * `produce()` and `produce({ unused: "allow" })` both fall through to the
     * second, since neither argument is a function.
     */
    export type Produce<$Out, $Handle> =
      [$Handle] extends [never] ?
        (options?: Options) => Spy.ForValue<$Out, Spy.Strategy.ForValue.Produce>
      : {
          (
            via: (context: { readonly via: $Handle }) => $Out,
            options?: Options,
          ): Spy.ForValue<$Out, Spy.Strategy.ForValue.Produce>;

          (
            options?: Options,
          ): Spy.ForValue<$Out, Spy.Strategy.ForValue.Produce>;
        };
  }

  export namespace ForEffect {
    export type Interface = {
      /** Target source extern blocks with the specified name. */
      named: (name: string) => {
        /** Obtain a spy for the source extern block. */
        observe: Observe;

        /** Configure the source extern block to run the original function. */
        passthrough: Passthrough;
      };
    };

    export type Observe = (
      options?: Options,
    ) => Spy.ForEffect<Spy.Strategy.ForEffect.Observe>;

    export type Passthrough = (
      options?: Options,
    ) => Spy.ForEffect<Spy.Strategy.ForEffect.Passthrough>;
  }
}

export type IdentityMap = IdentityMap.Interface<
  AnyIdentity,
  Array<Spy.ForValue>
> & { readonly effects: IdentityMap.Interface<Name, Spy.ForEffect> };

export namespace IdentityMap {
  export type ForValue = Map<AnyIdentity, Array<Spy.ForValue>>;
  export type ForEffect = Map<Name, Spy.ForEffect>;

  export interface Interface<$K, $V> {
    readonly get: (k: $K) => $V | undefined;
    readonly set: (k: $K, spies: $V) => void;
    readonly forEach: (fn: (spies: $V) => void) => void;
  }

  namespace Interface {
    export const build = <$K, $V>(m: Map<$K, $V>): Interface<$K, $V> => ({
      get: (...args) => m.get(...args),
      set: (...args) => m.set(...args),
      forEach: (...args) => m.forEach(...args),
    });
  }

  export const build = (): IdentityMap => ({
    ...Interface.build(new Map()),
    effects: Interface.build(new Map()),
  });
}

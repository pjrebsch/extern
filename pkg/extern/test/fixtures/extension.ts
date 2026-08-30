import type {
  Extension,
  HandleLambda,
  Session,
  TypeLambda,
} from "../../src/Extension";

/**
 * A stub extension, defined entirely in this repo's own tests with no real
 * schema library involved. Everything extern's core knows about extensions it
 * has to learn through this, which is what makes the core's tests a proof of
 * extension-agnosticism rather than a test of one particular integration.
 */
const stub: unique symbol = Symbol("boxed");

/**
 * The stub's identity type. Keyed on a `unique symbol` rather than on its
 * shape, so the lambda below is structurally narrow — a lambda emitting some
 * loose `{ label: string }` would accept unrelated objects and silently claim
 * identities that were never meant for it.
 */
export interface Boxed<$T> {
  readonly [stub]: true;
  readonly label: string;
  readonly produces?: $T;
}

export const boxed = <$T>(label: string): Boxed<$T> => ({
  [stub]: true,
  label,
});

/**
 * The stub's handle: what `produce(({ via }) => …)` hands a caller for a boxed
 * identity. Stands in for whatever object a real extension already exposes —
 * a builder, a generator — and, like a real one, it is the extension that
 * constructs it, never extern.
 */
export interface Box<$T> {
  readonly label: string;
  readonly build: (overrides?: { readonly suffix?: string }) => $T;
}

/**
 * A named alias, for the same reason `Boxed` is one below: `this["Of"]` inside
 * a nested anonymous object type does not resolve.
 */
type BoxFor<$Of> = $Of extends Boxed<infer $T> ? Box<$T> : never;

/**
 * `Boxed<this["In"]>` through a *named* alias: `this["In"]` written directly
 * inside a nested anonymous object type does not resolve.
 *
 * Extends `HandleLambda` as well, which is what makes the callback form of
 * `produce()` appear on boxed identities. `TaggedLambda` below deliberately
 * does not — the two together are what prove a handle-less extension neither
 * gains a callback nor costs its neighbours theirs.
 */
export interface BoxedLambda extends TypeLambda, HandleLambda {
  readonly Out: Boxed<this["In"]>;
  readonly Handle: BoxFor<this["Of"]>;
}

/** What a scope opened by {@link boxedExtension} recorded while it was open. */
export interface Opened {
  ignore: readonly string[];
  entered: number;
  order: string[];
}

export const opened = (): Opened => ({ ignore: [], entered: 0, order: [] });

export const boxedExtension = (options?: {
  readonly name?: string;
  readonly unmocked?: "produce" | "error";
  readonly opened?: Opened;
}): Extension<BoxedLambda> => ({
  kind: "producer",

  name: options?.name ?? "boxed",

  ...(options?.unmocked === undefined ? {} : { unmocked: options.unmocked }),

  supports: (identity) =>
    typeof identity === "object" && identity !== null && stub in identity,

  scope: async (scopeOptions, block) => {
    /**
     * Reset per scope, and folded into every produced value: this stands in
     * for the per-construction state a real extension derives values from,
     * and is what makes the core's production cache observable. Without it,
     * asking twice would trivially agree and the cache would be untestable.
     */
    let ordinal = 0;

    if (options?.opened !== undefined) {
      options.opened.ignore = scopeOptions.ignore;
      options.opened.entered += 1;
      options.opened.order.push(options?.name ?? "boxed");
    }

    const session: Session.Producer = {
      produce: (identity, named, using) => {
        ordinal += 1;

        const label = (identity as Boxed<unknown>).label;
        const value = `${label}:${named ?? ""}:${ordinal}`;

        /**
         * The extension builds the handle and invokes the callback — extern
         * cannot, having no idea what shape this extension's handle takes.
         * The handle closes over the *same* `value` the plain path would have
         * produced, so `produce()` and `produce(({ via }) => via.build())`
         * agree, and a `suffix` shapes that one value rather than drawing a
         * fresh one.
         */
        if (using === undefined) return value;

        const handle: Box<string> = {
          label,
          build: (overrides) =>
            overrides?.suffix === undefined ?
              value
            : `${value}+${overrides.suffix}`,
        };

        return using(handle);
      },
    };

    return block(session);
  },
});

/**
 * A second, deliberately *disjoint* extension: a different marker symbol, so
 * neither claims the other's identities.
 */
const other: unique symbol = Symbol("tagged");

export interface Tagged<$T> {
  readonly [other]: true;
  readonly label: string;
  readonly produces?: $T;
}

export const tagged = <$T>(label: string): Tagged<$T> => ({
  [other]: true,
  label,
});

/**
 * No `HandleLambda`: this extension produces, but has nothing to hand a
 * callback. `HandleOf` resolves to `never` for its identities, which withdraws
 * `produce(fn)` while leaving `produce()` in place.
 */
export interface TaggedLambda extends TypeLambda {
  readonly Out: Tagged<this["In"]>;
}

export const taggedExtension = (options?: {
  readonly opened?: Opened;
}): Extension<TaggedLambda> => ({
  kind: "producer",

  name: "tagged",

  supports: (identity) =>
    typeof identity === "object" && identity !== null && other in identity,

  scope: async (scopeOptions, block) => {
    if (options?.opened !== undefined) {
      options.opened.ignore = scopeOptions.ignore;
      options.opened.entered += 1;
      options.opened.order.push("tagged");
    }

    return block({
      produce: (identity) => `tagged(${(identity as Tagged<unknown>).label})`,
    });
  },
});

/**
 * An extension that claims exactly what the boxed one does, for exercising
 * the overlap check. Its lambda is identical to `BoxedLambda`, which is
 * precisely the situation that has no well-defined produced type.
 */
export const greedyExtension = (): Extension<BoxedLambda> => ({
  kind: "producer",

  name: "greedy",

  supports: (identity) =>
    typeof identity === "object" && identity !== null && stub in identity,

  scope: async (_options, block) => block({ produce: () => "greedy" }),
});

/**
 * An extension that produces nothing at all.
 *
 * The shape a debugging or reporting helper takes: it wants a scope per
 * testing block, but claims no identities and serves no values. It declares
 * no `supports`, leaves `$Lambda` at its `never` default, and yields an empty
 * session — so it contributes nothing to `Identity`, and blocks behave
 * exactly as they would with no extension configured.
 */
export const observerExtension = (options?: {
  readonly opened?: Opened;
}): Extension => ({
  kind: "observer",

  name: "observer",

  scope: async (scopeOptions, block) => {
    if (options?.opened !== undefined) {
      options.opened.ignore = scopeOptions.ignore;
      options.opened.entered += 1;
      options.opened.order.push("observer");
    }

    return block({});
  },
});

/**
 * A malformed extension: claims identities but serves none.
 *
 * The cast is the point of this fixture now. `Extension.Producer` requires a
 * {@link Session.Producer}, so this shape no longer type-checks — reaching
 * `ExtensionUnavailableError` takes a deliberate defeat of the types, which
 * is exactly what that error's own documentation claims. Without the cast,
 * `block({})` is a compile error rather than a runtime one.
 */
export const brokenExtension = (): Extension<BoxedLambda> => ({
  kind: "producer",

  name: "broken",

  supports: (identity) =>
    typeof identity === "object" && identity !== null && stub in identity,

  scope: async (_options, block) => block({} as Session.Producer),
});

import type { AsyncLocalStorage } from "node:async_hooks";
import type { Context } from "./Context";
import { IllegalConcurrencyTestingError } from "./Error";
import { isThenable } from "./Util";

export interface Scope {
  readonly current: () => Context | undefined;
  readonly run: <$Return>(context: Context, fn: () => $Return) => $Return;
}

class AsyncScope implements Scope {
  private readonly store: AsyncLocalStorage<Context | undefined>;

  constructor(m: typeof import("node:async_hooks")) {
    this.store = new m.AsyncLocalStorage({ defaultValue: undefined });
  }

  public readonly current = () => {
    return this.store.getStore();
  };

  public readonly run = <$Return>(
    context: Context,
    fn: () => $Return,
  ): $Return => {
    return this.store.run(context, fn);
  };
}

class SyncScope implements Scope {
  private context: Context | undefined = undefined;

  public readonly current = () => {
    return this.context;
  };

  public readonly run = <$Return>(
    context: Context,
    fn: () => $Return,
  ): $Return => {
    /**
     * Thrown synchronously so it surfaces at the `testing` call site rather
     * than inside a promise, matching fabricator's reasoning for
     * `SynchronousStackError`. Nothing has started, so no promise is
     * abandoned.
     */
    if (this.context !== undefined) {
      throw new IllegalConcurrencyTestingError();
    }

    this.context = context;

    let result: $Return | undefined;

    try {
      result = fn();
    } finally {
      if (!isThenable(result)) {
        this.context = undefined;
      }
    }

    if (isThenable(result)) {
      return result.then(
        (value) => {
          this.context = undefined;
          return value;
        },
        (error: unknown) => {
          this.context = undefined;
          throw error;
        },
      ) as $Return;
    }

    return result as $Return;
  };
}

export const asyncScope = () =>
  import("node:async_hooks").then((m) => new AsyncScope(m));

export const syncScope = () => new SyncScope();

export const scope = (): Promise<Scope> => asyncScope().catch(syncScope);

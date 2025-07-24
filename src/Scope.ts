import type { AsyncLocalStorage } from "node:async_hooks";
import type { $$Context } from "./Context";
import { IllegalConcurrencyTestingError } from "./Error";

export interface $$Scope {
  current: () => $$Context | undefined;
  run: (context: $$Context, fn: () => Promise<void>) => Promise<void>;
}

class $$AsyncScope implements $$Scope {
  private store: AsyncLocalStorage<$$Context | undefined>;

  constructor(m: typeof import("node:async_hooks")) {
    this.store = new m.AsyncLocalStorage({ defaultValue: undefined });
  }

  public current = () => {
    return this.store.getStore();
  };

  public run = async (
    context: $$Context,
    fn: () => Promise<void>,
  ): Promise<void> => {
    return this.store.run(context, fn);
  };
}

class $$SyncScope implements $$Scope {
  private mutex = new $$Mutex({
    onContest: () => {
      throw new IllegalConcurrencyTestingError();
    },
  });

  private context: $$Context | undefined = undefined;

  public current = () => {
    return this.context;
  };

  public run = async (
    context: $$Context,
    fn: () => Promise<void>,
  ): Promise<void> => {
    const release = await this.mutex.acquire();

    try {
      this.context = context;
      return await fn();
    } finally {
      this.context = undefined;
      release();
    }
  };
}

interface $$MutexConfig {
  onContest: (contestant: Promise<void>) => Promise<void>;
}

class $$Mutex {
  private queue: Promise<void>[] = [];

  private onContest: $$MutexConfig["onContest"];

  constructor(config?: Partial<$$MutexConfig>) {
    this.onContest = config?.onContest || Promise.resolve;
  }

  public acquire = async (): Promise<() => void> => {
    let release: () => void = () => {};

    const queue = this.queue;

    const next = new Promise<void>((resolve) => {
      release = () => {
        queue.pop();
        resolve();
      };
    });

    const previous = queue[0];
    queue.unshift(next);

    if (previous) await this.onContest(previous);

    return release;
  };
}

export const $$asyncScope = () =>
  import("node:async_hooks").then((m) => new $$AsyncScope(m));

export const $$syncScope = () => new $$SyncScope();

export const $$scope = (): Promise<$$Scope> =>
  $$asyncScope().catch($$syncScope);

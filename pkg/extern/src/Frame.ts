import type { Cleanup, Outcome } from "./Cleanup";
import {
  ExtensionFrameResultError,
  ExtensionFrameSessionError,
  ExtensionFrameYieldError,
} from "./Error";
import type { Session } from "./Extension";
import { isThenable } from "./Util";

/**
 * How an extension runs the block when it needs the block to run _inside_
 * something — an `AsyncLocalStorage` scope, a library's own `wrap`, a pooled
 * connection's callback.
 *
 * Yielded from {@link Frame} in place of a session; extern applies it, passing a
 * `body` that must be called exactly once and whose value must be returned
 * unchanged. What the wrapper passes to `body` is the session, which is how a
 * scoped thing reaches `produce` with no mutable variable in between.
 */
export type Wrapper<$Session extends Session = Session> = <$Return>(
  body: (session: $Session) => $Return,
) => $Return;

/**
 * What an extension's `frame` returns: a generator with **one** suspension
 * point.
 *
 * Everything before the `yield` is setup. The `yield` is where the testing
 * block runs, and carries what the extension established — either the session
 * itself, or a {@link Wrapper} that establishes one and runs the block inside
 * it. Everything after the `yield` is teardown.
 *
 * `async function*` works and promotes the block to a promise. A **synchronous**
 * generator cannot await its teardown, since it resumes synchronously, so
 * teardown that must be awaited needs `async function*`.
 */
export type Frame<$Session extends Session = Session> =
  | Generator<$Session | Wrapper<$Session>, void, Outcome>
  | AsyncGenerator<$Session | Wrapper<$Session>, void, Outcome>;

/**
 * True for what a generator function returns, and false for anything else a
 * `frame` might hand back. Duck-typed on the returned object rather than asked
 * of the function that produced it, which a transpiled generator would answer
 * misleadingly.
 */
export const isFrame = (value: unknown): value is Frame => {
  return (
    typeof value === "object"
    && value !== null
    && typeof (value as Frame).next === "function"
    && typeof (value as Frame).throw === "function"
  );
};

/**
 * What one extension's frame yielded: how to run the block, and how to tear
 * down afterwards.
 */
export type Opened = {
  /**
   * Always present. A frame that yields a session directly is normalized to a
   * wrapper that just calls `body` with it, so everything downstream has one
   * shape rather than two.
   */
  readonly wrapper: Wrapper;
  readonly cleanup: Cleanup;
};

/**
 * Run an extension's frame to its one `yield`, and hand back both halves.
 *
 * Resuming is what runs the author's teardown, and it is always `next` — never
 * `throw` — carrying the {@link Outcome} as the `yield` expression's value. A
 * frame therefore observes failure as _data_ (`const outcome = yield session`)
 * rather than by catching.
 *
 * The consequence, and it is deliberate: a `try`/`catch` around the `yield`
 * never fires, so an extension cannot intercept or replace a failing block's
 * error. `try`/`finally` is unaffected and runs on every path, which is what
 * both hazards this hook exists to close actually need.
 *
 * Throwing into the frame instead would buy that `catch`, at the cost of having
 * to tell a teardown fault from the block's own error coming back out of an
 * uncaught frame — an identity check that must sit on both the synchronous
 * raise and the async rejection, since the two generator kinds report an
 * uncaught `yield` differently.
 *
 * Normalizing the resumption into a {@link Cleanup} is what lets everything
 * downstream — where it settles, in what order, into which error list — stay
 * one code path, shared with the teardown extern settles for every frame.
 */
export const openFrame = (
  frame: Frame,
  name: string,
): Opened | PromiseLike<Opened> => {
  const toOpened = (step: IteratorResult<Session | Wrapper, void>): Opened => {
    /**
     * A frame that returns without yielding never established anything, so
     * there is no session to serve the block with. Unlike harness — where a
     * frame may legitimately bracket without wrapping, because context comes
     * from a separate `provides` — a yield here is the only channel.
     */
    if (step.done === true) throw new ExtensionFrameYieldError(name);

    const yielded = step.value;

    if (typeof yielded !== "function" && typeof yielded !== "object") {
      throw new ExtensionFrameSessionError(name, typeof yielded);
    }

    if (yielded === null) {
      throw new ExtensionFrameSessionError(name, "null");
    }

    const wrapper: Wrapper =
      typeof yielded === "function" ? yielded : (body) => body(yielded);

    return {
      wrapper,
      cleanup: (outcome) => {
        const finished = (last: IteratorResult<unknown, void>): void => {
          if (last.done !== true) throw new ExtensionFrameYieldError(name);
        };

        const resumed = frame.next(outcome);

        return isThenable(resumed) ? resumed.then(finished) : finished(resumed);
      },
    };
  };

  const first = frame.next();

  return isThenable(first) ? first.then(toOpened) : toOpened(first);
};

/**
 * Invoke an extension's `frame` and refuse anything that is not a generator.
 *
 * The likeliest mistake is a plain function that establishes a session and
 * returns it, or returns teardown: either runs its setup and then silently
 * never tears down.
 */
export const enterFrame = (
  frame: () => unknown,
  name: string,
): Opened | PromiseLike<Opened> => {
  const result = frame();

  if (!isFrame(result)) throw new ExtensionFrameResultError(name);

  return openFrame(result, name);
};

import type { Config } from "./Config";
import type { Context } from "./Context";
import { ExtensionUnavailableError } from "./Error";
import type { AnyIdentity } from "./Types";

/**
 * Should a block with this identity and no matching mock produce a value
 * rather than throwing `NotMockedError`?
 *
 * True only when some configured extension claims the identity *and* that
 * extension leaves `unmocked` at its `"produce"` default. Sourced from the
 * extension rather than from extern's own configuration, so opting out of
 * implicit production without having an extension at all stays
 * unrepresentable.
 */
export const shouldProduce = (
  config: Config,
  identity: AnyIdentity,
): boolean => {
  const extension = config.extensions.claimant(identity);

  return (
    extension !== undefined && (extension.unmocked ?? "produce") !== "error"
  );
};

/**
 * Look up or produce a value for `identity`, keyed by `named` within the
 * active testing block's cache — see `Context.productions` for why that cache
 * is load-bearing rather than an optimization.
 *
 * `using` carries a `produce(fn)` callback through to the extension, which is
 * the only party able to build the handle it expects. It participates in the
 * cache like everything else: the callback runs once per `(identity, named)`,
 * so two reads of one block agree.
 *
 * The unmocked branch in the cores reaches this only after `shouldProduce`
 * has already confirmed an extension claims the identity, so the missing
 * producer is unreachable there. A `produce()` mock reaches it through the
 * cores' `case "produce"` with no such guard, and a plain JavaScript consumer
 * has no type-level protection at all — hence a real error rather than an
 * assertion.
 */
export const produce = (
  context: Context,
  identity: AnyIdentity,
  named: string | undefined,
  using?: (handle: unknown) => unknown,
): unknown => {
  if (context.produce === undefined) throw new ExtensionUnavailableError();

  const key = named ?? "";

  let cache = context.productions.get(identity);

  if (cache === undefined) {
    cache = new Map<string, unknown>();
    context.productions.set(identity, cache);
  }

  if (cache.has(key)) return cache.get(key);

  const value = context.produce(identity, named, using);
  cache.set(key, value);

  return value;
};

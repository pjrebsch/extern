import { compose, type Extension, type Extensions } from "./Extension";
import { asyncScope, scope, syncScope, type Scope } from "./Scope";

/**
 * The available configurations for this library.
 */
export interface Configuration<
  $Extensions extends readonly Extension.Any[] = readonly Extension.Any[],
> {
  /**
   * Forces a specific execution scope for tests.
   *
   * `async` requires the execution environment to support `node:async_hooks`.
   *
   * `sync` has no execution environment requirements, but it does prevent
   * tests using `extern.testing` from being run concurrently.
   *
   * When not specified, `async` will be used by default if the execution
   * environment supports it, with `sync` used as the fallback.
   *
   * @default undefined
   */
  readonly scope?: "async" | "sync";

  /**
   * Extensions that widen what this instance accepts as a block identity, so
   * that a `typed` block built from an extension's own schema can produce a
   * value in place of an explicit mock.
   *
   * The widening applies to this instance alone. Each extension's type lambda
   * joins the union that `Identity` is resolved against, which is why passing
   * them as values — rather than registering them globally — keeps instances
   * that did not opt in unaffected.
   *
   * @default []
   */
  readonly extensions?: $Extensions;
}

export interface Config {
  readonly scope: Scope;
  readonly extensions: Extensions;
}

export const fromConfiguration = async (
  configuration: Configuration,
): Promise<Config> => {
  return {
    scope: await $scope(configuration),
    extensions: compose(configuration.extensions ?? []),
  };
};

const $scope = (configuration: Configuration): Promise<Scope> => {
  switch (configuration.scope) {
    case "async":
      return asyncScope();
    case "sync":
      return Promise.resolve(syncScope());
    case undefined:
      return scope();
    default:
      throw new Error(
        `Invalid configuration option for scope: ${configuration.scope}`,
      );
  }
};

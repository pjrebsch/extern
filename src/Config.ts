import { $$asyncScope, $$scope, $$syncScope, type $$Scope } from "./Scope";

/**
 * The available configurations for this library.
 */
export interface $$Configuration {
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
  scope?: "async" | "sync";
}

export interface $$Config {
  scope: $$Scope;
}

export const fromConfiguration = async (
  configuration: $$Configuration,
): Promise<$$Config> => {
  return { scope: await $scope(configuration) };
};

const $scope = (configuration: $$Configuration): Promise<$$Scope> => {
  switch (configuration.scope) {
    case "async":
      return $$asyncScope();
    case "sync":
      return Promise.resolve($$syncScope());
    case undefined:
      return $$scope();
    default:
      throw new Error(
        `Invalid configuration option for scope: ${configuration.scope}`,
      );
  }
};

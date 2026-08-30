# @ghostry/extern-extension-fabricator-v0

[`@ghostry/fabricator`](https://github.com/ghostry-dev/fabricator) integration
for [`@ghostry/extern`](https://github.com/pjrebsch/extern).

A `typed` extern block built from a fabricator schema becomes **self-mocking**:
with no mock defined it fabricates a value from its own schema instead of
throwing `NotMockedError`.

## Setup

```ts
import { initialize as initializeExtern } from "@ghostry/extern";
import { initialize as initializeFabricator } from "@ghostry/fabricator";
import { fabricatorExtension } from "@ghostry/extern-extension-fabricator-v0";

const fabricator = initializeFabricator({ seed: "my-suite" });

export const extern = await initializeExtern({
  extensions: [fabricatorExtension({ instance: fabricator })],
});
```

The widening applies to **this instance alone**. An extern instance without the
extension still rejects fabricator schemas as identities, exactly as before.

## Using it

```ts
const { T } = fabricator;

const user = T.object({
  id: T.number,
  name: T.string.whereby({ length: { max: 10 } }),
});

const load = () => extern.typed.by(user).will(() => fetchUser());
```

Inside a testing block, `load()` fabricates a `{ id, name }` with no mock
written:

```ts
await extern.testing(() => {
  expect(load()).toMatchObject({ id: expect.any(Number) });
});
```

### Overriding outright

```ts
await extern.testing((mock) => {
  mock(user).with({ id: 1, name: "Ada" });
});
```

### Shaping the fabrication

`produce()` fabricates and hands back a spy. Given a callback, it hands you the
built Fabricator, so overrides are expressed in fabricator's own vocabulary —
this package models none of it:

```ts
await extern.testing((mock) => {
  mock(user).produce(({ via }) => via.fabricate({ name: "Ada" }));

  expect(load().name).toBe("Ada");
});
```

`via` is the built `Fabricator`, so an object's `fabricate(overrides)` carries
fabricator's own `Override<Definition>` — nested objects, the `Omitted`
sentinel, and all. Everything else it carries is reachable too, `trace` and
`schema` included. Both `produce()` and `produce(fn)` **cache** per
`(identity, name)`: the callback runs once, and reading the block twice in one
test agrees.

`via` is the built Fabricator for whichever kind the identity is, so the
callback form is available on every schema — not object schemas alone. What
differs is what that Fabricator accepts: an object's `fabricate` takes
overrides, a `T.number`'s takes none. That is fabricator's own type saying so,
not a rule this package imposes.

### Requiring an explicit mock

```ts
fabricatorExtension({ instance: fabricator, unmocked: "error" });
```

Blocks then throw `NotMockedError` again unless mocked, while `produce()` still
fabricates on demand.

## Determinism

**Two different files** feed each fabricated value:

- **The seed layer** comes from the file that opened the testing block — the
  one that called `extern.testing(...)`, so in practice your test file
  (`:line:col` stripped, making the layer per-file rather than per-line).
- **The attribution** comes from the file that wrote the `by(...)` call. Extern
  blocks normally live in your source, so this is usually _not_ the test file.

Together they give:

- the same block fabricates the same value across independent `testing()` calls
- reordering or inserting blocks within a file does not perturb another block
- the same schema exercised from a different _test_ file draws differently
- moving the block itself to a different _source_ file changes its attribution

Attribution is relative to your fabricator instance's own attribution root —
never to `process.cwd()`, which would otherwise re-seed the suite depending on
which directory you ran the tests from.

> One caveat, since it can surprise you: attribution reads the call stack, and
> a trivial one-line wrapper around `by(...)` can have its frame elided
> entirely (Bun's engine implements proper tail calls). Attribution then falls
> through to _that_ wrapper's caller. It is deterministic — the same code
> shape resolves the same way every run — but refactoring such a wrapper into
> or out of a single expression can shift the values it fabricates.

A user's own `new fabricator.Fabricator(schema)` written inside a testing block
shares that block's seed, but is a **separate draw** — successive ordinals in
one stream — not a second view of the block's value.

Two blocks over one schema in one test are a single production. Give them
`named(...)` to make them distinct; that name feeds the seed.

## Requirements

Needs an async stack carrier, which means any runtime with `node:async_hooks`
— Bun, Node, and Deno. Extern's testing block is inherently asynchronous and
this extension runs it inside fabricator's `wrap`, which refuses an async block
under the synchronous carrier a browser bundle selects.

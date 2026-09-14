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

const fabricator = initializeFabricator({ salt: "my-suite" });

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

Every testing block gets a fresh construction counter, inheriting the
fabricator instance's salt and layering one foreknown constant onto it — never
anything derived from where a block was written. That gives:

- the same block fabricates the same value across independent `testing()` calls
- the same schema exercised from a different test file draws the same value
- construction order within one testing block determines unnamed values

A user's own `new fabricator.Fabricator(schema)` written inside a testing block
shares that block's source, but is a **separate draw** — successive ordinals in
one stream — not a second view of the block's value.

One written _outside_ the block draws from the enclosing scope instead. The
constant layer is what keeps those two streams disjoint: a fabrication either
side of a testing block can never collide with one inside it, at any ordinal.

Two blocks over one schema in one test are a single production. Give them
`named(...)` to make them distinct.

A name does more than disambiguate. It lifts a block out of positional identity
altogether: a named block's value is a function of its identity and its name,
and of nothing else — so it holds still against whatever else the test
fabricates ahead of it. Add a second fixture above it, or a helper that
fabricates on its way past, and a named block keeps its value where an unnamed
one moves. That is the trade the two forms make, and it is why the bullet above
is scoped to unnamed values.

### With a test harness

`@ghostry/fabricator/harnessing` opens a `wrap` of its own per test, salted by
that test's identity. This extension's scope then runs _inside_ it, and the two
nest rather than compete: blocks inside `extern.testing` inherit the enclosing
test's salt, and its clock along with it.

That nesting is deliberate rather than automatic. A `wrap` lays its overlay over
the instance it was called on, so a receiver bound outside the running block —
which the configured instance always is — would restate from that instance and
drop the enclosing scope. This extension composes against `context.scope()`, the
frame in effect, which is why the per-test salt arrives.

The construction ordinal does not carry through — every testing block
re-instantiates, as above — but the scope's constant salt layer keeps the
block's stream disjoint from the enclosing test's, so a `fabricate()` written
either side of `extern.testing` never collides with one inside it.

The harness's own `context.fabricator` stays usable inside a block. It holds the
harness's scope rather than this extension's, but a construction resolves
against the innermost active frame, so it draws in step with the blocks around
it.

Both halves must come from **one `initialize()`**:

```ts
const fabricator = initializeFabricator({ salt: "my-suite" });

// harness integration and extension, one lineage
integration(fabricator);
fabricatorExtension({ instance: fabricator });
```

A frame is visible only to instances on its own ancestral line. Two
`initialize()` calls mint unrelated lineages and never see each other's frames
— not even when handed the same `stack`, which selects a carrier and nothing
more. So an extension pointed at a _second_ instance never observes the
harness's frame and falls back to its own configuration: the per-test salt is
lost and every test fabricates identically, with no error raised. A `fork()`
stays within the lineage and is fine to pass.

Determinism survives that; **distinctness** does not. The symptom is tests that
write a fabricated id into shared state colliding with each other — passing
individually, failing as a suite, and passing again under `.only`, which sends
you looking for pollution rather than for the wiring.

Where both instances are in scope, you can assert it directly — `root` is
fabricator's answer to "same lineage?":

```ts
if (integrationInstance.root !== extensionInstance.root) {
  throw new Error("fabricator instances are from different lineages");
}
```

Where they are not — the two halves wired in separate modules, which is how this
goes wrong in practice — one guard test in the suite's own setup covers it:
fabricate the same schema under two different test identities and assert the
values differ.

## Requirements

Needs an async stack carrier, which means any runtime with `node:async_hooks`
— Bun, Node, and Deno. Extern's testing block is inherently asynchronous and
this extension runs it inside fabricator's `wrap`, which refuses an async block
under the synchronous carrier a browser bundle selects.

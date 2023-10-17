---
title: "DefinitelyTyped is a monorepo!"
date: "2023-10-17T11:22:43-07:00"
summary: "Yes, it is! But for real this time!"
description: "Yes, it is! But for real this time!"
tags:
  - TypeScript
  - DefinitelyTyped
  - monorepo
---

## _Previously, on "Is DT a monorepo?"_

In a [previous post]({{< ref "posts/pnpm-dt-1" >}}), I talked about the layout
of DefinitelyTyped and how it was indeed a monorepo, albeit a funky one. In
short, packages were laid out (more or less) like this:

```plaintext
types/
  gensync/
    tsconfig.json
    index.d.ts
  node/
    tsconfig.json
    index.d.ts
    package.json
  react/
    tsconfig.json
    index.d.ts
    package.json
```

And so on. Each `tsconfig.json` file contained bits like:

```json
{
    "compilerOptions": {
        "baseUrl": "../",
        "typeRoots": [
            "../"
        ],
        "types": []
    }
}
```

This config means that when a types package looks for itself or another package,
it can map to other directories in `types`; no `package.json` is needed. At
publish time, we detected dependencies and add them. If a package needed an
external dependency, then the package _would_ need a `package.json` file with
that dependency declared.

This provided a monorepo-like feel without any symlinking, but with many
downsides, including:

- Long `npm install` times when external dependencies are needed, especially
  when testing the entire repo. The tooling just looped over every folder with a
  `package.json` and ran `npm install`.
- Completely unrealistic module resolution (no `node16`/`nodenext`, no `export`
  maps, etc.) thanks to the use of `baseUrl`, `typeRoots`, and `paths`. Not even
  `typesVersions` works.

I also talked about [what we could do]({{< ref "posts/pnpm-dt-1#what-next" >}})
to remedy the situation, which boils down to "what if we were just a monorepo
like everyone else uses in the JS ecosystem and let a package manager handle
things"?

## Making `fetch` happen

Obviously, all of that was a good 6 months ago. There were some unresolved
blockers that made me put the project on the backburner. What changed?

Recently, Andrew merged
[`fetch` support](https://github.com/DefinitelyTyped/DefinitelyTyped/pull/66824)
into `@types/node`. Yay!

But, you might have noticed that _only_ `@types/node@20` got this feature.
Surprise! It's the second bullet point from above. DefinitelyTyped's fake module
resolution
[broke resolution](https://github.com/DefinitelyTyped/DefinitelyTyped/pull/66824#issuecomment-1734391407)
inside `undici-types`, the package `@types/node` depends on to provide `fetch`
types (without depending on `undici` itself, which is vendored into Node). The
effect of this is that we could only add `fetch` to the _latest_ types for Node,
not to any older versions. In fact, if `@types/node@22` were needed, we'd have
to _drop_ it from `@types/node@20`! Boo.

This problem shuffled the whole "DefinitelyTyped monorepo" thing straight to the
top of our interest list.

And so with that, I'm happy to say that after a few weeks of effort from
[Nathan](https://github.com/sandersn),
[Andrew](https://github.com/andrewbranch), and myself, we're actually doing it!
DefinitelyTyped is becoming a monorepo!

## Hello, `pnpm`

If you've read the previous posts, you won't be surprised to find that we're
using `pnpm` to do this. All modern package managers have some sort of monorepo
support these days, but DefinitelyTyped's unique situation limits what we can
use. Specifically, DefinitelyTyped contains _multiple versions_ of the same
package. For example, we currently have `@types/react` v15-v18, `@types/node`
v16-v20, and so on. Both `npm` and `yarn` exit early when they see two workspace
packages with the same name. Understandable\![^package-naming] But, we need to
do it somehow.

[^package-naming]: Honestly, this is a little unsatisfying. If you think about
it, all package managers already need to be able to handle multiple versions of
the same package when they're sourced from the npm registry. Theoretically, they
could support multiple versions of workspace packages, but alas, no.

With `pnpm`, this "just works". Internally within `pnpm`, workspace packages are
identified by their paths, so there's no conflict. Then, when `pnpm` goes to
resolve packages, it only cares about the `name` and `version`. This actually
means we get something better than just "it doesn't fail"; it can actually
_resolve_ to these workspace packages based on their versions! It behaves just
as though the packages were provided by the `npm` registry. So long, `paths`.

There's a bunch more goodness `pnpm` provides, but for now, let's just look at
the new layout.

## The new layout

Anyone who's worked in a monorepo will not be surprised by the new layout. Now,
we have:

```plaintext
types/
  gensync/
    tsconfig.json
    index.d.ts
    package.json # new!
  node/
    tsconfig.json
    index.d.ts
    package.json
  react/
    tsconfig.json
    index.d.ts
    package.json
```

Every `@types` package now _requires_ a `package.json`, even if it doesn't have
any external dependencies. Let's take a look at what's inside. Here's the new
bits of `package.json` for `@types/jsdom`:

```json
{
    "private": true,
    "name": "@types/jsdom",
    "version": "21.1.9999",
    "projects": [
        "https://github.com/jsdom/jsdom"
    ],
    "minimumTypeScriptVersion": "4.5",
    "dependencies": {
        "@types/node": "*",
        "@types/tough-cookie": "*",
        "parse5": "^7.0.0"
    },
    "devDependencies": {
        "@types/jsdom": "workspace:."
    },
    "owners": [
        { "name": "Leonard Thieu", "githubUsername": "leonard-thieu" },
        { "name": "Johan Palmfjord", "githubUsername": "palmfjord" },
        { "name": "ExE Boss", "githubUsername": "ExE-Boss" }
    ]
}
```

That's a lot of stuff. Much of this is information that was previously a part of
the `index.d.ts` "header", i.e. something like:

```ts
// Type definitions for jsdom 21.1
// Project: https://github.com/jsdom/jsdom
// Definitions by: Leonard Thieu <https://github.com/leonard-thieu>
//                 Johan Palmfjord <https://github.com/palmfjord>
//                 ExE Boss <https://github.com/ExE-Boss>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// Minimum TypeScript Version: 4.5
```

In the new layout, we're going to be using a package manager, so we need to
declare a `name` and `version` to get packages to link up. That's the first bit
of the header. At that point, we may as well just move everything into JSON and
be done with it. Additionally, this means that tools wanting to grab info about
a DefinitelyTyped package don't need to parse the header text; it's all in
`package.json`.

Let's break down the fields.

### `private`

```json
{
    "private": true
}
```

This is always set to true, telling `pnpm` to not attempt to publish this
package to the registry. The DefinitelyTyped publisher handles publishing.
Packages that had a `package.json` previously already had this set, so this is
nothing new.

### `name`

```json
{
    "name": "@types/jsdom"
}
```

This is new! Previously this was declared only via the directory name, but now
we're going to be using `pnpm` to handle things, so we need to specify this.

### `version`

```json
{
    "version": "21.1.9999"
}
```

This one's funky; it's _almost_ what we put in the header, but with a patch
version of `9999`. When DT packages are published (automatically on a schedule),
the patch version is generated; it's just whatever the previous version was,
plus one. So the patch version that's actually in the repo never matters.

At development time, we're making use of the fact that `pnpm` can resolve to
local versions. Normally, we could set `prefer-workspace-packages`, which would
force `pnpm` to always link to the local workspace package. But we actually have
a few packages which _intentionally_ point to old versions of `@types` packages.
If we were to do the much nicer thing of using `0` as our patch version, the
version from the registry would always be chosen instead. So, we can't use
`prefer-workspace-packages`. Instead, we just pick an arbitrarily high patch
version, such that it will always be newer than what's in the registry, hence
`9999`. 9999 publishes ought to be enough for anyone, right?

### `projects`

```json
{
    "projects": [
        "https://github.com/jsdom/jsdom"
    ]
}
```

This is an array of helpful links to info about a project. Usually it contains a
GitHub link, but can sometimes contain more.

### `minimumTypeScriptVersion`

```json
{
    "minimumTypeScriptVersion": "4.5"
}
```

This defines the minimum supported version of TypeScript version for a package.

### `dependencies`

```json
{
    "dependencies": {
        "@types/node": "*",
        "@types/tough-cookie": "*",
        "parse5": "^7.0.0"
    }
}
```

This isn't new, but it is bigger! Dependencies on `@types` packages are now
_explicit_. No longer can every package access every other package; `pnpm` won't
link them. This removes the complexity of the infrastructure; we don't need to
parse the code or rely on heuristics to figure out what packages depend on what.

Additionally, this makes `pnpm` fully aware of how the packages interrelate,
meaning that we can use fun features like `--filter` (more on that later).

### `devDependencies`

```json
{
    "devDependencies": {
        "@types/jsdom": "workspace:."
    }
}
```

This is new. For the most part, this will contain just one thing; a
self-dependency. Without the `baseUrl`/`typeRoots`/`paths` combo, a package
can't find itself anymore, but that's the API that we're wanting to test. `pnpm`
doesn't yet support creating self-links, so we do it ourselves using a
`workspace:.` specifier.[^self-link]

This list can also contain packages that are needed for testing. This
technically an improvement over the previous setup, which didn't allow
`devDependencies` at all. But, it's generally better to not have any testing
dependencies anyhow.

[^self-link]: Technically, `link:.` would also work, but for "reasons",
`workspace:.` has better performance.

### `owners`

```json
{
    "owners": [
        { "name": "Leonard Thieu", "githubUsername": "leonard-thieu" },
        { "name": "Johan Palmfjord", "githubUsername": "palmfjord" },
        { "name": "ExE Boss", "githubUsername": "ExE-Boss" }
    ]
}
```

This is a list of the users that "own" the package. They get pings when people
send PRs to packages and can approve them. This used to be in the as URLs (as
that's the syntax needed for the `contributors` array in `package.json`), but
our tooling only wants usernames and loads of people incorrectly typed their
GitHub profile URLs. For owners that aren't directly on github, `url` can still
be passed (though not shown above).

### `nonNpm`, `nonNpmDescription`

```json
{
    "nonNpm": true,
    "nonNpmDescription": "Google Maps JavaScript API"
}
```

My example didn't have these two, but some of the packages in DefinitelyTyped
describe things that aren't `npm` packages at all. For example,
`@types/google.maps` describes the Google Maps API (a global), and had a header
like:

```ts
// Type definitions for non-npm package Google Maps JavaScript API 3.54
```

This info is used to inform various checks and is carried into the published
package. In the new layout, this information is represented in JSON.[^nonNpm]

[^nonNpm]: There's still some clarity needed about what these fields are
supposed to represent. There are quite a few packages (~200) that don't have
this field set but aren't on `npm` either. We'll get it sorted; my hope is that
this field becomes defined specifically as "this package is not on npm, do not
look at npm for it, but if you do find an npm package with this name, then that
may be a problem so CI should fail until we triage the problem".

## Installing dependencies

Let's start by doing the naive thing and just run `pnpm install` in the root of
the repo.

```console
$ pnpm install
Scope: all 9114 workspace projects
...
Done in 3m 35.4s
```

Wow, that's a lot of install. But it's a major improvement over the previous
layout, where installing the entire repo (with 10x fewer `package.json` files)
took some 30 minutes.

The good news is that those working on DT don't actually need to install the
entire repo. `pnpm` supports [filtering](https://pnpm.io/filtering). Let's say
I'm working on `@types/node`, and want to be able to test it and any packages it
depends on. I can run:

```console
$ pnpm install -w --filter '...@types/node...'
Scope: 2722 of 9114 workspace projects
...
Done in 1m 2.5s
```

That's a good bit better! Since we have explicit dependencies, `pnpm` can
actually figure out what packages are needed for `@types/node` and install
those, but also figure out which packages _depend_ on `@types/node` and install
those too. The `-w` tells `pnpm` to also install the workspace root, which is
needed to get the DefinitelyTyped tooling, linters, `dprint`, etc.

What about package that _isn't_ so hefty?

```console
$ pnpm install -w --filter '...@types/lodash...'
Scope: 372 of 9114 workspace projects
...
Done in 7.2s
```

Now we're talking. Most packages won't need to do a huge install, so long as
people read the docs (🙃) to know how to avoid the big install.

From this point on, the workflow is the same as DefinitelyTyped was before.

### Filtering in CI

There's one other cool trick that we can use in CI; not only can we filter by
package name, but we can also filter by what changed since a specific git ref.
In a PR build, we can use:

```console
$ pnpm install -w --filter '...[origin/master]'
```

And only get what we need.

## Other misc improvements

There's also a grab bag of other improvements that come with this change. In no
particular order:

- Having to redo a bunch of the DefinitelyTyped tooling has led to improvements
  like `dtslint-runner` no longer bailing early on certain kinds of errors. Many
  more things are collected for reporting at the end such that doing one thing
  wrong doesn't hide the problem until a second run.
- As a part of making everything work in the new monorepo, we manually fixed a
  few _hundred_ packages. These packages were silently broken (or at least,
  weird) in various ways. For example, multiple packages imported the `events`
  library. This could mean `@types/node`, but it could also mean
  `@types/events`. In practice, it resolved to the latter, but then sometimes,
  the tooling would say the package depended on _neither_ (probably due to a bug
  in the implicit dependency resolution). Now, each package actually has to say
  which they need. There are other weird things besides just this; invalid
  `references` directives, packages depending on the wrong versions of things,
  etc.
- Having a complete working `package.json` for every package means that one can
  theoretically just `npm pack` and get a working tarball. This is likely to
  become useful for tools like
  [Are The Types Wrong](https://arethetypeswrong.github.io/), although the
  publisher still does a bunch of stuff (notably, deciding which files actually
  get included in each package, which is still mostly implicit).
- It turns out that a load of `react`-based types packages are broken at the
  moment due to `@types/react` using `typesVersions`. Since `typesVersions` is
  in `package.json`, but `baseUrl`/`typesRoot`/`paths` skip `package.json`
  resolution, packages that depend on `@types/react` always get the types meant
  for TS 5.1 and above. Oops. With actual `node_modules` linking, this isn't a
  problem and things work as intended. Another reason to speed this along.

## It's not all rainbows and sunshine

Everything I've described so far has been an improvement over the previous
layout. But there are some warts left to figure out.

### Using `shared-workspace-lockfile=false`

The astute reader may have noticed that the performance of `pnpm install` seems
_way_ slower than expected, especially given the numbers I achieved in the
[previous post]({{< ref "posts/pnpm-dt-2" >}}) about making `pnpm` faster.

The reason for this slowdown is our use of `shared-workspace-lockfile=false`.
This is a lesser-used option which instructs `pnpm` to instead handle each
workspace package individually. Each package gets is own dependency graph, and
calculating that 9000 some times is a lot slower than doing it once.

Why enable it, then? It's a bit hard to fully explain. I filed
[an issue](https://github.com/pnpm/pnpm/issues/6457) for it upstream, but the
gist is that since `pnpm` is stricter about how it handles dependencies (they
aren't just all hoisted to the top), the combo of so many packages forgetting to
declare dependencies on `@types` packages along with some packages (outside DT)
explicitly depending on `@types/node@17` (why??) causes the "fallback"
`@types/node` to point to that awkward v17 version.

I haven't quite figured out what the best solution is; it's possible that `pnpm`
could gain a yarn-like hoisting-limit system to avoid this problem, or always
resolve "fallback" dependencies to the latest version.

I had previously skipped working on this project due to this problem, but the
upsides of the migration (especially with `fetch` getting thrown in the mix)
tipped the scales. Although `shared-workspace-lockfile=false` is quite a bit
slower, it's still an improvement when installing the entire repo, and filtering
provides a very straightforward way to reduce the cost of package installs.

Just to show what the difference is, here's the install without this setting.

```console
$ pnpm install
Scope: all 9114 workspace projects
...
Done in 1m 5.8s

$ pnpm install -w --filter '...@types/node...'
Scope: 2722 of 9114 workspace projects
...
Done in 30.2s

$ pnpm install -w --filter '...@types/lodash...'
Scope: 372 of 9114 workspace projects
...
Done in 7.9s
```

Not helpful super for a small number of packages, but quite a bit faster if you
ever need to work with the whole thing.

### `git clean` is broken on Windows

`pnpm` uses symlinks under the hood. On POSIX-ish platforms like Linux and
macOS, this is all good; symlinks work for any user and behave as expected. On
Windows, however, the story is different. For a very long time, the only way to
get "real" symlinks was to gain elevated permissions. Without being an admin,
the best you could hope for was a "junction". I'm not sure I could explain the
ins and outs of junctions other than to say that they're _like_ a symlink, but
only for directories, and they act kinda weird sometimes. But, they do the job.

There's a gotcha; if you run `git clean`, `git` treats junctions as directories!
This is normally not a big deal, but every one of our packages has a self link,
which makes the symlinks recursive. And since `git` doesn't treat junctions like
symlinks, `git clean` will just keep recursing infinitely until it hits the max
path length. It may _eventually_ finish, but without loads of errors and
complaining.

There are two ways forward:

- Make `git` treat junctions as symlinks. I sent
  [a PR for this](https://github.com/git-for-windows/git/pull/4383) earlier this
  year, but it hasn't yet been accepted. I personally think this is the correct
  solution; if `git clean` had been implemented in shell scripts (like much of
  `git`), it would have treated junctions as symlinks and just worked. But
  `git clean` is written in C, so instead of going through `git-bash`, it goes
  through the shims which translate the POSIX-y file system accesses into the
  Windows API, and those shims disagree with `git-bash`.[^git-for-windows]
- Make `pnpm` use real symlinks. You're probably confused; didn't I just say
  that you needed elevated privileges to do that? Normally, yes, but if you
  enable Developer Mode, any user is able to make symlinks! And, I fully suspect
  that most people developing on Windows have this enabled. You even need
  enabled to enable WSL. This is probably a good idea whether or not `git`
  changes; real symlinks don't have the same warts as junctions. I'll disclaim
  that I haven't actually proposed this change upstream. There are some gotchas
  in that it may be awkward to enable this automatically (what happens if you
  end up with a `node_modules` with both junctions and symlinks?), but I think
  it should be straightforward to detect.

[^git-for-windows]: It's absolutely possible that my take is the wrong one here;
I know Go recently recently changed things to treat these special reparse points
as some sort of "irregular" file. Honestly, I have no clue.

For now, DefinitelyTyped has included a script Windows users can run to clean up
`node_modules`; `pnpm run clean-node-modules` will find and delete all
`node_modules` directories within the repo. Good enough for now.

### Removing a package won't expose breaking changes in newly-typed packages

This one's subtle. Imagine we have a package `@types/foo`. Another package (in
the repo or even external) depends on `@types/foo`. But, `foo` has just gained
types, which means that it's time to remove `@types/foo` from DefinitelyTyped.

In the old layout, we'd delete the directory and add it to `notNeededPackages`.
When the PR that does this is merged, the publisher will publish one final
version of `@types/foo` that contains only a `package.json` with a dependency on
the real `foo`.

But, when you're actually working on the PR that does this, the shim package
hasn't yet been published! If another package within DefinitelyTyped depends on
`@types/foo` it will stop pointing to the one in the repo (it's been deleted).
In the old layout, things would stop compiling until dependencies are updated.
But in the new layout, `pnpm` will just resolve to the latest version of
`@types/foo` in the registry, which will be exactly the same code that is being
deleted. This means that the PR will definitely pass CI, when it may actually
fail later if the real upstream `foo` package has types which differ enough to
break things.

There's not really a great solution to this other than to ban external
dependencies on `@types` packages that aren't contained in the repo; that
handles some of the situations but not all. (If you have any clever ideas, let
me know.)

### Removing a package isn't reflected in pnpm git filter

In addition to the above, when we delete a package, `pnpm`'s behavior for
`--filter '...[origin/master]'` doesn't pick up on the removed package. In an
ideal world, it'd see the package removed, and then figure out which local
packages are affected by the removal. But, it doesn't do that, either simply
because the package is gone (so there's no more edges to check), or due to the
previous section (where the package is still there, just not in the repo). The
workaround is to instead use
`pnpm ls --depth -1 --filter '...@types/removed...'` to get some sort of list of
what may need to be tested. In CI, if a `package.json` is removed from the repo,
we also don't use `pnpm install --filter '...[origin/master]'`, resorting to a
complete install.

## Future work

After this is merged, we're still not done! There is some exiting stuff that
gets unlocked:

- Since there's no more header, there's nothing special about `index.d.ts`
  anymore. Since we're trying to get DT as close to the upstream packages as
  possible, it may actually be _wrong_ to have an `index.d.ts` if the package
  doesn't contain `index.js`. We should be able to remove the requirement that
  packages have an `index.d.ts`.
- Right now, there's no way to really verify that types work properly for people
  using `nodenext` resolution (though, some analysis has shown that
  DefinitelyTyped does _better_ in this regard than those publishing types
  themselves).Now that everything works via `node_modules`, we could finally use
  enable those options in `tsconfig.json` and verify that things work. Maybe
  even required.
- We could offload even more of `dtslint-runner` onto `pnpm` scripts.
- We could move tests out into their own packages, forcing them to use the
  public APIs of the packages they're testing. Or even, have multiple
  `tsconfig`s to make sure things work with various settings.

## Anyway...

I hope this info dump was interesting; I'm really excited to see this change
happen.

Big thanks to everyone involved with this big migration, including
[Nathan](https://github.com/sandersn) and
[Andrew](https://github.com/andrewbranch) from the TypeScript team,
[Zoltan](https://github.com/zkochan) of `pnpm` fame, and everyone who spent time
finding _more_ ways to speed `pnpm` and `semver` up for our ridiculous use case.

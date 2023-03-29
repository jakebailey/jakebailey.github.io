---
title: "What is DefinitelyTyped, and is it a monorepo?"
date: 2023-03-26T11:26:21-07:00
summary: "Yes, it is! Kinda."
description: "Yes, it is! Kinda."
tags:
  - TypeScript
  - DefinitelyTyped
  - monorepo
---

## What is "DefinitelyTyped"?

Generally speaking, there are two categories of packages on npm:

1. Packages authored in TypeScript.
1. Packages authored in JavaScript.

Whenever you install a package authored in TypeScript, you'll also get its
types.[^declaration true] This means that when you import it in your own
project, you'll get the types that the authors wrote in their code. This is the
easy path; the hard work is done!

[^declaration true]: If the author set `"declaration": true` and published them,
anyway.

But what if the package _wasn't_ written in TypeScript? In this situation, it
may be the case that the author hand-wrote types for their package, but most of
the time, you'll have to install types separately. It's likely you've installed
a package like `@types/node` or `@types/react`.

Packages published under the `@types` scope come from
["DefinitelyTyped"](https://github.com/DefinitelyTyped/DefinitelyTyped), aka
"DT". DT is huge, comprising of 8,000+ packages, 6,000+ package owners, and
17,000+ unique contributors since its inception in 2012. Operating at this scale
is hard, but the infrastructure is powerful enough to automate most PRs and
automatically publish these packages every half hour.

## How is DT laid out?

In the DT repo, there's a directory named "types", and that directory has all
8,000+ packages. With so many packages, you'd expect this to be one of those
newfangled "monorepos" everyone's been talking about. And it is! Well, kinda.

It turns out that even though there are over 8,000 packages in the repo, there
are only about 1,200 `package.json` files. What gives? How does anything work?

Let's look a file that every package _does_ have; `tsconfig.json`. Here's the
`tsconfig` for `@types/minimist`:

```json
{
    "compilerOptions": {
        "module": "commonjs",
        "lib": [
            "es6"
        ],
        "noImplicitAny": true,
        "noImplicitThis": true,
        "strictNullChecks": true,
        "strictFunctionTypes": true,
        "baseUrl": "../",
        "typeRoots": [
            "../"
        ],
        "types": [],
        "noEmit": true,
        "forceConsistentCasingInFileNames": true
    },
    "files": [
        "index.d.ts",
        "minimist-tests.ts"
    ]
}
```

Pretty standard stuff, but this is the critical subset:

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

What does this do?

- [`baseUrl`](https://www.typescriptlang.org/tsconfig#baseUrl) defines a path
  where TypeScript is allowed to perform absolute lookups. So if this package
  were to write `import _ from "lodash"`, TypeScript will look for that in the
  `types` directory.
- [`typeRoots`](https://www.typescriptlang.org/tsconfig#typeRoots) tells
  TypeScript to consider the `types` directory to be the `@types` directory that
  would typically be in `node_modules`; now, it can find `@types/lodash` as
  `/types/lodash`!
- [`types`](https://www.typescriptlang.org/tsconfig#types) configures which
  `@types` packages are automatically included in the compilation. This can be
  convenient for typical projects since installing `@types/node` will declare
  all of Node's packages and ambient types. But on DT, this is a bad idea,
  because we'd pull _every_ `@types` package in. Setting this to the empty array
  stops this and allows us to manually pull things in with
  `/// <reference types="...">`.

The combined result is that DT works like a monorepo already, just without the
involvement of a package manager (for the most part). If a package depends on
another DT package, the publisher detects that import and automatically adds a
dependency to the final package when publishing to npm.

And so, DT is a monorepo, but, it also isn't, at least not in the way that
people have come to know _most_ monorepos in the JS world.

Of course, there are exceptions to every rule. A small fraction (~15%) of DT
_do_ have `package.json` files. This is because some packages depend on the
types of packages _not in DefinitelyTyped_. This makes sense; a lot of packages
are now written in TypeScript directly, and so publish their types directly,
without involving DT. If a package typed on DT depends on a package that already
has types, then the DT types will likely need types from that dependency as
well.

## What's the problem?

It turns out that we've recently felt the need to change the status quo, for at
least two reasons.

Firstly, since each package with a `package.json` needs its own external
dependencies, we need to run `npm install`. But, we're not a monorepo! This
turns into over _30 minutes_ of just looping over every folder with a
`package.json` and running `npm install`. Recently (as of writing), we've had
issues with the install step randomly timing out. It's really frustrating for
the TypeScript team as we test all of DefinitelyTyped on most type checking
changes, just to make sure we don't break anyone (or, only break things in
_desirable_ ways).

Secondly, you may remember that the `tsconfig.json` from earlier set
`"module": "commonjs"`. This is the _only_ valid configuration on DT and it has
worked for a very long time. But as more and more packages start using features
like ESM and export maps, DT needs to be able to support those features. And it
does! Mostly. The `"module": "commonjs"` lie can be worked around for the most
part, but DT _should_ really be set to `"moduleResolution": "node16"` and then
actually _test_ that the packages and their dependencies and dependants actually
work in that more modern mode.

A solution to both of these problems is to turn DefinitelyTyped into a monorepo
more like what other major projects are doing, meaning:

- Add a `package.json` to every DT package.
- Explicitly declare all dependencies, even those within the repo.
- Let a package manager or monorepo tool link the projects in `node_modules`.
- Install everything at once.
- Drop `baseUrl` and `typeRoots` out of every `tsconfig.json`.

This (theoretically) gets us a much faster install time, as well as getting us a
final state on disk that matches what downstream users see, enabling packages to
start making use of `"moduleResolution": "node16"`.

## What next?

This is a cool idea in theory, but to make it real, we have to make some
choices. Specifically, the tooling. There are some unique restrictions which
make this choice complicated:

- The tool has to be handle the 8,000+ DT packages and their external
  dependencies.
- The tool shouldn't hoist anything, unless it's safe to do so. We don't want to
  accidentally resolve anything.
- The tool must be able to handle multiple versions of packages in `types` (e.g.
  `@types/react` in `types/react`, `@types/react@v17` in `types/react/v17`, and
  so on).
- The tool should be fast. Right now, if you work on one package, you may not
  even need to install anything. If you do install a package, you're only going
  to pay for the cost of installing that one DT package's deps. If we have to
  get the whole monorepo, that experience hopefully shouldn't suffer.
- The tool shouldn't try and do anything else. We just want package linking, not
  a build system. There's nothing to build!

This set of requirements really narrows it down; at the time of writing, the
only package manager which meets these requirements is
[`pnpm`](https://pnpm.io/). The other choices either ban packages of duplicated
names, are generally not configurable enough, or take too long to install
(though no option is likely _slower_ than the 30 minute CI install). I'm not
super surprised; `pnpm` is the default package manager of the
[`rushstack`](https://rushstack.io/) tooling and there are some pretty
ridiculously sized monorepos using it.

Even still, `pnpm`'s great performance still _felt_ a little slow. I noticed
that on install it'd hang and then start printing text, implying some
performance problem. Not shocking; the number of packages it finally resolves to
is [over 9,000](https://www.youtube.com/watch?v=SiMHTK15Pik), and I'd think any
tool would chug with that much work to do.

But, there's good news! By profiling `pnpm install`, I discovered that that the
performance holes are mostly just cases of
["accidentally quadratic"](https://accidentallyquadratic.tumblr.com/) code, and
therefore can be addressed.

And that's the _actual_ thing I wanted to write about before I got carried away.
For details on that, check out the [next post in this series]({{< ref
"posts/pnpm-dt-2" >}}).

## 👋 package manager maintainers

There's no doubt in my mind that this post will eventually make its way to the
maintainers of the other package managers and monorepo tools. Understand, I
really truly do not mean anything negative in the above. I use all of your tools
and they're all great! My focus on `pnpm` above is due to the fact that I'm able
to make immediate progress with it and that it also lets me demo some cool
profiling techniques I've been meaning to share for a while. I have no idea how
DT will actually end up, we're just hurting _now_ and I'm finding this fun to
play around with.

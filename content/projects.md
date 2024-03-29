---
title: Projects
layout: single
summary: projects
showReadingTime: false
showToc: false
showWordCount: false
---

Here's a listing of a few of my side projects.

## hereby

[hereby](https://hereby.js.org) is a simple task runner, kinda like `gulp` or
`make`, but much smaller (\~500 lines). I created it during the
[conversion of TypeScript to modules](https://devblogs.microsoft.com/typescript/typescripts-migration-to-modules/)
so I could better represent the dependency graph of all of our build steps, as
well as eliminate a huge swath of devDependencies.

Go ahead and use it, if you dare; the only user I plan on actually supporting is
TypeScript itself, though some daring projects appear to have switched to it.

## every-ts

[every-ts](https://github.com/jakebailey/every-ts) is a utility that can build
and bisect any version / commit of TypeScript. It's useful for finding which PR
broke (or fixed) something, without figuring out how to build TypeScript.

## pprof-it

[pprof-it](https://www.npmjs.com/package/pprof-it) is wrapper for pprof,
allowing for quick and easy profiling of Node programs that can be loaded into
the [pprof tooling](https://github.com/google/pprof). If I'm profiling something
that can be run at the CLI, I'm using this.

## esbuild-playground

[esbuild-playground](https://jakebailey.dev/esbuild-playground/) is "yet
another" playground for esbuild. Like the TypeScript playground, it supports
links and auto-compiles as you type. It's very basic right now, but whenever I
get some free time (hah) I'll expand it.

## pyright-action

[pyright-action](https://github.com/jakebailey/pyright-action) is a GitHub
Action for pyright (a type checker for Python), allowing for fast execution
through caching, plus PR comments for errors.

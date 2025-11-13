---
title: Public Speaking
layout: single
summary: public-speaking
showReadingTime: false
showToc: false
showWordCount: false
---

Here's all of my public speaking stuff, or at least what's out there on the
internet.

## What's Coming in TypeScript 6/7

### `typescript.fm`, November 11, 2025

- [Recording](https://typescript.fm/bonus43)

## Why and How We Ported TypeScript to Go

### SquiggleConf 2025, September 18, 2025

{{< collapse summary="Abstract" >}}

In March 2025, we surprised everyone by announcing TypeScript's port to Go. This
is a certified Big Deal™, given the scale, complexity, and importance of the
TypeScript toolchain.

From the beginning, TypeScript has been written in TypeScript; like most
languages, we're self hosting. We work on our own toolchain, fix our own bugs.
But as time went on, we faced the challenges with the compiler's performance,
largely inherent to the implementation language itself. We squeezed every ounce
of performance we could, but we needed to scale further. And through
experimentation and testing, we decided to port TypeScript to Go, achieving a
10x faster TypeScript.

In this talk, we'll go over the why and the how. Why Go turned out to be the
perfect language for the port, why it was sometimes hard to do (but also
sometimes easy), how we actually were able to port 150k lines of code and 90k
tests, and how this will affect you!

{{< /collapse >}}

- Recording coming soon!
- [Slides](https://jakebailey.dev/talk-squiggleconf-2025)
- [Source code](https://github.com/jakebailey/talk-squiggleconf-2025)

## Porting the TypeScript Compiler to Go for a 10x Speedup

### GopherCon 2025, August 27, 2025

{{< collapse summary="Abstract" >}}

From the beginning, the TypeScript compiler has been self-hosted, evolving
alongside a growing ecosystem of millions of developers. As time went on, we
faced challenges with the compiler's performance, largely inherent to the
implementation language itself. Through experimentation and testing, we found Go
to be an excellent language for our specific needs; a perfect porting language.
In this talk, we will explore the process of porting the 150,000+ line
TypeScript compiler and its 90,000+ tests to Go, the challenges we faced,
lessons we learned, all leading to an overall 10x performance improvement over
our previous implementation.

{{< /collapse >}}

- Recording coming soon!
- [Slides](https://jakebailey.dev/talk-gophercon-2025)
- [Source code](https://github.com/jakebailey/talk-gophercon-2025)

## TypeScript with Jake Bailey

### Software Engineering Daily, July 15, 2025

- [Recording](https://softwareengineeringdaily.com/2025/07/15/typescript-with-jake-bailey/)

## Migrating TypeScript to Modules: The Fine Details

### TypeScript Congress, September 21, 2023

{{< collapse summary="Abstract" >}}

In TypeScript 5.0, the TypeScript toolchain migrated to modules. In this talk,
we'll get deep in the weeds, discussing what "modules" even are (and how we
somehow weren't using them), the specifics of the migration itself, how we
managed to make the switch "mid-flight" on an actively-developed project, how
the migration went, and what's next.

{{< /collapse >}}

- [Recording](https://gitnation.com/contents/migrating-typescript-to-modules-the-fine-details)
- [Slides](https://jakebailey.dev/talk-tscongress-2023)
- [Source code](https://github.com/jakebailey/talk-tscongress-2023)

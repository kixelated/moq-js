# Media over QUIC

Media over QUIC (MoQ) is a live media delivery protocol utilizing QUIC streams.
See the [Warp draft](https://datatracker.ietf.org/doc/draft-lcurley-warp/).

This repository is a Typescript library that supports both contribution (ingest) and distribution (playback).
It requires a server, such as [moq-rs](https://github.com/kixelated/moq-rs).

## Requirements

-   _Chrome_: currently (May 2023) the only browser to support both WebTransport and WebCodecs.
-   _yarn_: required to install dependencies.

```
yarn install
```

## Demo

Hosts a simple demo on `https://localhost:4444`

```
yarn serve
```

This a requires a [MoQ server](https://github.com/kixelated/moq-rs) running on `https://localhost:4443`.

# Media over QUIC

Media over QUIC (MoQ) is a live media delivery protocol utilizing QUIC streams.
See the [MoQ working group](https://datatracker.ietf.org/wg/moq/about/) for more information.

This repository contains the a web library for MoQ.
It uses the browser APIs such as WebTransport and WebCodecs to support both contribution and distribution.
Check out [quic.video](https://quic.video) for a demo or [run it locally](https://github.com/kixelated/quic.video) as a UI.

This is a client only.
You'll either need to run a local server using [moq-rs](https://github.com/kixelated/moq-rs) or use a public server such as [relay.quic.video](https://quic.video/relay).

Join the [Discord](https://discord.gg/FCYF3p99mr) for updates and discussion.

## Usage

The library is released periodically and available on NPM.
There's no documentation until the API settles down.

```bash
npm install @kixelated/moq
```

## Development
Install node dependencies using `pnpm`:

```bash
pnpm install
```

Build to the `dist` folder:
```bash
pnpm build
```

## License

Licensed under either:

-   Apache License, Version 2.0, ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
-   MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)

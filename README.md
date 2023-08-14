# Media over QUIC

Media over QUIC (MoQ) is a live media delivery protocol utilizing QUIC streams.
See the [Warp draft](https://datatracker.ietf.org/doc/draft-lcurley-warp/).

This repository is a Typescript library that supports both contribution (ingest) and distribution (playback).
It requires a server, such as [moq-rs](https://github.com/kixelated/moq-rs).

## Usage

```
npm install --save-dev @kixelated/moq
```

## Development

### Setup

Install node dependencies using `npm`:

```
npm install
```

### Linking

There's no demo application so you will need to link this library to test changes.
This command will register the current directory as serving the `@kixelated/moq` package.

```
npm link
```

An application you can use is [quic.video](https://github.com/kixelated/quic.video).
Run this command in the application directory to use the symlink you set up in the previous setp:

```
npm link @kixelated/moq
```

### Javascript

Linking works only if you're using Typescript.
If you're only using Javascript, then you'll have to build first and link from the `dist` folder:

```
npm run build
cd dist
npm link
```

You'll have to rebuild for each change or use the `tsc watch` command to automatically rebuild.

## License

Licensed under either:

-   Apache License, Version 2.0, ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
-   MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)

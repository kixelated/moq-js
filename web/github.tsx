import { A } from "@solidjs/router"

export function Github() {
	return (
		<div class="flex flex-col items-center gap-3">
			<div>So you want some source code huh? That's cool.</div>

			<header>Native</header>
			<div>
				Any native code is written in Rust. There's two repositories:{" "}
				<a href="https://github.com/kixelated/moq-rs">moq-rs</a> and{" "}
				<a href="https://github.com/kixelated/webtransport-rs">webtransport-rs</a>.
			</div>
			<div>
				The project is split into a few crates:
				<div class="grid gap-3 p-3" style={{ "grid-template-columns": "auto 1fr" }}>
					<strong class="text-right">moq-warp</strong>
					<div>The media layer, used to publish and consume media streams.</div>

					<strong class="text-right">moq-transport</strong>
					<div>
						Implements the{" "}
						<a href="https://datatracker.ietf.org/doc/draft-ietf-moq-transport/">MoQ Transport</a> draft and
						the underlying messages.
					</div>

					<a class="text-right" href="https://docs.rs/webtransport-quinn/latest/webtransport_quinn/">
						webtransport-quinn
					</a>
					<div>
						Implements the{" "}
						<a href="https://datatracker.ietf.org/doc/draft-ietf-webtrans-http3/">WebTransport draft</a> on
						top of <a href="https://github.com/quinn-rs/quinn">Quinn</a>.
					</div>

					<strong class="text-right">webtransport-generic</strong>
					<div>A generic WebTransport trait, allowing moq-rs to use any QUIC library.</div>
				</div>
			</div>
			<div>
				We are currently working on ffmpeg and OBS integration. Check out the{" "}
				<a href="https://github.com/kixelated/moq-rs/issues">open issues</a> for a rough road map and potential
				contributions!
			</div>

			<header>Web</header>
			<div>
				Any web code is written in Typescript. It's currently in a single respository:{" "}
				<a href="https://github.com/kixelated/moq-js">moq-js</a>.
			</div>
			<div>
				This website is written using <a href="https://www.solidjs.com/">SolidJS</a> and{" "}
				<a href="https://tailwindcss.com/">TailwindCSS</a>. You can find the source in the{" "}
				<a href="https://github.com/kixelated/moq-js/tree/main/web">web</a> folder. I'm not a front-end
				developer so no flame pls.
			</div>
			<div>
				The library can be found in the <a href="https://github.com/kixelated/moq-js/tree/main/lib">lib</a>{" "}
				folder and is available on NPM as{" "}
				<a href="https://www.npmjs.com/package/@kixelated/moq">@kixelated/moq</a>. There's currently no
				documentation and the library is unstable; expect frequent changes. It's split into folders depending on
				your use-case:
			</div>
			<div class="grid gap-3 p-3" style={{ "grid-template-columns": "auto 1fr" }}>
				<strong>contribute</strong>
				<div>
					Captures media, encodes via{" "}
					<a href="https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API">WebCodecs</a>, and
					transmits over{" "}
					<a href="https://developer.mozilla.org/en-US/docs/Web/API/WebTransport">WebTransport</a>.
				</div>
				<strong>playback</strong>
				<div>
					Receives media over{" "}
					<a href="https://developer.mozilla.org/en-US/docs/Web/API/WebTransport">WebTransport</a>, decodes
					via <a href="https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API">WebCodecs</a>, and
					renders via{" "}
					<a href="https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas">OffscreenCanvas</a> and{" "}
					<a href="https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet">WebWorklet</a>.
				</div>
				<strong>transport</strong>
				<div>
					Implements <a href="https://datatracker.ietf.org/doc/draft-ietf-moq-transport/">MoQ Transport</a>{" "}
					draft and the underlying messages.
				</div>
			</div>
			<div>
				This project is using a lot of new web APIs. Chrome support is guaranteed but other browsers are still
				catching up. See <A href="/issues">issues</A> for more details.
			</div>

			<header>Licensing</header>
			<div>Everything is licensed under MIT or Apache-2.0 so knock yourself out.</div>
			<div>
				If you do end up using MoQ for your project, let the world know! The more public traction we can get,
				the better we can make the standard.
			</div>
		</div>
	)
}

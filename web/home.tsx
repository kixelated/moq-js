import { A } from "@solidjs/router"

// Import the icons using this trick so Parcel can rewrite the URLs.
const icons = {
	logo: new URL("./img/logo-full.svg", import.meta.url),
	ietf: new URL("./img/ietf.svg", import.meta.url),
	quic: new URL("./img/quic.svg", import.meta.url),
}

export function Home() {
	return (
		<div class="flex flex-col items-center gap-6 p-3">
			<img src={icons.logo.toString()} alt="Media over QUIC" class="h-24" />
			<div>
				<strong>Media over QUIC</strong> (MoQ) is a new live media protocol that fully leverages{" "}
				<a href="https://quicwg.org/">QUIC</a>. QUIC is a relatively new transport protocol that powers{" "}
				<a href="https://en.wikipedia.org/wiki/HTTP/3">HTTP/3</a> but can be used independently as a
				super-charged TCP/UDP replacement. Browser support is available via{" "}
				<a href="https://developer.mozilla.org/en-US/docs/Web/API/WebTransport">WebTransport</a>.
			</div>
			<div class="border-b-2 border-green-600 text-center">
				Try it out! <A href="/watch">Watch</A> a public broadcast or <A href="/publish">Publish</A> your own.
			</div>
			<div>
				Existing live media protocols fill a niche, targetting a certain use-case and a certain latency budget.
				We are designing a protocol that is flexible enough to support the wide range of use-cases: from
				ultra-low latency to ultra-high quality, 1 viewer to 1 million viewers, and everything in between.
			</div>
			<div class="border-b-2 border-green-600 text-center">
				Read the <A href="/explained">Explained</A> section for the gritty technical details.
			</div>
			<div>
				This website is a fully <A href="/github">open source</A> proof-of-concept. It's written in Rust and
				Typescript with multiple libraries available. Get in touch if you're interested in contributing,
				sponsoring, or just want more information!
			</div>
			<div class="border-b-2 border-green-600 text-center">
				Visit our <A href="/github">Github</A> or join our <a href="https://discord.gg/FCYF3p99mr">Discord</a>.
			</div>
			<div>
				The protocol is being developed by the{" "}
				<a href="https://datatracker.ietf.org/group/moq/about/">IETF MoQ working group</a>. The{" "}
				<a href="https://www.ietf.org/">IETF</a> is an open organization that develops Internet standards,
				including some of your <i>favorite</i> protocols like HTTP, TLS, and DNS. It's still early in
				development and everything is subject to change, so get involved!
			</div>
			<div>This is not an official IETF website. The IETF does not endorse this website or its contents.</div>
			<footer class="flex flex-row items-center gap-6">
				<img src={icons.ietf.toString()} alt="IETF" class="h-12" />
				<img src={icons.quic.toString()} alt="QUIC" class="h-12" />
			</footer>
		</div>
	)
}

import { A } from "@solidjs/router"
import * as caniuse from "caniuse-lite"
import { For } from "solid-js"

const icons = {
	// TODO draw in my dumb art style
	warning: new URL("./img/warning.svg", import.meta.url),
}

export function Issues() {
	const features = ["webtransport", "webcodecs", "audio-api", "sharedarraybuffer"].map((id) => {
		return { id, ...caniuse.feature(caniuse.features[id]) }
	})

	const agents = ["chrome", "edge", "firefox", "safari", "ios_saf", "android"].map((id) => {
		const agent = caniuse.agents[id]!

		// Get the date of the latest release:
		const latest =
			Object.values(agent.release_date).reduce((a, b) => {
				if (!a) return b
				if (!b) return a
				return a > b ? a : b
			}) ?? 0

		return { id, latest, ...caniuse.agents[id] }
	})

	const latest = agents.reduce((a, b) => (a.latest > b.latest ? a : b)).latest

	return (
		<div class="flex flex-col items-center gap-3">
			<div>Yeah so there's a lot of work to do.</div>
			<div>
				This is an early PoC and hobby project, so expect nothing to work. Check out the Github issues (
				<a href="https://github.com/kixelated/moq-rs/issues">moq-rs</a> and{" "}
				<a href="https://github.com/kixelated/moq-js/issues">moq-js</a>) if you want to contribute or complain;
				both are equally valid.
			</div>

			<header>Browser Support</header>
			<div>
				We're using some pretty new web standards, so browser support is limited. Here is a non-compreshensive
				list of the required features from the <a href="https://caniuse.com/">caniuse</a> database as of:{" "}
				{new Date(1000 * latest).toDateString()}
			</div>
			<div class="grid grid-cols-8 items-center">
				<div class="col-span-2" />
				<For each={agents}>
					{(agent) => {
						return <div class="px-2 py-1 text-center ">{agent.browser}</div>
					}}
				</For>
				<For each={features}>
					{(feature) => {
						return (
							<>
								<div class="col-span-2 col-start-1 px-2 py-1 text-right">
									<a href={"https://caniuse.com/" + feature.id}>{feature.title}</a>
								</div>
								<For each={agents}>
									{(agent) => {
										const versions = feature.stats[agent.id]
										const latest = Object.keys(versions).reduce((a, b) =>
											versions[a] > versions[b] ? a : b,
										)

										const supported = versions[latest]
										const yes = supported.startsWith("y")
										const no = supported.startsWith("n")
										const maybe = !yes && !no

										return (
											<div
												classList={{
													"bg-green-600": yes,
													"bg-red-600": no,
													"bg-yellow-600": maybe,
												}}
												class="h-full w-full px-2 py-1 text-center text-sm text-white/80 "
											>
												{yes ? "yes" : no ? "no" : "maybe"}
											</div>
										)
									}}
								</For>
							</>
						)
					}}
				</For>
			</div>
			<div />
			<div>
				The only hard requirement is{" "}
				<a href="https://developer.mozilla.org/en-US/docs/Web/API/WebTransport">WebTransport</a>. See the
				following sections for possible alternatives for web playback and web contribution.
			</div>

			<header>Web Playback</header>
			<div>
				<a href="https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API">WebCodecs</a> decoding is a
				breeze but rendering is a nightmare, as the application is responsible for everything. This includes
				when to render video frames but also when to emit audio samples, which gets very complicated quickly as
				it involves synchronization.
			</div>
			<div>
				The current player has no synchronization or buffer, which means that frames are rendered as soon as
				they are received over the network. This is meant to demonstate the lower latency bound of the protocol.
				We'll need to add a configurable buffer for use-cases where quality and smooth playback is more
				important than latency.
			</div>
			<div>
				Additionally, there's no built-in controls. Even something as trivial as changing the volume requires
				building a WebAudio filter as opposed to relying on the &lt;video&gt; tag. I'm not a front-end developer
				(no flame pls) and would love any contributions on this front.
			</div>
			<div>
				A much simpler rendering technology is{" "}
				<a href="https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API">MSE</a>. I had a
				previous demo that used this API, but the latency is significantly higher than WebCodecs as it will
				buffer during starvation. I plan on supporting it again in the future and it works great with Media over
				QUIC as both use fMP4.
			</div>

			<header>Web Contribution</header>
			<div>
				<a href="https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API">WebCodecs</a> is great for
				encoding in my relatively limited experience. We may need some more functionality to support
				conferencing, such as like echo cancellation or advanced encodings.
			</div>
			<div>
				The main limitation is capturing sources from the browser, as the browser doesn't have the same
				flexibility as a native program like <a href="https://obsproject.com/">OBS</a>. I would also love to see
				a UI that allows positioning elements or doing cool effects. If you can render to a &lt;canvas&gt;, then
				you can encode it with WebCodecs and transmit it with WebTransport.
			</div>
			<div>
				Media over QUIC relies on both congestion control and prioritization to provide the best user experience
				on poor networks. The WebTransport specification does provide{" "}
				<a href="https://www.w3.org/TR/webtransport/#dom-webtransportsendstreamoptions-sendorder">
					prioritization
				</a>{" "}
				and{" "}
				<a href="https://www.w3.org/TR/webtransport/#dom-webtransport-congestioncontrol">
					congestion control hints
				</a>
				, but these have not been implemented yet. We have limited control over the browser's congestion control
				which is especially important for live media.
			</div>

			<header>Congestion Control</header>
			<div>
				<a href="https://github.com/kixelated/moq-rs">moq-rs</a> uses an experimental{" "}
				<a href="https://docs.rs/quinn/latest/quinn/congestion/struct.Bbr.html/">BBR implementation</a>. <br />
				<a href="https://github.com/kixelated/moq-js">moq-js</a> uses whatever the browser implements, which
				defaults to <a href="https://datatracker.ietf.org/doc/html/draft-ietf-quic-recovery">New Reno</a>.
			</div>
			<div>
				The congestion control algorithm is extremely important for live media over the internet, as{" "}
				<a href="https://en.wikipedia.org/wiki/Bufferbloat">bufferbloat</a> will cause queuing on the network.
				TCP-oriented congestion control are often compared by sustained throughput, but for live media we're
				more interested in latency, since the encoded bitrate is the limiting factor. When latency is critical,
				it's better to drop old media instead of queuing new media, and that's only possible when you can detect
				queuing via congestion control.
			</div>
			<div>
				Loss-based congestion control like{" "}
				<a href="https://en.wikipedia.org/wiki/TCP_congestion_control">New Reno</a> (Windows default) and{" "}
				<a href="https://en.wikipedia.org/wiki/CUBIC_TCP">CUBIC</a> (Linux default) suffer from bufferbloat.
				Your experience will vary based on the network, with some ISPs and parts of the world being
				significantly worse than others. This is also the fundamental issue with RTMP, since it relies on the
				operating system's TCP congestion control. QUIC libraries can ship their own congestion control allowing
				much faster experimentation and iteration.
			</div>
			<div>
				Delay-based congestion control like{" "}
				<a href="https://www.ietf.org/proceedings/97/slides/slides-97-iccrg-bbr-congestion-control-02.pdf">
					BBR
				</a>{" "}
				and <a href="https://web.mit.edu/copa/">COPA</a> are better, but are still fundamentally designed for
				TCP. They're not designed for application-limited environments like live media where we don't fully
				saturate the network. Flooding the network with PADDING packets to occasionally saturate the network
				makes a big difference, but is experimental and not yet implemented.
			</div>
			<div>
				Delayed-based and latency-sensitive congestion control like{" "}
				<a href="https://datatracker.ietf.org/doc/html/draft-ietf-rmcat-gcc-02">GCC</a> and{" "}
				<a href="https://github.com/EricssonResearch/scream">SCReAM</a> are the best* for real-time media and
				see wide usage in WebRTC. However, the per-packet feedback required for these algorithms are not
				available in QUIC. We will need a QUIC extension in order to match WebRTC performance and latency.
			</div>

			<header>Dynamic Bitrate</header>
			<div>
				An alternative to dropping media is to dynamically adjust the bitrate. The picture quality will worsen,
				but more frames will be delivered, which often results in a better user experience.
			</div>
			<div>
				In 1:1 video conferencing, the media encoding is adjusted in response to viewer feedback. A protocol
				like WebRTC will lower the media bitrate in response to minor congestion and request a new I-frame in
				response to major-congestion. No such feedback exists yet in Media over QUIC, and is complicated by the
				presence of relays.
			</div>
			<div>
				In 1:N video conferencing, the encoding is fixed, as one viewer's experience should not degrade
				everybody else's experience. The common approach is to encode multiple renditions of the broadcast at
				different bitrates, allowing the viewer to switch between them depending on their network. This is
				called <a href="https://en.wikipedia.org/wiki/Adaptive_bitrate_streaming">ABR</a> in distribution
				circles and <a href="https://en.wikipedia.org/wiki/Simulcast">simulcast</a> in contribution circles.
				This is not implemented yet either.
			</div>

			<header>CDNs</header>
			<div>
				Media over QUIC is designed with relays and CDNs in mind.{" "}
				<a href="https://datatracker.ietf.org/doc/draft-ietf-moq-transport/">MoqTransport</a> is media agnostic
				and exposes only the most critical information to relay. The design should enable world-side scale while
				still supporting real-time latency budgets.
			</div>
			<div>
				...but we haven't built it yet. You're currently connecting to a single server somewhere in the US, so
				don't expect the best quality. I'm working on it now so expect this section to be updated soon.
			</div>

			<header>Specification</header>
			<div>
				Media over QUIC is an <a href="https://datatracker.ietf.org/group/moq/about/">IETF working group</a>.
				The <a href="https://www.ietf.org/">IETF</a> is an open organization that develops Internet standards,
				including some of your <i>favorite</i> protocols like HTTP, TLS, and DNS.
			</div>
			<div>
				The standardization effort is slow and deliberate so don't expect an RFC for years.{" "}
				<a href="https://quic.video">quic.video</a> uses a fork of the specification, allowing us to experiment
				with new features without the litigation involved in a standard.{" "}
				<a href="https://docs.rs/moq-transport/latest/moq_transport/setup/struct.Version.html#associatedconstant.KIXEL_00">
					Here's a list
				</a>{" "}
				of the changes thus far, which we hope will be merged into the standard.
			</div>
		</div>
	)
}

export function Notice() {
	return (
		<div class="my-2 flex flex-row items-center gap-4 rounded-md bg-slate-700 px-4 py-2">
			<img src={icons.warning.toString()} class="h-12" />
			<div>
				This is an early-stage proof-of-concept. Check out the current <A href="/issues">limitations</A>.
				Contributions are welcome!
			</div>
		</div>
	)
}

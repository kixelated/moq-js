/* eslint-disable jsx-a11y/media-has-caption */
import { Player } from "@kixelated/moq/playback"

import Fail from "./fail"
import "./watch.css";

import { createEffect, createSignal, onCleanup, Show } from "solid-js"

export default function Watch(props: { name: string }) {
	// Use query params to allow overriding environment variables.
	const urlSearchParams = new URLSearchParams(window.location.search)
	const params = Object.fromEntries(urlSearchParams.entries())
	const server = params.server ?? import.meta.env.PUBLIC_RELAY_HOST

	const [error, setError] = createSignal<Error | undefined>()

	let canvas!: HTMLCanvasElement
	let catalogContainer!: HTMLDivElement

	const [usePlayer, setPlayer] = createSignal<Player | undefined>()
	const [showCatalog, setShowCatalog] = createSignal(false);
	
	createEffect(() => {
		const namespace = props.name
		const url = `https://${server}`

		// Special case localhost to fetch the TLS fingerprint from the server.
		// TODO remove this when WebTransport correctly supports self-signed certificates
		const fingerprint = server.startsWith("localhost") ? `https://${server}/fingerprint` : undefined

		Player.create({ url, fingerprint, canvas, namespace }).then(player => {
			setPlayer(player)
		}).catch(setError)
	})

	createEffect(() => {
		const player = usePlayer()
		if (!player) return

		onCleanup(() => player.close())
		player.closed().then(setError).catch(setError)
	})

	const play = () => usePlayer()?.play()

	const toggleCatalog = () => {
		setShowCatalog(prev => !prev)
	}

	createEffect(() => {
		if (showCatalog() && usePlayer()) {
			const catalogJson = JSON.stringify(usePlayer()?.getCatalog(), null, 2);
			if (catalogContainer) {
				catalogContainer.textContent = catalogJson;
			}
		}
	});

	const downloadCatalog = () => {
		const catalogJson = JSON.stringify(usePlayer()?.getCatalog(), null, 2);
		const blob = new Blob([catalogJson], { type: "application/json" });
		const catalogTempDownloadURL = URL.createObjectURL(blob);
		const catalogTempDownloadLink = document.createElement("a");
		catalogTempDownloadLink.href = catalogTempDownloadURL;
		catalogTempDownloadLink.download = "catalog.json";
		catalogTempDownloadLink.click();
		URL.revokeObjectURL(catalogTempDownloadURL);
	};

	// NOTE: The canvas automatically has width/height set to the decoded video size.
	// TODO shrink it if needed via CSS
	return (
		<>
			<Fail error={error()} />
			<canvas ref={canvas} onClick={play} class="aspect-video w-full rounded-lg" />
			<div class="flex mt-2">
					<button class="showcatalog-button" onClick={toggleCatalog}>
						{showCatalog() ? 'Hide Catalog' : 'Show Catalog'}
					</button>
			</div>
			<Show when={showCatalog()}>
				<div id="catalogBox" class="catalog-box">
					<button id="downloadButton" class="download-button" onClick={downloadCatalog}>
						Download Catalog
					</button>
					<pre ref={el => catalogContainer = el!} id="catalogContainer" class="catalog-container"></pre>
				</div>
			</Show>
		</>
	)
}

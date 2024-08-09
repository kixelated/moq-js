/* eslint-disable jsx-a11y/media-has-caption */
import { Player } from "@kixelated/moq/playback"

import Fail from "./fail"

import { createEffect, createSignal, onCleanup } from "solid-js"

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

		Player.create({ url, fingerprint, canvas, namespace, catalogContainer }).then(player => {
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
	    setShowCatalog(prev => {
		const newState = !prev;
		const catalogBox = document.getElementById("catalogBox");

		if (catalogBox) {
			catalogBox.style.display = newState ? 'block' : 'none';
			const downloadButton = catalogBox.querySelector("#downloadButton") as HTMLButtonElement;
			if(downloadButton) {
				downloadButton.style.display = newState ? 'block' : 'none';
			} else {
				console.warn("Download button not found.");
			}
		} else {
			console.warn("Catalog box not found.");
		}

		return newState;
	    });
	};

	createEffect(() => {
	    const player = usePlayer();
	    const catalogBox = document.getElementById("catalogBox");
	    if (player && catalogContainer && catalogBox) {
			const downloadButton = catalogBox.querySelector("#downloadButton") as HTMLButtonElement;
			if (showCatalog()) {
				player.displayCatalog();
				catalogBox.style.display = 'block';
				if (downloadButton) {
					downloadButton.style.display = 'block';
				}
			} else {
				catalogBox.style.display = 'none';
				if (downloadButton) {
					downloadButton.style.display = 'none';
				}
			}
	    }
	});

	// NOTE: The canvas automatically has width/height set to the decoded video size.
	// TODO shrink it if needed via CSS
	return (
		<>
			<Fail error={error()} />
			<canvas ref={canvas} onClick={play} class="aspect-video w-full rounded-lg" />
		    	<div class="flex mt-2">
                		<button class="p-2 bg-blue-500 text-white rounded mr-2" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;" onClick={toggleCatalog}>
					{showCatalog() ? 'Hide Catalog' : 'Show Catalog'}
                		</button>
            		</div>
        		<div id="catalogBox" style="position: relative; border: 1px solid #ccc; padding: 10px; margin-top: 10px; display: none; max-height: 300px; max-width: 100%;">
            			<button id="downloadButton" class="p-2 bg-blue-500 text-white rounded" style="position: absolute; top: 10px; right: 10px; z-index: 10;font-size: 0.75rem; padding: 0.25rem 0.5rem;">
                			Download Catalog
            			</button>
            			<pre ref={el => catalogContainer = el!} id="catalogContainer" style="white-space: pre-wrap; overflow: auto; max-height: 250px;"></pre>
        		</div>
		</>
	)
}

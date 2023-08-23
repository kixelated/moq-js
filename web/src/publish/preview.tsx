import { Broadcast } from "@kixelated/moq/contribute"

import { onMount } from "solid-js"
import { Listing } from "../common/catalog"

// We take the client used to create the broadcast so we can create a sharable link
export function Preview(props: { broadcast: Broadcast }) {
	let preview: HTMLVideoElement

	onMount(() => {
		props.broadcast.preview(preview)
	})

	return (
		<>
			<Listing
				name={props.broadcast.name}
				catalog={props.broadcast.catalog}
				connection={props.broadcast.connection}
			/>
			<video ref={preview!} autoplay muted class="mt-6"></video>
		</>
	)
}

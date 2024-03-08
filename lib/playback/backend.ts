import { Catalog } from "../media/catalog"
import { GroupHeader } from "../transport/objects"

// TODO make an interface for backends

export interface Config {
	catalog: Catalog
}

export interface Init {
	name: string // name of the init track
	data: Uint8Array
}

export interface Segment {
	init: string // name of the init track
	kind: "audio" | "video"
	header: GroupHeader
	buffer: Uint8Array
	stream: ReadableStream<Uint8Array>
}

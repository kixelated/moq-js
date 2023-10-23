import { Catalog } from "../media/catalog"
import { Header } from "../transport/object"

export interface Start {
	catalog: Catalog
}

export interface Init {
	name: string // name of the init track
	stream: ReadableStream<Uint8Array>
}

export interface Segment {
	init: string // name of the init track
	kind: "audio" | "video"
	header: Header
	stream: ReadableStream<Uint8Array>
}

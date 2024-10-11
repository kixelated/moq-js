import * as Transfork from "../../transfork"
import { decodeAudio, Audio } from "./audio"
import { decodeVideo, Video } from "./video"

export interface Broadcast {
	name: string
	video: Video[]
	audio: Audio[]
}

export function encode(catalog: Broadcast): Uint8Array {
	const encoder = new TextEncoder()
	console.debug("encoding catalog", catalog)
	const str = JSON.stringify(catalog)
	return encoder.encode(str)
}

export function decode(broadcast: string, raw: Uint8Array): Broadcast {
	const decoder = new TextDecoder()
	const str = decoder.decode(raw)

	const catalog = JSON.parse(str)
	if (!decodeBroadcast(catalog)) {
		throw new Error("invalid catalog")
	}

	catalog.name = broadcast
	return catalog
}

export async function fetch(connection: Transfork.Connection, broadcast: string): Promise<Broadcast> {
	const track = new Transfork.Track(broadcast, "catalog.json", 0)
	const sub = await connection.subscribe(track)
	try {
		const segment = await sub.nextGroup()
		if (!segment) throw new Error("no catalog data")

		const frame = await segment.readFrame()
		if (!frame) throw new Error("no catalog frame")

		segment.close()
		return decode(broadcast, frame)
	} finally {
		sub.close()
	}
}

export function decodeBroadcast(catalog: any): catalog is Broadcast {
	if (catalog.audio === undefined) catalog.audio = []
	if (!Array.isArray(catalog.audio)) return false
	if (!catalog.audio.every((track: any) => decodeAudio(track))) return false
	if (catalog.video === undefined) catalog.video = []
	if (!Array.isArray(catalog.video)) return false
	if (!catalog.video.every((track: any) => decodeVideo(track))) return false
	return true
}

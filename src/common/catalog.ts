// JSON encoded catalog
export class Catalog {
	tracks = new Array<Track>()

	encode(): Uint8Array {
		const encoder = new TextEncoder()
		const str = JSON.stringify(this)
		return encoder.encode(str)
	}

	static decode(raw: Uint8Array): Catalog {
		const decoder = new TextDecoder()
		const str = decoder.decode(raw)
		const catalog = JSON.parse(str)

		if (!isCatalog(catalog)) {
			throw new Error("invalid catalog")
		}

		return catalog
	}
}

export function isCatalog(catalog: any): catalog is Catalog {
	if (!Array.isArray(catalog.tracks)) return false
	return catalog.tracks.every((track: any) => isTrack(track))
}

export interface Track {
	kind: string
	codec: string
	container: string
	namespace: string
}

export function isTrack(track: any): track is Track {
	if (typeof track.codec !== "string") return false
	if (typeof track.container !== "string") return false
	if (typeof track.namespace !== "string") return false
	return true
}

export interface TrackMp4 extends Track {
	container: "mp4"
	init: string
	data: string
}

export function isTrackMp4(track: any): track is TrackMp4 {
	if (track.container !== "mp4") return false
	if (typeof track.init !== "string") return false
	if (typeof track.data !== "string") return false
	if (!isTrack(track)) return false
	return true
}

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
	namespace: string
	kind: string
	container: string
}

export interface Mp4Track extends Track {
	container: "mp4"
	init: string
	data: string
}

export interface AudioTrack extends Track {
	kind: "audio"
	codec: string
	channel_count: number
	sample_rate: number
	sample_size: number
	bit_rate?: number
}

export interface VideoTrack extends Track {
	kind: "video"
	codec: string
	width: number
	height: number
	frame_rate: number
	bit_rate?: number
}

export function isTrack(track: any): track is Track {
	if (typeof track.namespace !== "string") return false
	return true
}

export function isMp4Track(track: any): track is Mp4Track {
	if (track.container !== "mp4") return false
	if (typeof track.init !== "string") return false
	if (typeof track.data !== "string") return false
	if (!isTrack(track)) return false
	return true
}

export function isVideoTrack(track: any): track is VideoTrack {
	if (track.kind !== "video") return false
	if (typeof track.codec !== "string") return false
	if (typeof track.width !== "number") return false
	if (typeof track.height !== "number") return false
	if (typeof track.frame_rate !== "number") return false
	if (!isTrack(track)) return false
	return true
}

export function isAudioTrack(track: any): track is AudioTrack {
	if (track.kind !== "audio") return false
	if (typeof track.codec !== "string") return false
	if (typeof track.channel_count !== "number") return false
	if (typeof track.sample_rate !== "number") return false
	if (typeof track.sample_size !== "number") return false
	if (!isTrack(track)) return false
	return true
}

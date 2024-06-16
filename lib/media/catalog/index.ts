import { Connection, Track as TTrack } from "../../transfork"

// JSON encoded catalog
export class Broadcast {
	broadcast: string
	tracks = new Array<Track>()

	constructor(broadcast: string) {
		this.broadcast = broadcast
	}

	encode(): Uint8Array {
		const encoder = new TextEncoder()
		const str = JSON.stringify(this)
		return encoder.encode(str)
	}

	decode(raw: Uint8Array) {
		const decoder = new TextDecoder()
		const str = decoder.decode(raw)

		try {
			this.tracks = JSON.parse(str).tracks
			if (!Broadcast.is(this)) {
				throw new Error("invalid catalog")
			}
		} catch (e) {
			throw new Error("invalid catalog")
		}
	}

	async fetch(connection: Connection) {
		const track = connection.subscribe(new TTrack(this.broadcast, ".catalog", 0))
		try {
			const group = await track.next()
			if (!group) throw new Error("no catalog data")

			try {
				const chunk = await group.read()
				if (!chunk) throw new Error("no catalog chunk")

				this.decode(chunk)
			} finally {
				group.close()
			}
		} finally {
			track.close()
		}
	}

	static is(catalog: any): catalog is Broadcast {
		if (!Array.isArray(catalog.tracks)) return false
		return catalog.tracks.every((track: any) => isTrack(track))
	}
}

export interface Track {
	kind: string
	container: string
	priority: number
}

export interface Mp4Track extends Track {
	container: "mp4"
	init_track: string
	data_track: string
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
	if (typeof track.kind !== "string") return false
	if (typeof track.container !== "string") return false
	return true
}

export function isMp4Track(track: any): track is Mp4Track {
	if (track.container !== "mp4") return false
	if (typeof track.init_track !== "string") return false
	if (typeof track.data_track !== "string") return false
	if (!isTrack(track)) return false
	return true
}

export function isVideoTrack(track: any): track is VideoTrack {
	if (track.kind !== "video") return false
	if (typeof track.codec !== "string") return false
	if (typeof track.width !== "number") return false
	if (typeof track.height !== "number") return false
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

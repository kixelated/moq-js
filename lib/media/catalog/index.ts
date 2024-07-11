import { Connection } from "../../transport"
import { asError } from "../../common/error"

export interface CommonTrackFields {
  namespace: string;
  packaging?: string;
  renderGroup?: number;
  altGroup?: number;
}
export interface CatalogRoot {
  version: number;
  streamingFormat: number;
  streamingFormatVersion: number;
  supportsDeltaUpdates: bool;
  commonTrackFields?: CommonTrackFields;
  tracks: Track[];
}


// JSON encoded catalog
export class Catalog {
	namespace: string
	catalog: CatalogRoot | null = null;

	constructor(namespace: string) {
		this.namespace = namespace
	}

	encode(): Uint8Array {
		if (!this.catalog) throw new Error("No catalog to encode");
		const encoder = new TextEncoder()
		const str = JSON.stringify(this)
		return encoder.encode(str)
	}

	decode(raw: Uint8Array) {
		const decoder = new TextDecoder()
		const str = decoder.decode(raw)

		try {
			const parsedcatalog = JSON.parse(str);
			if (!isCatalog(parsedcatalog)) {
				throw new Error("invalid catalog")
			}
			this.catalog = parsedcatalog;
			this.tracks = this.catalog.tracks;
		} catch (e) {
			throw new Error("invalid catalog")
		}
	}

	async fetch(connection: Connection) {
		const subscribe = await connection.subscribe(this.namespace, ".catalog")
		try {
			const segment = await subscribe.data()
			if (!segment) throw new Error("no catalog data")

			const chunk = await segment.read()
			if (!chunk) throw new Error("no catalog chunk")

			await segment.close()
			await subscribe.close() // we done

			this.decode(chunk.payload)
		} catch (e) {
			const err = asError(e)

			// Close the subscription after we're done.
			await subscribe.close(1n, err.message)

			throw err
		}
	}
}

export function isCatalog(catalog: any): catalog is Catalog {
	if (!isPackagingValid(catalog)) return false
	if (!Array.isArray(catalog.tracks)) return false
	return catalog.tracks.every((track: any) => isTrack(track))
}

export interface Track {
	name: string;
	depends?: any[];
	packaging?: string;
	renderGroup?: number;
	selectionParams?: SelectionParams;
}

export interface Mp4Track extends Track {
	initTrack?: string;
	initData?: string;
}

export interface SelectionParams {
	codec?: string;
	mimeType?: string;
	framerate?: number;
	bitrate?: number;
	width?: number;
	height?: number;
	samplerate?: number;
	channelConfig?: number;
	displayWidth?: number;
	displayHeight?: number;
	lang?: string;
}


export interface AudioTrack extends Track {
	name: string;
}

export interface VideoTrack extends Track {
	name: string;
	temporalId?: number;
	spatialId?: number;
	altGroup?: number;
}

export function isTrack(track: any): track is Track {
	if (typeof track.name !== "string") return false
	return true
}

export function isMp4Track(track: any): track is Mp4Track {
	if (typeof track.initTrack !== "string") return false
	if (typeof track.initData !== "string") return false
	if (!isTrack(track)) return false
	return true
}

export function isVideoTrack(track: any): track is VideoTrack {
	if (!(track.name.toLowerCase().includes("video"))) return false
	if (typeof track.selectionParams.codec !== "string") return false
	if (typeof track.selectionParams.width !== "number") return false
	if (typeof track.selectionParams.height !== "number") return false
	return true
}

export function isAudioTrack(track: any): track is AudioTrack {
	if (!(track.name.toLowerCase().includes("audio"))) return false
	if (typeof track.selectionParams.codec !== "string") return false
	if (typeof track.selectionParams.channelConfig !== "number") return false
	if (typeof track.selectionParams.samplerate !== "number") return false
	return true
}

function isPackagingValid(catalog: any): boolean {
        //packaging if common would be listed in commonTrackFields but if fields
        //in commonTrackFields are mentiond in Tracks , the fields in Tracks precedes
	
	function isValidPackagingType(packaging: any): boolean {
		return packaging === "cmaf" || packaging === "loc";
	}

	if ( catalog.commonTrackFields.packaging !== undefined && !isValidPackagingType(catalog.commonTrackFields.packaging)) {
		return false;
	}

	for (const track of catalog.tracks) {
		if (track.packaging !== undefined && !isValidPackagingType(track.packaging)) {
			return false;
		}
	}

	return true;
}

export function isMediaTrack(track: any): track is Track {
        if (track.name.toLowerCase().includes("audio") || track.name.toLowerCase().includes("video")) {
                return true;
        }

	if (track.selectionParams && track.selectionParams.codec) {
		const codec = track.selectionParams.codec.toLowerCase();
		const acceptedCodecs = ["mp4a", "avc1"];

		for (const acceptedCodec of acceptedCodecs) {
			if (codec.includes(acceptedCodec)) {
				return true;
			}
		}
	}
        return false
}


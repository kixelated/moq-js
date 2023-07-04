// Rename some stuff so it's on brand.
export { createFile as New, DataStream as Stream, Box, ISOFile } from "mp4box"

export type {
	MP4File as File,
	MP4ArrayBuffer as ArrayBuffer,
	MP4Info as Info,
	MP4Track as Track,
	MP4AudioTrack as AudioTrack,
	MP4VideoTrack as VideoTrack,
	Sample,
	TrackOptions,
	SampleOptions,
} from "mp4box"

import { MP4Track, MP4AudioTrack, MP4VideoTrack } from "mp4box"

export function isAudioTrack(track: MP4Track): track is MP4AudioTrack {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	return (track as MP4AudioTrack).audio !== undefined
}

export function isVideoTrack(track: MP4Track): track is MP4VideoTrack {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	return (track as MP4VideoTrack).video !== undefined
}

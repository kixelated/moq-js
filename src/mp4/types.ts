import * as MP4 from "./rename"

export function isAudioTrack(track: MP4.Track): track is MP4.AudioTrack {
	return (track as MP4.AudioTrack).audio !== undefined
}

export function isVideoTrack(track: MP4.Track): track is MP4.VideoTrack {
	return (track as MP4.VideoTrack).video !== undefined
}

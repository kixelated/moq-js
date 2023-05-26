import * as Message from "../message"
import * as MP4 from "../../mp4"

import Audio from "./audio"
import Video from "./video"
import Frame from "../frame"

export default class Renderer {
	audio: Audio
	video: Video

	constructor(config: Message.Config) {
		this.audio = new Audio(config)
		this.video = new Video(config)
	}

	push(frame: Frame) {
		if (isAudioTrack(frame.track)) {
			this.audio.push(frame)
		} else if (isVideoTrack(frame.track)) {
			this.video.push(frame)
		} else {
			throw new Error("unknown track type")
		}
	}
}

function isAudioTrack(track: MP4.Track): track is MP4.AudioTrack {
	return (track as MP4.AudioTrack).audio !== undefined
}

function isVideoTrack(track: MP4.Track): track is MP4.VideoTrack {
	return (track as MP4.VideoTrack).video !== undefined
}

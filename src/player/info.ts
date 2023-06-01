export interface Info {
	// The epoch, increased by 1 for each update
	epoch: number

	// The current playback position
	timestamp?: number

	// Audio specific information
	audio: AudioInfo

	// Video specific information
	video: VideoInfo
}

export interface Range {
	start: number
	end: number
}

export interface AudioInfo {
	buffer: Range[]
}

export interface VideoInfo {
	buffer: Range[]
}

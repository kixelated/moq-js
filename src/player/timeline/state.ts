import { Range } from "./range"

export interface State {
	// The epoch, increased by 1 for each update
	epoch: number

	// The current playback position
	timestamp?: number

	// Audio specific information
	audio: AudioState

	// Video specific information
	video: VideoState
}

export interface AudioState {
	buffer: Range[]
}

export interface VideoState {
	buffer: Range[]
}

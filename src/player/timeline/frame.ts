import * as MP4 from "../../mp4"

export interface Frame {
	track: MP4.Track // The track this frame belongs to
	sample: MP4.Sample // The actual sample contain the frame data
	timestamp: number // The presentation timestamp of the frame
}

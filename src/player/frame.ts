import * as MP4 from "../mp4"

export default interface Frame {
	track: MP4.Track // The track this frame belongs to
	group: number // A unique ID for the group of pictures
	sample: MP4.Sample // The actual sample contain the frame data
	timestamp: number // The presentation timestamp of the frame
}

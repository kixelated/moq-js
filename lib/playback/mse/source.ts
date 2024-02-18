import * as MP4 from "../../media/mp4"

// Create a SourceBuffer with convenience methods
export class Source {
	sourceBuffer?: SourceBuffer
	mediaSource: MediaSource
	queue: Array<SourceInit | SourceData | SourceTrim>

	constructor(mediaSource: MediaSource) {
		this.mediaSource = mediaSource
		this.queue = []
	}

	// (re)initialize the source using the provided init segment.
	initialize(init: Uint8Array) {
		// Add the init segment to the queue so we call addSourceBuffer or changeType
		this.queue.push({
			kind: "init",
			init: init,
		})

		this.queue.push({
			kind: "data",
			data: init,
		})

		this.flush()
	}

	// Append the segment data to the buffer.
	append(data: Uint8Array | ArrayBuffer) {
		if (data.byteLength == 0) {
			throw new Error("empty append")
		}

		this.queue.push({
			kind: "data",
			data: data,
		})

		this.flush()
	}

	// Return the buffered range.
	buffered() {
		if (!this.sourceBuffer) {
			return { length: 0 }
		}

		return this.sourceBuffer.buffered
	}

	// Delete any media older than x seconds from the buffer.
	trim(duration: number) {
		this.queue.push({
			kind: "trim",
			trim: duration,
		})

		this.flush()
	}

	// Flush any queued instructions
	flush() {
		for (;;) {
			// Check if the buffer is currently busy.
			if (this.sourceBuffer && this.sourceBuffer.updating) {
				break
			}

			// Process the next item in the queue.
			const next = this.queue.shift()
			if (!next) {
				break
			}

			if (next.kind == "init") {
				const parsed = new MP4.Parser(next.init)
				if (!this.sourceBuffer) {
					// Create a new source buffer.
					this.sourceBuffer = this.mediaSource.addSourceBuffer(parsed.info.mime)

					// Call flush automatically after each update finishes.
					this.sourceBuffer.addEventListener("updateend", this.flush.bind(this))
				} else {
					this.sourceBuffer.changeType(parsed.info.mime)
				}
			} else if (next.kind == "data") {
				if (!this.sourceBuffer) {
					throw "failed to call initailize before append"
				}

				this.sourceBuffer.appendBuffer(next.data)
			} else if (next.kind == "trim") {
				if (!this.sourceBuffer) {
					throw "failed to call initailize before trim"
				}

				if (this.sourceBuffer.buffered.length == 0) {
					break
				}

				const end = this.sourceBuffer.buffered.end(this.sourceBuffer.buffered.length - 1) - next.trim
				const start = this.sourceBuffer.buffered.start(0)

				if (end > start) {
					this.sourceBuffer.remove(start, end)
				}
			} else {
				throw "impossible; unknown SourceItem"
			}
		}
	}
}

interface SourceInit {
	kind: "init"
	init: Uint8Array
}

interface SourceData {
	kind: "data"
	data: Uint8Array | ArrayBuffer
}

interface SourceTrim {
	kind: "trim"
	trim: number
}

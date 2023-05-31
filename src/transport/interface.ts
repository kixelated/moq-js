export interface Callback {
	onInit(stream: Stream): any
	onSegment(stream: Stream): any
}

export interface Stream {
	buffer: Uint8Array // unread buffered data
	reader: ReadableStream // unread unbuffered data
}

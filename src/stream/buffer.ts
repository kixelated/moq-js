export class Buffer {
	buffer: Uint8Array // unread buffered data
	reader: ReadableStream // unread unbuffered data

	constructor(reader: ReadableStream, buffer: Uint8Array = new Uint8Array(0)) {
		this.reader = reader
		this.buffer = buffer
	}
}

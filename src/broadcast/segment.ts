// Split a stream of frames at keyframe boundaries.
export function segmented(): TransformStream<EncodedVideoChunk, ReadableStream<EncodedVideoChunk>> {
	let current: WritableStreamDefaultWriter<EncodedVideoChunk> | undefined

	const transformer = new TransformStream({
		transform: async (frame: EncodedVideoChunk, controller: ReadableStream<EncodedVideoChunk>) => {
			if (frame.type === "key") {
				if (current) {
					await current.close()
				}

				const transformer = new TransformStream()

				current = transformer.writable.getWriter()
				controller.enqueue(transformer.readable)
			}

			if (!current) {
				throw new Error("stream did not start with a keyframe")
			}

			await current.write(frame)
		},
	})

	return transformer
}

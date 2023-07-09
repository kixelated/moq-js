import { Fragment } from "./container"

export class Segment {
	id: number
	fragments: ReadableStream<Uint8Array>

	constructor(id: number, fragments: ReadableStream<Uint8Array>) {
		this.id = id
		this.fragments = fragments
	}
}

// Take stream of fragments and return a stream segments (which contain a stream of fragments).
export function Segmenter(): TransformStream<Fragment, Segment> {
	let current: WritableStreamDefaultWriter<Uint8Array> | undefined
	let prev: number | undefined = undefined

	const transformer = new TransformStream<Fragment, Segment>({
		transform: async (fragment: Fragment, controller: TransformStreamDefaultController<Segment>) => {
			if (fragment.segment !== prev) {
				prev = fragment.segment

				if (current) {
					await current.close()
				}

				const transformer = new TransformStream()
				current = transformer.writable.getWriter()

				const segment = new Segment(fragment.segment, transformer.readable)
				controller.enqueue(segment)
			}

			if (!current) {
				throw new Error("stream did not start with a keyframe")
			}

			await current.write(fragment.data)
		},
	})

	return transformer
}

import { Watch } from "../common/async"
import { Closed } from "./error"
import { Order } from "./message"

export class Broadcast {
	tracks = new Map<string, Track>()
	readers = 0
	closed?: Closed

	constructor(public path: string[]) {}

	createTrack(name: string, priority: number): Track {
		if (this.closed) throw this.closed
		const track = new Track(this.path, name, priority)
		track.readers += 1 // Avoid closing the track when all readers are closed
		this.tracks.set(track.name, track)
		return track
	}

	reader(): BroadcastReader {
		this.readers += 1
		return new BroadcastReader(this)
	}

	close(err = new Closed()) {
		this.closed = err
	}
}

export class BroadcastReader {
	#broadcast: Broadcast

	constructor(broadcast: Broadcast) {
		this.#broadcast = broadcast
	}

	getTrack(name: string): TrackReader | undefined {
		const track = this.#broadcast.tracks.get(name)
		if (track) {
			return new TrackReader(track)
		}
	}

	get path(): string[] {
		return this.#broadcast.path
	}

	close() {
		this.#broadcast.readers -= 1
		if (this.#broadcast.readers <= 0) this.#broadcast.close()
	}
}

export class Track {
	readonly broadcast: string[]
	readonly name: string
	readonly priority: number
	order = Order.Any

	// TODO use an array
	latest = new Watch<GroupReader | undefined>(undefined)

	readers = 0
	closed?: Closed

	constructor(broadcast: string[], name: string, priority: number) {
		this.broadcast = broadcast
		this.name = name
		this.priority = priority
	}

	appendGroup(): Group {
		const next = this.latest.value()[0]?.id ?? 0
		return this.createGroup(next)
	}

	createGroup(sequence: number): Group {
		if (this.closed) throw this.closed

		const group = new Group(sequence)
		const [current, _] = this.latest.value()

		// TODO use an array
		if (!current || current.id < sequence) {
			const reader = new GroupReader(group)
			this.latest.update(reader)
		}

		return group
	}

	close(closed = new Closed()) {
		if (this.closed) return
		this.closed = closed
		this.latest.close()
	}

	reader(): TrackReader {
		// VERY important that readers are closed to decrement the count
		this.readers += 1
		return new TrackReader(this)
	}
}

export class TrackReader {
	latest?: number
	#track: Track

	constructor(track: Track) {
		this.#track = track
	}

	async nextGroup(): Promise<GroupReader | undefined> {
		let [current, next] = this.#track.latest.value()

		for (;;) {
			if (current && this.latest != current.id) {
				this.latest = current.id
				return current
			}

			if (this.#track.closed) throw this.#track.closed

			if (!next) return
			;[current, next] = await next
		}
	}

	get name() {
		return this.#track.name
	}

	get order() {
		return this.#track.order
	}

	get priority() {
		return this.#track.priority
	}

	close() {
		this.#track.readers -= 1
		if (this.#track.readers <= 0) this.#track.close()
	}
}

export class Group {
	readonly id: number

	chunks = new Watch<Uint8Array[]>([])
	readers = 0
	closed?: Closed

	constructor(id: number) {
		this.id = id
	}

	writeFrame(frame: Uint8Array) {
		if (this.closed) throw this.closed
		this.chunks.update((chunks) => [...chunks, frame])
	}

	writeFrames(...frames: Uint8Array[]) {
		if (this.closed) throw this.closed
		this.chunks.update((chunks) => [...chunks, ...frames])
		this.close()
	}

	reader(): GroupReader {
		this.readers += 1
		return new GroupReader(this)
	}

	get length(): number {
		return this.chunks.value()[0].length
	}

	close(closed = new Closed()) {
		if (this.closed) return
		this.closed = closed
		this.chunks.close()
	}
}

export class GroupReader {
	#group: Group
	#index = 0

	constructor(group: Group) {
		this.#group = group
	}

	async readFrame(): Promise<Uint8Array | undefined> {
		let [chunks, next] = this.#group.chunks.value()

		for (;;) {
			if (this.#index < chunks.length) {
				this.#index += 1
				return chunks[this.#index - 1]
			}

			if (this.#group.closed) throw this.#group.closed

			if (!next) return
			;[chunks, next] = await next
		}
	}

	get index(): number {
		return this.#index
	}

	get id(): number {
		return this.#group.id
	}

	close() {
		this.#group.readers -= 1
		if (this.#group.readers <= 0) this.#group.close()
	}
}

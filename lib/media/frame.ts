import { Group, GroupReader } from "../transfork/model"
import { setVint62 } from "../transfork/stream"

export type FrameType = "key" | "delta"

export class Frame {
	type: FrameType
	timestamp: bigint
	data: Uint8Array

	constructor(type: FrameType, timestamp: bigint, data: Uint8Array) {
		this.type = type
		this.timestamp = timestamp
		this.data = data
	}

	static async read(group: GroupReader): Promise<Frame | undefined> {
		const kind = group.index == 0 ? "key" : "delta"
		const payload = await group.readFrame()
		if (!payload) {
			return undefined
		}

		const [timestamp, data] = decode_timestamp(payload)
		return new Frame(kind, timestamp, data)
	}

	write(group: Group) {
		if ((group.length == 0) != (this.type == "key")) {
			throw new Error(`invalid ${this.type} position`)
		}

		let frame = new Uint8Array(8 + this.data.byteLength)
		const size = setVint62(frame, this.timestamp).byteLength
		frame.set(this.data, size)
		frame = new Uint8Array(frame.buffer, 0, this.data.byteLength + size)

		group.writeFrame(frame)
	}
}

// QUIC VarInt
function decode_timestamp(buf: Uint8Array): [bigint, Uint8Array] {
	const size = 1 << ((buf[0] & 0xc0) >> 6)

	const view = new DataView(buf.buffer, buf.byteOffset, size)
	const remain = new Uint8Array(buf.buffer, buf.byteOffset + size, buf.byteLength - size)
	let v

	if (size == 1) {
		v = BigInt(buf[0]) & 0x3fn
	} else if (size == 2) {
		v = BigInt(view.getInt16(0)) & 0x3fffn
	} else if (size == 4) {
		v = BigInt(view.getUint32(0)) & 0x3fffffffn
	} else if (size == 8) {
		v = view.getBigUint64(0) & 0x3fffffffffffffffn
	} else {
		throw new Error("impossible")
	}

	return [v, remain]
}

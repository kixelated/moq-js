import { Buffer } from "./ring"

export interface Config {
	channels: number
	sampleRate: number

	ring: Buffer
}

import { RingShared } from "./ring"

export interface From {
	config?: Config
}

export interface Config {
	channels: number
	sampleRate: number

	ring: RingShared
}

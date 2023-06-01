export interface Timed {
	timestamp: number
}

export function search(queue: Array<Timed>, timestamp: number): number {
	// Do binary search
	let low = 0
	let high = queue.length

	while (low < high) {
		const mid = (low + high) >>> 1
		if (queue[mid].timestamp < timestamp) low = mid + 1
		else high = mid
	}

	return low
}

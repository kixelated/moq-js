export type GroupOrder = "desc" | "asc"

export interface Track {
	name: string
	priority: number
	group_order: GroupOrder
	group_expires: number
}

export function decodeTrack(track: any): track is Track {
	if (typeof track.name !== "string") return false
	if (typeof track.priority !== "number") return false
	if (track.group_order !== "desc" && track.group_order !== "asc") return false
	if (typeof track.group_expires !== "number") return false
	return true
}

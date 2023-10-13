// src/entities/Book.ts
import { Entity, PrimaryKey, Property } from "@mikro-orm/core"

@Entity()
export class Broadcast {
	@PrimaryKey()
	id!: number

	@Property()
	title!: string
}

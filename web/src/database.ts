import "reflect-metadata"

import type { Config } from "@mikro-orm/core"
import { Broadcast } from "./entities/broadcast"

const dev = !import.meta.env.PROD

const config: Config = {
	type: dev ? "sqlite" : "postgresql",
	dbName: dev ? "dev.sqlite" : "prod_database_name",
	debug: dev,
	entities: [Broadcast],
}

export default config

import type { APIRoute } from "astro"
import { MikroORM } from "@mikro-orm/core"
import dbConfig from "@/database"

export const prerender = false

export const GET: APIRoute = async ({ params, request }) => {
	const db = await MikroORM.init(dbConfig)

	return new Response(
		JSON.stringify({
			path: new URL(request.url).pathname,
		}),
	)
}

export const POST: APIRoute = ({ request }) => {
	return new Response(
		JSON.stringify({
			message: "This was a POST!",
		}),
	)
}

export const DELETE: APIRoute = ({ request }) => {
	return new Response(
		JSON.stringify({
			message: "This was a DELETE!",
		}),
	)
}

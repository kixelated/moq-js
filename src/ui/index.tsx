import { App } from "./app"

import { render } from "solid-js/web"

const params = new URLSearchParams(window.location.search)

let url = params.get("url")

// Change the default URL based on the environment.
if (process.env.NODE_ENV === "production") {
	url ??= "https://moq-demo.englishm.net:4443"
} else {
	url ??= "https://localhost:4443"
}

const app = document.getElementById("app")
if (!app) {
	throw new Error("no container")
}

render(() => <App url={url!} />, app)

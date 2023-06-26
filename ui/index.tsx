import React from "react"

import { createRoot } from "react-dom/client"
import { App } from "./app"

const container = document.getElementById("app")
if (!container) {
	throw new Error("no container")
}

const root = createRoot(container)
root.render(<App />)

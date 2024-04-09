import { createEffect } from "solid-js"
import Chart from "chart.js/auto"
import * as ch from "chart.js/auto"
import type { IndexedDBFramesSchema } from "./watch"

let chart: Chart // define chart variable outside of function

const chartTypes: { [key: string]: ch.ChartType } = {
	line: "line",
	bar: "bar",
}

interface ChartProps {
	frames: IndexedDBFramesSchema[]
}

const Plot = (props: ChartProps) => {
	createEffect(() => {
		console.log("CHART_RENDER")
		const frames = props.frames

		const canvas = document.getElementById("chart") as HTMLCanvasElement
		const ctx = canvas.getContext("2d")
		const configuration = {
			type: chartTypes["line"],
			data: {
				labels: frames.map((aFrame) => new Date(aFrame.timestamp).toLocaleTimeString()),
				datasets: [
					{
						label: "Frame Count",
						data: frames.map((aFrame) => frames.findIndex((searchedFrame) => searchedFrame === aFrame)),
						borderColor: "rgb(75, 192, 192)",
						tension: 0.1,
					},
				],
			},
			options: {
				scales: {
					x: {
						title: {
							display: true,
							text: "Time",
						},
					},
					y: {
						title: {
							display: true,
							text: "Frame Count",
						},
					},
				},
			},
		}

		if (chart) {
			chart.destroy()
			console.log("DESTROYED")

			if (ctx) {
				chart = new Chart(ctx, configuration)
			}
		} else {
			if (ctx) {
				chart = new Chart(ctx, configuration)
			}
		}

		return () => chart.destroy() // Cleanup when component unmounts
	})

	return (
		<div>
			<div>
				<canvas id="chart" />
			</div>
		</div>
	)
}

export default Plot

import { createEffect } from "solid-js"
import Chart from "chart.js/auto"
import * as ch from "chart.js/auto"
import type { IndexedDBFBitRateWithTimestampSchema } from "./watch"

let chart: Chart // define chart variable outside of function

const chartTypes: { [key: string]: ch.ChartType } = {
	line: "line",
	bar: "bar",
}

interface ChartPropss {
	bitrateWithTimestamp: IndexedDBFBitRateWithTimestampSchema[]
}

const Plot = (props: ChartPropss) => {
	createEffect(() => {
		console.log("CHART_RENDER")
		const bitrateWithTimestamp = props.bitrateWithTimestamp

		const canvas = document.getElementById("chart") as HTMLCanvasElement
		const ctx = canvas.getContext("2d")
		const configuration = {
			type: chartTypes["line"],
			data: {
				labels: bitrateWithTimestamp.map((aData) => new Date(aData.timestamp).toLocaleTimeString()),
				datasets: [
					{
						label: "Bitrate",
						data: bitrateWithTimestamp.map((aData) => aData.bitrate),
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
							text: "Bitrate",
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

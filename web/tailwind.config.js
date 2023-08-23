/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
	theme: {
		extend: {
			transitionProperty: {
				size: "height, width, flex-basis",
				pos: "top, right, bottom, left",
			},
		},
	},
	plugins: [require("@tailwindcss/forms")],
}

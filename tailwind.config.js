/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ["./src/ui/**/*.{html,js,ts,jsx,tsx}"],
	theme: {
		extend: {},
	},
	plugins: [require("@tailwindcss/forms")],
}

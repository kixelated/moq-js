/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ["./ui/**/*.{html,js,ts,jsx,tsx}"],
	theme: {
		extend: {},
	},
	plugins: [require("@tailwindcss/forms")],
}

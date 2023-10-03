module.exports = {
	content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
	theme: {
		extend: {
			typography: ({ theme }) => ({
				moq: {
					css: {
						"--tw-prose-body": theme("colors.slate[200]"),
						"--tw-prose-headings": theme("colors.white"),
						"--tw-prose-lead": theme("colors.slate[400]"),
						"--tw-prose-links": theme("colors.green[500]"),
						"--tw-prose-bold": theme("colors.green[500]"),
						"--tw-prose-counters": theme("colors.slate[400]"),
						"--tw-prose-bullets": theme("colors.slate[600]"),
						"--tw-prose-hr": theme("colors.slate[700]"),
						"--tw-prose-quotes": theme("colors.slate[100]"),
						"--tw-prose-quote-borders": theme("colors.slate[700]"),
						"--tw-prose-captions": theme("colors.slate[400]"),
						"--tw-prose-kbd": theme("colors.white"),
						"--tw-prose-kbd-shadows": theme("colors.white"),
						"--tw-prose-code": theme("colors.white"),
						"--tw-prose-pre-code": theme("colors.slate[300]"),
						"--tw-prose-pre-bg": "rgb(0 0 0 / 50%)",
						"--tw-prose-th-borders": theme("colors.slate[600]"),
						"--tw-prose-td-borders": theme("colors.slate[700]"),
					},
				},
			}),
		},
	},
	plugins: [require("@tailwindcss/typography"), require("@tailwindcss/forms")],
}

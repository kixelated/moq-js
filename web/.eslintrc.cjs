module.exports = {
	parser: "@typescript-eslint/parser",
	plugins: ["@typescript-eslint", "solid", "jsx-a11y", "prettier"],
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
		"plugin:@typescript-eslint/recommended-requiring-type-checking",
		"plugin:@typescript-eslint/strict",
		"plugin:astro/recommended",
		"plugin:solid/typescript",
		"plugin:jsx-a11y/recommended",
		"plugin:prettier/recommended",
	],
	root: true,
	overrides: [
		{
			files: ["*.astro"],
			parser: "astro-eslint-parser",
			parserOptions: {
				extraFileExtensions: [".astro"],
			},
		},
	],
	rules: {
		// Warn when an unused variable doesn't start with an underscore
		"@typescript-eslint/no-unused-vars": [
			"warn",
			{
				argsIgnorePattern: "^_",
				varsIgnorePattern: "^_",
				caughtErrorsIgnorePattern: "^_",
			},
		],
		// Make formatting errors into warnings
		"prettier/prettier": 1
	},
	parserOptions: {
		project: true,
	},
	env: {
		browser: true,
		amd: true,
		node: true,
	},
	ignorePatterns: ["node_modules", ".eslintrc.cjs", "tailwind.config.cjs", "astro.config.mjs"],
}

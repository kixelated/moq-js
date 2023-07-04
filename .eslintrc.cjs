/* eslint-env node */
module.exports = {
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
		"plugin:@typescript-eslint/recommended-requiring-type-checking",
		"plugin:@typescript-eslint/strict",
		"prettier",
	],
	parser: "@typescript-eslint/parser",
	plugins: ["@typescript-eslint", "prettier"],
	root: true,
	env: {
		browser: true,
		es2020: true,
		worker: true,
	},
	ignorePatterns: ["dist", "node_modules", "tailwind.config.js", ".eslintrc.cjs"],
	rules: {
		"@typescript-eslint/no-non-null-assertion": "off",
		"@typescript-eslint/no-explicit-any": "off",
		"no-unused-vars": "off", // Disable so we can allow variables prefixed with _
		"@typescript-eslint/no-unused-vars": [
			"warn", // or "error"
			{
				argsIgnorePattern: "^_",
				varsIgnorePattern: "^_",
				caughtErrorsIgnorePattern: "^_",
			},
		],
		"prettier/prettier": 2, // Means error
	},

	parserOptions: {
		project: true,
		tsconfigRootDir: __dirname,
		ecmaFeatures: {
			jsx: true,
		},
	},
}

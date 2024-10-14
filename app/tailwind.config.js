const flowbite = require("flowbite-react/tailwind");

/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ["./app/**/*.{js,jsx,ts,tsx}", flowbite.content()],
	presets: [require("nativewind/preset")],
	theme: {
		extend: {},
	},
	plugins: [flowbite.plugin()],
};

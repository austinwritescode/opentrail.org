/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {}
	},
	plugins: [require('daisyui')],
	daisyui: {
		themes: [
			{
				light: {
					primary: '#0E3B32',
					'primary-content': '#FFFFFF',
					secondary: '#70CF98',
					'secondary-content': '#0E3B32',
					accent: '#FFD24C',
					'accent-content': '#0E3B32',
					neutral: '#0E3B32',
					'base-100': '#FFFFFF',
					'base-200': '#EEF7F2',
					'base-300': '#DCE8E1',
					'base-content': '#0E3B32',
					info: '#2B87C9',
					success: '#2E9E6B',
					warning: '#FFD24C',
					error: '#D93A3A'
				}
			},
			{
				dark: {
					'color-scheme': 'dark',
					primary: '#70CF98',
					'primary-content': '#10271E',
					secondary: '#A9C5B8',
					'secondary-content': '#10271E',
					accent: '#FFD24C',
					'accent-content': '#10271E',
					neutral: '#243D34',
					'neutral-content': '#DDF4E6',
					'base-100': '#192F27',
					'base-200': '#14271F',
					'base-300': '#102019',
					'base-content': '#DDF4E6',
					info: '#70CF98',
					'info-content': '#10271E',
					success: '#70CF98',
					'success-content': '#10271E',
					warning: '#FFD24C',
					'warning-content': '#10271E',
					error: '#F28B82',
					'error-content': '#301411'
				}
			}
		]
	}
};

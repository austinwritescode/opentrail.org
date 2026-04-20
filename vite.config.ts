import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

// Get current tag/commit and last commit date from
const version = JSON.stringify(process.env.APP_VERSION || 'unknown');
const lastmod = JSON.stringify(process.env.APP_LASTMOD || 'unknown');

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		__VERSION__: version,
		__LASTMOD__: lastmod,
	}
});
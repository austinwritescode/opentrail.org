import { sveltekit } from '@sveltejs/kit/vite';
import type { UserConfig } from 'vite';
import { exec } from 'child_process'
import { promisify } from 'util'

// Get current tag/commit and last commit date from
const version = JSON.stringify(process.env.APP_VERSION || 'unknown');
const lastmod = JSON.stringify(process.env.APP_LASTMOD || 'unknown');

export default defineConfig({
	define: {
		__VERSION__: version,
		__LASTMOD__: lastmod,
	}
});

const config: UserConfig = {
	plugins: [sveltekit()],
	define: {
		__VERSION__: version,
		__LASTMOD__: lastmod,
	},
};

export default config;

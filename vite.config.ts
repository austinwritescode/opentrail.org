import { sentrySvelteKit } from "@sentry/sveltekit";
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const version = JSON.stringify(process.env.APP_VERSION || 'unknown');
const lastmod = JSON.stringify(process.env.APP_LASTMOD || 'unknown');

function chunkCountPlugin() {
	let clientOutDir = '';
	return {
		name: 'chunk-count-plugin',
		configResolved(config: any) {
			if (config.build.ssr) return;
			clientOutDir = config.build.outDir;
		},
		writeBundle(options: any, bundle: any) {
			if (!clientOutDir) return;
		const jsChunks = Object.keys(bundle).filter(
			(f: string) => f.endsWith('.js') && !f.endsWith('.map')
		);
		const cssChunks = Object.keys(bundle).filter(
			(f: string) => f.endsWith('.css') && !f.endsWith('.map')
		);
			const total = jsChunks.length + cssChunks.length;
			const data = JSON.stringify({ total });
			const outPath = resolve(clientOutDir, '__chunk_count.json');
			writeFileSync(outPath, data);
		}
	};
}

export default defineConfig({
plugins: [sentrySvelteKit({
org: "opentrail",
project: "opentrail"
}), sveltekit(), chunkCountPlugin()],
define: {
__VERSION__: version,
__LASTMOD__: lastmod,
}
});
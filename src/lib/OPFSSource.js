export class OPFSSource {
	/**
	 * @param {string} trail
	 */
	constructor(trail) {
		this.trail = trail;
		/** @type {FileSystemFileHandle | null} */
		this.fileHandle = null;
	}

	getKey() {
		return `https://cdn.opentrail.org/${this.trail}.pmtiles`;
	}

	/**
	 * @param {number} offset
	 * @param {number} length
	 * @param {AbortSignal} [signal]
	 * @returns {Promise<{ data: ArrayBuffer }>}
	 */
	async getBytes(offset, length, signal) {
		if (!this.fileHandle) {
			const root = await navigator.storage.getDirectory();
			this.fileHandle = await root.getFileHandle(`${this.trail}.pmtiles`);
		}
		const file = await this.fileHandle.getFile();
		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
		const sliced = file.slice(offset, offset + length);
		const data = await sliced.arrayBuffer();
		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
		return { data };
	}
}

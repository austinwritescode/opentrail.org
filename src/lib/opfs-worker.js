/** @type {any} */
let handle = null;
/** @type {FileSystemDirectoryHandle | null} */
let root = null;
/** @type {string | null} */
let currentTrail = null;

self.onmessage = async (e) => {
	const { type } = e.data;

	if (type === 'open') {
		try {
			const { trail, startBytes } = e.data;
			currentTrail = trail;
			root = await navigator.storage.getDirectory();
			const fileHandle = await root.getFileHandle(`${trail}.pmtiles`, { create: true });
			handle = await /** @type {any} */ (fileHandle).createSyncAccessHandle();
			if (startBytes === 0) handle.truncate(0);
			self.postMessage({ type: 'open', size: handle.getSize() });
		} catch (/** @type {any} */ err) {
			self.postMessage({ type: 'error', error: err.message });
		}
	} else if (type === 'write') {
		try {
			const { data, offset } = e.data;
			const written = handle.write(new Uint8Array(data), { at: offset });
			self.postMessage({ type: 'write', written });
		} catch (/** @type {any} */ err) {
			self.postMessage({ type: 'error', error: err.message });
		}
	} else if (type === 'flush') {
		try {
			handle.flush();
			self.postMessage({ type: 'flush' });
		} catch (/** @type {any} */ err) {
			self.postMessage({ type: 'error', error: err.message });
		}
	} else if (type === 'close') {
		try {
			handle.close();
			handle = null;
			self.postMessage({ type: 'close' });
		} catch (/** @type {any} */ err) {
			self.postMessage({ type: 'error', error: err.message });
		}
	} else if (type === 'abort') {
		try {
			if (handle) {
				handle.close();
				handle = null;
			}
			const { startBytes } = e.data;
			if (startBytes === 0 && root && currentTrail) {
				await root.removeEntry(`${currentTrail}.pmtiles`);
			}
			self.postMessage({ type: 'abort' });
		} catch (/** @type {any} */ err) {
			self.postMessage({ type: 'error', error: err.message });
		}
	}
};

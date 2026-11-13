/** Keep keyboard focus inside a sheet, then restore its trigger on close.
 * @param {HTMLElement} node
 * @param {() => void} close
 */
export function dialogFocus(node, close) {
	const previous = document.activeElement;
	const selector =
		'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex="0"]';
	const frame = requestAnimationFrame(() => {
		const input = node.querySelector('input, textarea');
		(input instanceof HTMLElement ? input : node).focus();
	});
	/** @param {KeyboardEvent} event */
	function keydown(event) {
		if (event.defaultPrevented) return;
		const dialogs = [...document.querySelectorAll('.modal-open')];
		const topDialog = dialogs[dialogs.length - 1];
		if (topDialog && !topDialog.contains(node)) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			close();
		}
		if (event.key !== 'Tab') return;
		const elements = [...node.querySelectorAll(selector)].filter(
			(el) => el instanceof HTMLElement && el.getClientRects().length
		);
		const first = elements[0];
		const last = elements[elements.length - 1];
		if (!first) {
			event.preventDefault();
			node.focus();
			return;
		}
		if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) {
			event.preventDefault();
			if (last instanceof HTMLElement) last.focus();
		} else if (
			!event.shiftKey &&
			(document.activeElement === last || document.activeElement === node)
		) {
			event.preventDefault();
			if (first instanceof HTMLElement) first.focus();
		}
	}
	window.addEventListener('keydown', keydown);
	return {
		destroy() {
			cancelAnimationFrame(frame);
			window.removeEventListener('keydown', keydown);
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		}
	};
}

/** Drag a sheet from its handle without intercepting content scrolling.
 * @param {HTMLButtonElement} node
 * @param {() => void} close
 */
export function dragToClose(node, close) {
	const sheet = node.closest('.marker-sheet');
	if (!(sheet instanceof HTMLElement)) return;
	let pointer = null;
	let startY = 0;
	let distance = 0;
	let moved = false;
	function reset() {
		pointer = null;
		sheet.style.transform = '';
		sheet.classList.remove('sheet-dragging');
	}
	function down(event) {
		if (!event.isPrimary || event.button !== 0 || pointer !== null) return;
		pointer = event.pointerId;
		startY = event.clientY;
		distance = 0;
		moved = false;
		node.setPointerCapture(pointer);
		sheet.classList.add('sheet-dragging');
	}
	function move(event) {
		if (event.pointerId !== pointer) return;
		const delta = event.clientY - startY;
		moved ||= Math.abs(delta) > 5;
		distance = Math.max(0, delta);
		sheet.style.transform = `translateY(${distance}px)`;
	}
	function up(event) {
		if (event.pointerId !== pointer) return;
		const dismiss = distance >= Math.min(100, sheet.clientHeight * 0.2);
		reset();
		if (dismiss) close();
	}
	function cancel(event) {
		if (event.pointerId !== pointer) return;
		moved = true;
		reset();
	}
	function click(event) {
		event.stopPropagation();
		// A short drag must snap back rather than become a click-to-close.
		if (!moved || event.detail === 0) close();
		moved = false;
	}
	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', cancel);
	node.addEventListener('lostpointercapture', cancel);
	node.addEventListener('click', click);
	return {
		destroy() {
			reset();
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', cancel);
			node.removeEventListener('lostpointercapture', cancel);
			node.removeEventListener('click', click);
		}
	};
}

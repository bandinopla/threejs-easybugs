export function throttle(fn: (...args: any[]) => void, delay: number) {
	let last = 0;
	return (...args: any[]) => {
		const now = performance.now();
		if (now - last >= delay) {
			last = now;
			fn(...args);
		}
	};
}

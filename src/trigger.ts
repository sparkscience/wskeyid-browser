import Once, { SubOnce } from "./once";

export default class Trigger<T> implements SubOnce<T> {
	private _hasFailed: boolean = false;
	private readonly once: Once<T> = new Once<T>();

	trigger(value: T) {
		this._hasFailed = true;
		this.once.emit(value);
	}

	addEventListener(listener: (value: T) => void): () => void {
		return this.once.addEventListener(listener);
	}

	toPromise(): Promise<T> {
		return this.once.toPromise();
	}

	get hasTriggered() {
		return this._hasFailed;
	}
}

export function merge<T, V>(a: Trigger<T>, b: Trigger<T>): Trigger<T | V> {
	const failed = new Trigger<T | V>();
	a.addEventListener((failure) => {
		failed.trigger(failure);
	});
	b.addEventListener((failure) => {
		failed.trigger(failure);
	})
	return failed;
}
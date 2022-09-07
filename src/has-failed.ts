import Once, { SubOnce } from "./once";

export default class HasFailed<T> implements SubOnce<T> {
	private _hasFailed: boolean = false;
	private once: Once<T> = new Once<T>();

	fail(value: T) {
		this._hasFailed = true;
		this.once.emit(value);
	}

	addEventListener(listener: (value: T) => void): () => void {
		return this.once.addEventListener(listener);
	}

	toPromise(): Promise<T> {
		return this.once.toPromise();
	}

	get hasFailed() {
		return this._hasFailed;
	}
}

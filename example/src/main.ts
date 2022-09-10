import AuthenticatedConnection from "../../src/authenticated-connection";
import Trigger from "../../src/trigger";
import PubSub, { getNext, Sub, toAsyncIterable } from "../../src/pub-sub";
import { generateKeys } from "../../src/utils";

class Session {
	private connection: AuthenticatedConnection | null = null;
	private readonly failed: Trigger<any> = new Trigger();
	private readonly _messageEvents: PubSub<MessageEvent> = new PubSub();

	private fail(error: any) {
		this.failed.trigger(error)
	}

	constructor(private readonly url: string, private readonly key: CryptoKeyPair) {
		this.connect().catch((e) => {
			this.fail(e);
		});
	}

	private async connect() {
		this.connection = await AuthenticatedConnection.connect(this.url, this.key);
		this.connection.onFail.addEventListener((e) => {
			this.fail(e);
		});
		this.connection.messageEvents.addEventListener(listener => {
			
		});
	}

	getNextMessage() {
		return getNext(this._messageEvents);
	}

	get messageEvents(): Sub<MessageEvent> {
		return this._messageEvents;
	}

	get hasFailed() {
		return this.failed.hasTriggered
	}
}

Promise.resolve()
	.then(async function() {
		const keys = await generateKeys();
		const session = await AuthenticatedConnection.connect(
			"ws://localhost:8000/path",
			keys
		);

		session.sessionStatusChangeEvents.addEventListener((status) => {
			console.log(`Status ${status.type}`);

			if (status.type === "CONNECTING") {
				console.log(status.status);
			} else {
				console.log("Something else!");
			}
		});

		session.onFail.addEventListener((e) => {
			console.error(e);
		});

		let lastTimestamp = Date.now();
		for await (const event of toAsyncIterable(session.messageEvents)) {
			console.log(event);
			console.log("Time difference", Date.now() - lastTimestamp);
			lastTimestamp = Date.now();
			session.send(JSON.stringify({ type: "RESPONSE", data: "Haha" }));
		}
	})
	.catch(console.error);

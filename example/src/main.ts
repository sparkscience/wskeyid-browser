import AuthenticatedConnection, {
	ConnectionStatus,
} from "../../src/authenticated-connection";
import PubSub, { getNext, Sub, toAsyncIterable } from "../../src/pub-sub";
import { generateKeys } from "../../src/utils";

class Session {
	private connection: AuthenticatedConnection | null = null;
	private readonly _messageEvents: PubSub<MessageEvent> = new PubSub();
	private connectionStatus: Readonly<ConnectionStatus> = { type: "PENDING" };
	private connectionStatusChangeEvents: PubSub<ConnectionStatus> = new PubSub();

	private async fail(error: any) {
		const errorStatus: Readonly<ConnectionStatus> = Object.freeze<
			ConnectionStatus
		>({
			type: "CLOSED",
			reason: { type: "CONNECTION_ERROR", data: error },
		});
		this.connectionStatus = errorStatus;

		try {
			await this.connect();
		} catch (e) {
			this.fail(e);
		}
	}

	constructor(
		private readonly url: string,
		private readonly key: CryptoKeyPair
	) {
		this.connect().catch((e) => {
			this.fail(e).catch(this.fail.bind(this));
		});
	}

	private async connect() {
		this.connection = await AuthenticatedConnection.connect(this.url, this.key);
		this.connection.sessionStatusChangeEvents.addEventListener((status) => {
			this.connectionStatus = status;
			this.connectionStatusChangeEvents.emit(status);
		});
		this.connection.messageEvents.addEventListener((message) => {
			this._messageEvents.emit(message);
		});
	}

	getNextMessage() {
		return getNext(this._messageEvents);
	}

	get messageEvents(): Sub<MessageEvent> {
		return this._messageEvents;
	}

	get sessionStatus(): ConnectionStatus {
		return this.connectionStatus;
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

		let lastTimestamp = Date.now();
		for await (const event of toAsyncIterable(session.messageEvents)) {
			console.log(event);
			console.log("Time difference", Date.now() - lastTimestamp);
			lastTimestamp = Date.now();
			session.send(JSON.stringify({ type: "RESPONSE", data: "Haha" }));
		}
	})
	.catch(console.error);

import AuthenticatedConnection, {
	ConnectionStatus,
} from "../../src/authenticated-connection";
import PubSub, { getNext, Sub, toAsyncIterable } from "../../src/pub-sub";
import { generateKeys } from "../../src/utils";

const backoffMSIncrement = 120;
const maxBackoffExponent = 9;

type SessionStatus = ConnectionStatus;

class Session {
	private connection: AuthenticatedConnection | null = null;
	private readonly _messageEvents: PubSub<MessageEvent> = new PubSub();
	private _sessionStatus: Readonly<SessionStatus> = { type: "PENDING" };
	private sessionStatusChangeEvents: PubSub<ConnectionStatus> = new PubSub();

	private backoffExponent = 0;

	private async fail(error: any) {
		const errorStatus: Readonly<ConnectionStatus> = Object.freeze<
			ConnectionStatus
		>({
			type: "CLOSED",
			reason: { type: "CONNECTION_ERROR", data: error },
		});

		this.setSessionStatus(errorStatus);

		const backoffExponent = this.backoffExponent;

		this.backoffExponent =
			this.backoffExponent >= maxBackoffExponent
				? maxBackoffExponent
				: this.backoffExponent + 1;

		return new Promise((resolve) => {
			setTimeout(() => {
				this.connect()
					.catch(this.fail.bind(this))
					.then(resolve);
			}, backoffMSIncrement * 2 ** backoffExponent);
		});
	}

	constructor(
		private readonly url: string,
		private readonly key: CryptoKeyPair
	) {
		this.connect().catch((e) => {
			this.fail(e).catch(this.fail.bind(this));
		});
	}

	private setSessionStatus(status: ConnectionStatus) {
		this._sessionStatus = status;
		setTimeout(() => {
			this.sessionStatusChangeEvents.emit(status);
		});
	}

	private async connect() {
		this.connection = await AuthenticatedConnection.connect(this.url, this.key);
		this.connection.sessionStatusChangeEvents.addEventListener((status) => {
			if (status.type === "CONNECTED") {
				this.backoffExponent = 0;
			}
			this.setSessionStatus(status);
			if (status.type === "CLOSED") {
				this.connect().catch((e) => {
					this.fail(e).catch(this.fail.bind(this));
				});
			}
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
		return this._sessionStatus;
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

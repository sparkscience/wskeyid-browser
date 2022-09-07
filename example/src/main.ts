import AuthenticatedConnection from "../../src/authenticated-connection";
import HasFailed from "../../src/has-failed";
import Once, { SubOnce } from "../../src/once";
import { toAsyncIterable } from "../../src/pub-sub";
import { generateKeys } from "../../src/utils";

class Session {
	private connection: AuthenticatedConnection;

	constructor(url: string, key: CryptoKeyPair) {
		this.connect().then(() => {
			
		}).catch((e) => {
			console.error(e);
		});
	}

	async connect() {}

	onFail(): SubOnce<void> {
		this.
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

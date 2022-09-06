import AuthenticatedConnection from "../../src/authenticated-connection";
import { toAsyncIterable } from "../../src/pub-sub";
import { generateKeys } from "../../src/utils";

Promise.resolve()
	.then(async function() {
		const keys = await generateKeys();
		const session = await AuthenticatedConnection.connect(
			"ws://localhost:8000/path",
			keys
		);

		let interval: NodeJS.Timeout | null = null;

		session.sessionStatusChangeEvents.addEventListener((status) => {
			console.log(`Status ${status}`);

			if (status === "CONNECTING") {
				interval = setInterval(() => {
					if (session.expectedConnectionStartTimestamp) {
						const timeDifference =
							session.expectedConnectionStartTimestamp - Date.now();
						if (timeDifference > 0) {
							console.log(
								`Attempting connection in ${Math.floor(
									timeDifference / 1000
								)} second${Math.floor(timeDifference / 1000) !== 1 ? "s" : ""}`
							);
						} else {
							console.log("Should be connected, or connecting");
						}
					} else {
						console.log("Should be connected, or connecting");
					}
				}, 1000);
			} else {
				if (interval !== null) {
					clearInterval(interval);
					interval = null;
				}
			}
		});

		session.onFail.addEventListener((e) => {
			console.error(e);
		});

		for await (const event of toAsyncIterable(session.messageEvents)) {
			console.log(event.data);
			session.send(JSON.stringify({ type: "RESPONSE", data: "Haha" }));
		}
	})
	.catch(console.error);

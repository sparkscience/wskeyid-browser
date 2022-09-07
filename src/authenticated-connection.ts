import { decodeBase64, encodeBase64 } from "./base64";
import HasFailed from "./has-failed";
import { SubOnce } from "./once";
import PubSub, { getNext, Sub } from "./pub-sub";
import { getClientId, signMessage } from "./utils";

export type SessionStatus =
	| { type: "PENDING" }
	| {
			type: "CONNECTING";
			status:
				| "WAITING_WEBSOCKET_CONNECTION"
				| "AWAITING_CHALLENGE"
				| "AWAITING_AUTHORIZATION";
	  }
	| { type: "CONNECTED" }
	| {
			type: "CLOSED";
			reason:
				| { type: "CONNECTION_ERROR"; data: any }
				| { type: "CLIENT_CLOSED" };
	  };

export class BadChallengeRequest extends Error {
	constructor() {
		super("Got a bad challenge request from the server");
	}
}

export class BadAuthorizationResponseError extends Error {
	private _messageBody: any;

	constructor(messageBody: any) {
		super("Got a bad authorization error response");

		this._messageBody = messageBody;
	}

	get messageBody() {
		return this._messageBody;
	}
}

/**
 * This is a class that maintains an authenticated connection.
 *
 * If a connection fails, then an entirely new auth connection will need to be
 * established.
 */
export default class AuthenticatedConnection {
	private failed: HasFailed<any> = new HasFailed();
	private ws: WebSocket;
	private _url: URL;
	private _sessionStatus: SessionStatus = { type: "PENDING" };
	private _sessionStatusChangeEvents: PubSub<SessionStatus> = new PubSub();
	private _internalMessageEvents: PubSub<MessageEvent> = new PubSub();
	private _messageEvents: PubSub<MessageEvent> = new PubSub();

	private constructor(url: URL, private key: CryptoKeyPair) {
		this._url = url;

		this.setSessionStatus({
			type: "CONNECTING",
			status: "WAITING_WEBSOCKET_CONNECTION",
		});

		this.ws = new WebSocket(this._url.toString());
		this.ws.addEventListener("close", () => {
			this.setSessionStatus({
				type: "CLOSED",
				reason: { type: "CLIENT_CLOSED" },
			});
		});
		this.ws.addEventListener("error", (event) => {
			this.setSessionStatus({
				type: "CLOSED",
				reason: { type: "CONNECTION_ERROR", data: event },
			});
		});
		this.ws.addEventListener("open", () => {
			this.performHandshake().catch((e) => {
				this.failed.fail(e);
				this.ws.close();
			});
		});
		this.ws.addEventListener("message", (event) => {
			this._internalMessageEvents.emit(event);
			if (this.sessionStatus.type === "CONNECTED") {
				this._messageEvents.emit(event);
			}
		});
	}

	private setSessionStatus(status: SessionStatus) {
		this._sessionStatus = status;
		setTimeout(() => {
			this._sessionStatusChangeEvents.emit(status);
		});
	}

	private async performHandshake() {
		{
			this.setSessionStatus({
				type: "CONNECTING",
				status: "AWAITING_CHALLENGE",
			});
			const { data: payload } = await getNext(this._internalMessageEvents);

			const { type, data } = JSON.parse(payload);

			if (type === "CHALLENGE" && data && typeof data.payload === "string") {
				const messageToSign = decodeBase64(data.payload);
				const signature = await signMessage(this.key.privateKey, messageToSign);

				this.ws.send(
					JSON.stringify({
						type: "CHALLENGE_RESPONSE",
						data: {
							payload: data.payload,
							signature: encodeBase64(signature),
						},
					})
				);

				this.setSessionStatus({
					type: "CONNECTING",
					status: "AWAITING_AUTHORIZATION",
				});
			} else {
				throw new BadChallengeRequest();
			}
		}

		{
			const { data: response } = await getNext(this._internalMessageEvents);

			const messageBody = JSON.parse(response);
			const { type } = messageBody;

			if (type !== "AUTHORIZED") {
				throw new BadAuthorizationResponseError(messageBody);
			}

			this.setSessionStatus({ type: "CONNECTED" });
		}
	}

	send(message: string) {
		this.ws.send(message);
	}

	get messageEvents(): Sub<MessageEvent> {
		return this._messageEvents;
	}

	getNextMessage(): Promise<MessageEvent> {
		return getNext(this.messageEvents);
	}

	close() {
		this.ws?.close();
	}

	get isClosed() {
		return this._sessionStatus.type === "CLOSED";
	}

	get hasFailed(): boolean {
		return this.failed.hasFailed;
	}

	get onFail(): SubOnce<void> {
		return this.failed;
	}

	get sessionStatus() {
		return this._sessionStatus;
	}

	get sessionStatusChangeEvents(): Sub<SessionStatus> {
		return this._sessionStatusChangeEvents;
	}

	static async connect(
		url: string,
		key: CryptoKeyPair
	): Promise<AuthenticatedConnection> {
		const clientId = await getClientId(key.publicKey);
		console.log(clientId);
		const u = new URL(url);
		u.searchParams.set("client_id", clientId);

		return new AuthenticatedConnection(new URL(u.toString()), key);
	}
}

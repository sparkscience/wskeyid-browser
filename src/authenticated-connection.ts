import { decodeBase64, encodeBase64 } from "./base64";
import Once, { SubOnce } from "./once";
import PubSub, { Sub } from "./pub-sub";
import { getClientId, signMessage } from "./utils";
import WsSession, { ConnectionStatus } from "./ws-session";

export type SessionStatus =
	| ConnectionStatus
	| "ERROR"
	| "FAILED"
	| "AWAITING_CHALLENGE"
	| "AWAITING_AUTHORIZATION"
	| "AUTHORIZED";

export class BadChallengeRequest extends Error {
	constructor() {
		super("Got a bad challenge request from the server");
	}
}

export class FatalError extends Error {
	constructor() {
		super("An attempt was made to connect to a session that does not exist!");
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

class HasFailed<T> implements SubOnce<T> {
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

/**
 * This is a class that maintains an authenticated connection.
 *
 * If a connection fails, then an entirely new auth connection will need to be
 * established.
 */
export default class AuthenticatedConnection {
	private failed: HasFailed<any> = new HasFailed();
	private session: WsSession;
	private _url: URL;
	private _sessionStatus: SessionStatus;
	private _sessionStatusChangeEvents: PubSub<SessionStatus> = new PubSub();

	private constructor(url: URL, private key: CryptoKeyPair) {
		this._url = url;

		this.session = new WsSession(this._url.toString());
		this._sessionStatus = this.session.connectionStatus;
		this.session.connectionStatusChangeEvents.addEventListener((status) => {
			this.setSessionStatus(status);
			switch (status) {
				case "CONNECTED":
					{
						this.performHandshake().catch((e) => {
							this.failed.fail(e);
						});
					}
					break;
			}
		});
	}

	private setSessionStatus(status: SessionStatus) {
		this._sessionStatus = status;
		this._sessionStatusChangeEvents.emit(status);
	}

	private async performHandshake() {
		if (!this.session) {
			throw new FatalError();
		}
		if (this.session.isClosed) {
			return;
		}

		{
			const initialConnectionId = this.session.currentConnectionId;

			const { data: payload } = await this.session.getNextMessage();

			if (initialConnectionId !== this.session.currentConnectionId) {
				this.performHandshake();
				return;
			}

			const { type, data } = JSON.parse(payload);

			if (type === "CHALLENGE" && data && typeof data.payload === "string") {
				const messageToSign = decodeBase64(data.payload);
				const signature = await signMessage(this.key.privateKey, messageToSign);

				this.session.send(
					JSON.stringify({
						type: "CHALLENGE_RESPONSE",
						data: {
							payload: data.payload,
							signature: encodeBase64(signature),
						},
					})
				);
			} else {
				throw new BadChallengeRequest();
			}
		}

		{
			const { data: response } = await this.session.getNextMessage();

			const messageBody = JSON.parse(response);
			const { type } = messageBody;

			if (type !== "AUTHORIZED") {
				throw new BadAuthorizationResponseError(messageBody);
			}
		}
	}

	send(message: string) {
		this.session.send(message);
	}

	get messageEvents(): Sub<MessageEvent> {
		return this.session.messageEvents;
	}

	getNextMessage() {
		return this.session.getNextMessage();
	}

	close() {
		this.session?.close();
	}

	get isClosed() {
		return this.session.isClosed;
	}

	get expectedConnectionStartTimestamp() {
		return this.session.expectedConnectionStartTimestamp;
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

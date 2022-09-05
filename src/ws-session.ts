import PubSub, { getNext, Sub } from './pub-sub';

const maxBackoffIncrement = 7;
const backoffTime = 120;

export type ConnectionStatus =
  | 'PENDING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'FAILED'
  | 'CONNECTING';

export default class WsSession {
  private ws: WebSocket | null = null;
  private _url: string;
  private _isClosed: boolean = false;
  private messages: string[] = [];
  private _messageEvents: PubSub<MessageEvent> = new PubSub();
  private _connectionStatusChangeEvents: PubSub<
    ConnectionStatus
  > = new PubSub();
  private _currentConnectionId: number = 0;
  private _connectionStatus: ConnectionStatus = 'PENDING';

  constructor(url: string) {
    this._url = url;
    this.connect();
  }

  private backoffIncrement = 0;

  private resetBackoff() {
    this.backoffIncrement = 0;
  }

  private disconnected() {
    this._currentConnectionId++;
    this.backoffIncrement =
      this.backoffIncrement < maxBackoffIncrement
        ? this.backoffIncrement + 1
        : this.backoffIncrement;
    this.connect();
  }

  private setConnectionStatus(connectionStatus: ConnectionStatus) {
    this._connectionStatus = connectionStatus;
    this._connectionStatusChangeEvents.emit(connectionStatus);
  }

  private connectionStartTime: Date | null = null;
  private connect() {
    this.setConnectionStatus('CONNECTING');

    const timeout = Math.random() * backoffTime * 2 ** this.backoffIncrement;
    this.connectionStartTime = new Date(Date.now() + timeout);

    setTimeout(() => {
      this.connectionStartTime = null;
      if (this._isClosed) {
        return;
      }

      const connectionStateSet = new Set([WebSocket.CLOSED, WebSocket.CLOSED]);

      if (this.ws && connectionStateSet.has(this.ws.readyState)) {
        this.ws.close();
      }

      this.ws = new WebSocket(this._url);

      this.ws.addEventListener('close', () => {
        this.setConnectionStatus('DISCONNECTED');
        this.disconnected();
      });

      this.ws.addEventListener('error', () => {
        this.setConnectionStatus('FAILED');
        this.disconnected();
      });

      this.ws.addEventListener('open', () => {
        this.setConnectionStatus('CONNECTED');
        this.resetBackoff();
      });

      this.ws.addEventListener('message', event => {
        this._messageEvents.emit(event);
      });
    }, timeout);
  }

  close() {
    this._isClosed = true;
    this.ws?.close();
  }

  private get socketReady(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  send(message: string) {
    if (!this.socketReady) {
      this.messages.push(message);
    } else {
      if (!this.ws) {
        throw new Error('An unknown error occurred');
      }
      this.ws?.send(message);
    }
  }

  async getNextMessage(): Promise<MessageEvent> {
    const message = getNext(this._messageEvents);
    return message;
  }

  get messageEvents(): Sub<MessageEvent> {
    return this._messageEvents;
  }

  get connectionStatusChangeEvents(): Sub<ConnectionStatus> {
    return this._connectionStatusChangeEvents;
  }

  get isClosed(): boolean {
    return this._isClosed;
  }

  get currentConnectionId(): number {
    return this._currentConnectionId;
  }

  get connectionStartTimestamp(): number | null {
    if (!this.connectionStartTime) {
      return null;
    }
    return this.connectionStartTime.getTime();
  }

  get connectionStatus(): ConnectionStatus {
    return this._connectionStatus;
  }
}

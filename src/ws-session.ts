import PubSub, { getNext, Sub } from './pub-sub';

const maxBackoffIncrement = 7;
const backoffTime = 120;

export default class WsSession {
  private ws: WebSocket | null = null;
  private _url: string;
  private _isClosed: boolean = false;
  private messages: string[] = [];
  private _messageEvents: PubSub<MessageEvent> = new PubSub();
  private _connectedEvents: PubSub<void> = new PubSub();
  private _disconnectionEvents: PubSub<void> = new PubSub();
  private _currentConnectionId: number = 0;
  private _connectionStatus:
    | 'PENDING'
    | 'CONNECTED'
    | 'DISCONNECTED'
    | 'FAILED'
    | 'CONNECTING' = 'PENDING';

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

  private connectionStartTime: Date | null = null;
  private connect() {
    this._connectionStatus = 'CONNECTING';

    this.connectionStartTime = new Date();

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
        this.disconnected();
      });

      this.ws.addEventListener('error', () => {
        this.disconnected();
      });

      this.ws.addEventListener('open', () => {
        this.resetBackoff();
        this._connectedEvents.emit();
      });

      this.ws.addEventListener('message', event => {
        this._messageEvents.emit(event);
      });
    }, Math.random() * backoffTime * 2 ** this.backoffIncrement);
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

  get connectionEvents(): Sub<void> {
    return this._connectedEvents;
  }

  get disconnectionEvents(): Sub<void> {
    return this._disconnectionEvents;
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
}

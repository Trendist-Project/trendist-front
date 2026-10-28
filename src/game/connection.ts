import { getToken, resumeSession } from '../api/client';
import { parseMinimap, parseSnapshot, type MinimapEntry, type ServerMessage, type Snapshot } from './protocol';

export interface ConnectionHandlers {
  onSnapshot(s: Snapshot): void;
  onMinimap(entries: MinimapEntry[]): void;
  onMessage(m: ServerMessage): void;
  onStatus(status: 'connecting' | 'open' | 'closed'): void;
}

/** 게임 WebSocket. 토큰은 주소에 넣지 않고 연결 직후 첫 메시지로 보낸다(9.3). 끊기면 다시 연결한다. */
export class GameConnection {
  private ws: WebSocket | null = null;
  private stopped = false;
  private retry = 0;

  constructor(private handlers: ConnectionHandlers) {}

  start() {
    this.stopped = false;
    this.open();
  }

  stop() {
    this.stopped = true;
    this.ws?.close();
  }

  send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private open() {
    this.handlers.onStatus('connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify({ type: 'auth', token: getToken() }));
      this.handlers.onStatus('open');
    };
    ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        const s = parseSnapshot(ev.data);
        if (s) { this.handlers.onSnapshot(s); return; }
        const mm = parseMinimap(ev.data);
        if (mm) this.handlers.onMinimap(mm);
      } else {
        try { this.handlers.onMessage(JSON.parse(ev.data)); } catch { /* 무시 */ }
      }
    };
    ws.onclose = async (ev) => {
      this.handlers.onStatus('closed');
      if (this.stopped) return;
      // 인증 실패면 토큰을 새로 받고 다시 연결한다
      if (ev.code === 1008) await resumeSession();
      const delay = Math.min(10000, 500 * 2 ** this.retry++);
      setTimeout(() => !this.stopped && this.open(), delay);
    };
  }
}

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

  /** spectate가 있으면 플레이어로 들어가는 대신 관전자로 들어간다(관리자만, 13.13). country는 방(나라) 코드 */
  constructor(private handlers: ConnectionHandlers, private spectate?: { country: string }) {}

  start() {
    this.stopped = false;
    this.open();
  }

  stop() {
    this.stopped = true;
    this.ws?.close();
  }

  /** 열려 있을 때만 보낸다. 보냈으면 true. */
  send(msg: object): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private open() {
    this.handlers.onStatus('connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify(this.spectate ? { type: 'spectate', token: getToken(), country: this.spectate.country } : { type: 'auth', token: getToken() }));
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
      if (this.stopped || ev.code === 4001) return; // 관리자가 내보낸 연결은 다시 붙지 않는다
      // 인증 실패면 토큰을 새로 받고 다시 연결한다
      if (ev.code === 1008) await resumeSession();
      const delay = Math.min(10000, 500 * 2 ** this.retry++);
      setTimeout(() => !this.stopped && this.open(), delay);
    };
  }
}

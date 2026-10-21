/**
 * Live chat stream — a minimal SSE client over fetch() + ReadableStream.
 *
 * Why not the browser's EventSource? It cannot send custom headers, so the
 * session token would have to go in the query string and end up in proxy logs,
 * history and server access logs. fetch() carries the Authorization header the
 * rest of the app already uses, and ReadableStream gives us a single place to
 * handle reconnects, backoff and abort.
 *
 * This is the "live" half of chat. The "offline/backgrounded" half is web push
 * (notificationScheduler + sw.js), which survives a hidden tab that SSE cannot.
 */

export type ChatEventType =
  | 'snapshot'
  | 'message'
  | 'edited'
  | 'deleted'
  | 'reaction'
  | 'read'
  | 'typing';

export interface ChatStreamEvent {
  type: ChatEventType;
  conversationId?: string;
  userId?: string;
  userName?: string;
  messageId?: string;
  isTyping?: boolean;
  payload?: Record<string, unknown>;
  message?: unknown;
  revision?: number;
}

export interface ChatStreamSnapshot {
  conversationId: string;
  messages: unknown[];
  revision?: number;
}

export interface ChatStreamHandle {
  close: () => void;
}

type ChatStreamMessage = {
  event: ChatEventType;
  data: string;
};

/** Decode one SSE block (terminated by a blank line) into {event, data}. */
function parseBlock(block: string): ChatStreamMessage | null {
  const lines = block.split(/\r?\n/);
  let event: ChatEventType = 'message';
  let data = '';
  for (const line of lines) {
    if (line.startsWith(':')) continue; // comment / heartbeat
    if (line.startsWith('event:')) event = line.slice(6).trim() as ChatEventType;
    else if (line.startsWith('data:')) data = (data ? data + '\n' : '') + line.slice(5).trim();
  }
  if (!data) return null;
  return { event, data };
}

export class ChatStream {
  private abortController: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private backoff = 1000;

  constructor(
    private conversationId: string,
    private token: string | null,
    private onEvent: (event: ChatStreamEvent) => void,
    private onError?: (err: Error) => void,
  ) {}

  connect(): ChatStreamHandle {
    this.closed = false;
    this.loop();
    return { close: () => this.close() };
  }

  private async loop() {
    while (!this.closed) {
      this.abortController = new AbortController();
      try {
        const res = await fetch(`/api/v1/conversations/${encodeURIComponent(this.conversationId)}/stream`, {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          },
          signal: this.abortController.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Stream failed: HTTP ${res.status}`);
        }

        this.backoff = 1000; // reset on a healthy connection
        await this.readLoop(res.body);
      } catch (err: any) {
        if (this.closed || err?.name === 'AbortError') return;
        this.onError?.(err);
        // Back off before reconnecting so a dead server does not spin the CPU.
        await new Promise((r) => setTimeout(r, this.backoff));
        this.backoff = Math.min(this.backoff * 2, 15000);
      }
    }
  }

  private async readLoop(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (!this.closed) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const parsed = parseBlock(block);
        if (!parsed) continue;
        if (parsed.event === 'message' && parsed.data === '') continue; // heartbeat
        let data: unknown = parsed.data;
        try {
          data = JSON.parse(parsed.data);
        } catch {
          /* keep raw string */
        }
        this.onEvent({ type: parsed.event, ...(data as object) } as ChatStreamEvent);
      }
    }
  }

  close() {
    this.closed = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.abortController?.abort();
  }
}
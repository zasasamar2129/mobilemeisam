/**
 * In-process pub/sub for live chat events.
 *
 * SSE streams (GET /conversations/:id/stream) subscribe here; the chat mutation
 * routes publish here after they write. It is deliberately in-process — this is a
 * single-node Express server, so no Redis/Socket.io is warranted. If the app ever
 * scales horizontally, swap the Map for a Redis pub/sub and the subscribe/publish
 * signatures stay identical.
 *
 * Events are typed and scoped: a subscriber only receives events for the
 * conversations it is watching, so a 100-user group chat does not fan out to
 * everyone.
 */

export type ChatEventType =
  | 'message'
  | 'edited'
  | 'deleted'
  | 'reaction'
  | 'read'
  | 'typing'
  | 'presence';

export interface ChatEvent {
  type: ChatEventType;
  conversationId: string;
  /** The user who caused the event; the receiver ignores events they authored. */
  userId: string;
  userName?: string;
  messageId?: string;
  payload: Record<string, unknown>;
  revision: number;
}

type Subscriber = (event: ChatEvent) => void;

class EventBus {
  private subscribers = new Map<string, Set<Subscriber>>();

  subscribe(conversationId: string, fn: Subscriber): () => void {
    let set = this.subscribers.get(conversationId);
    if (!set) {
      set = new Set();
      this.subscribers.set(conversationId, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
      if (set && set.size === 0) this.subscribers.delete(conversationId);
    };
  }

  publish(event: ChatEvent): void {
    const set = this.subscribers.get(event.conversationId);
    if (!set) return;
    // Copy before iterating: a subscriber may unsubscribe synchronously.
    set.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error('[EventBus] subscriber error:', err);
      }
    });
  }

  /** Total open streams, for health/debugging. */
  subscriberCount(conversationId?: string): number {
    if (conversationId) return this.subscribers.get(conversationId)?.size ?? 0;
    let n = 0;
    for (const set of this.subscribers.values()) n += set.size;
    return n;
  }
}

export const eventBus = new EventBus();
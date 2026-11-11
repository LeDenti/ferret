import { randomBytes } from "node:crypto";
import { InvoicePool } from "../engine/invoices.ts";
import {
  DEFAULT_POOL_POLICY,
  DEFAULT_MOOD_POLICY,
} from "../engine/types.ts";

interface Session {
  pool: InvoicePool;
  tick: number;
  lastSeen: number;
  events: number[];
  createdAt: number;
}

export class Registry {
  private sessions = new Map<string, Session>();
  private creationOrder: string[] = [];

  get(cookieId: string | undefined): { id: string; session: Session } {
    this.evict();

    if (cookieId && this.sessions.has(cookieId)) {
      const session = this.sessions.get(cookieId)!;
      session.lastSeen = Date.now();
      return { id: cookieId, session };
    }

    const id = randomBytes(12).toString("hex");
    const session: Session = {
      pool: new InvoicePool(DEFAULT_POOL_POLICY, DEFAULT_MOOD_POLICY),
      tick: 0,
      lastSeen: Date.now(),
      events: [],
      createdAt: Date.now(),
    };

    this.sessions.set(id, session);
    this.creationOrder.push(id);

    return { id, session };
  }

  checkRateLimit(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;

    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    session.events = session.events.filter((t) => t > oneMinuteAgo);

    if (session.events.length >= 120) {
      return false;
    }

    session.events.push(now);
    return true;
  }

  private evict() {
    const now = Date.now();
    const idleLimitMs = 2 * 60 * 60 * 1000;

    for (const id of this.creationOrder) {
      const session = this.sessions.get(id);
      if (session && now - session.lastSeen > idleLimitMs) {
        this.sessions.delete(id);
      }
    }

    this.creationOrder = this.creationOrder.filter((id) =>
      this.sessions.has(id)
    );

    while (this.sessions.size > 500) {
      const oldest = this.creationOrder.shift();
      if (oldest) {
        this.sessions.delete(oldest);
      }
    }
  }

  reset(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.pool = new InvoicePool(DEFAULT_POOL_POLICY, DEFAULT_MOOD_POLICY);
      session.tick = 0;
      session.lastSeen = Date.now();
    }
  }
}

import type { RelaySession, RelaySessionState } from "./types.js";

export class RelaySessionRegistry {
  private readonly sessions = new Map<string, RelaySession>();

  create(session: Omit<RelaySession, "state" | "createdAt">): RelaySession {
    const nextSession: RelaySession = {
      ...session,
      state: "pending",
      createdAt: Date.now(),
    };

    this.sessions.set(nextSession.sessionId, nextSession);
    return nextSession;
  }

  get(sessionId: string): RelaySession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  updateState(sessionId: string, state: RelaySessionState): RelaySession | null {
    const current = this.sessions.get(sessionId);
    if (!current) {
      return null;
    }

    const nextSession: RelaySession = {
      ...current,
      state,
      acceptedAt: state === "accepted" ? Date.now() : current.acceptedAt,
    };

    this.sessions.set(sessionId, nextSession);
    return nextSession;
  }

  removeForSocket(socketId: string): RelaySession[] {
    const removed: RelaySession[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.requesterSocketId === socketId || session.candidateSocketId === socketId) {
        this.sessions.delete(sessionId);
        removed.push(session);
      }
    }

    return removed;
  }

  expireOlderThan(maxAgeMs: number): RelaySession[] {
    const cutoff = Date.now() - maxAgeMs;
    const expired: RelaySession[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.state === "pending" && session.createdAt < cutoff) {
        const expiredSession: RelaySession = {
          ...session,
          state: "expired",
        };
        this.sessions.delete(sessionId);
        expired.push(expiredSession);
      }
    }

    return expired;
  }
}

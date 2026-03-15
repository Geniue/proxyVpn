export class RelaySessionRegistry {
    sessions = new Map();
    create(session) {
        const nextSession = {
            ...session,
            state: "pending",
            createdAt: Date.now(),
        };
        this.sessions.set(nextSession.sessionId, nextSession);
        return nextSession;
    }
    get(sessionId) {
        return this.sessions.get(sessionId) ?? null;
    }
    updateState(sessionId, state) {
        const current = this.sessions.get(sessionId);
        if (!current) {
            return null;
        }
        const nextSession = {
            ...current,
            state,
            acceptedAt: state === "accepted" ? Date.now() : current.acceptedAt,
        };
        this.sessions.set(sessionId, nextSession);
        return nextSession;
    }
    removeForSocket(socketId) {
        const removed = [];
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.requesterSocketId === socketId || session.candidateSocketId === socketId) {
                this.sessions.delete(sessionId);
                removed.push(session);
            }
        }
        return removed;
    }
    expireOlderThan(maxAgeMs) {
        const cutoff = Date.now() - maxAgeMs;
        const expired = [];
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.state === "pending" && session.createdAt < cutoff) {
                const expiredSession = {
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

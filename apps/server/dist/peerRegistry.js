export class PeerRegistry {
    peers = new Map();
    upsert(socketId, registration) {
        for (const [existingSocketId, existingPeer] of this.peers.entries()) {
            if (existingSocketId !== socketId && existingPeer.peerId === registration.peerId) {
                this.peers.delete(existingSocketId);
            }
        }
        const peer = {
            ...registration,
            socketId,
            lastSeen: Date.now(),
        };
        this.peers.set(socketId, peer);
        return peer;
    }
    remove(socketId) {
        const peer = this.peers.get(socketId) ?? null;
        this.peers.delete(socketId);
        return peer;
    }
    list() {
        return Array.from(this.peers.values()).sort((left, right) => right.lastSeen - left.lastSeen);
    }
    findCandidate(targetCountryCode, requesterPeerId) {
        return (this.list().find((peer) => peer.countryCode === targetCountryCode &&
            peer.peerId !== requesterPeerId) ?? null);
    }
    heartbeat(peerId, socketId) {
        const peer = this.peers.get(socketId);
        if (!peer || peer.peerId !== peerId) {
            return null;
        }
        const updatedPeer = {
            ...peer,
            lastSeen: Date.now(),
        };
        this.peers.set(socketId, updatedPeer);
        return updatedPeer;
    }
    pruneStale(maxAgeMs) {
        const cutoff = Date.now() - maxAgeMs;
        const removed = [];
        for (const [socketId, peer] of this.peers.entries()) {
            if (peer.lastSeen < cutoff) {
                this.peers.delete(socketId);
                removed.push(peer);
            }
        }
        return removed;
    }
}

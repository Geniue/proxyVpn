import type { ActivePeer, PeerRegistration } from "./types.js";

export class PeerRegistry {
  private readonly peers = new Map<string, ActivePeer>();

  upsert(socketId: string, registration: PeerRegistration): ActivePeer {
    for (const [existingSocketId, existingPeer] of this.peers.entries()) {
      if (existingSocketId !== socketId && existingPeer.peerId === registration.peerId) {
        this.peers.delete(existingSocketId);
      }
    }

    const peer: ActivePeer = {
      ...registration,
      socketId,
      lastSeen: Date.now(),
    };

    this.peers.set(socketId, peer);
    return peer;
  }

  remove(socketId: string): ActivePeer | null {
    const peer = this.peers.get(socketId) ?? null;
    this.peers.delete(socketId);
    return peer;
  }

  list(): ActivePeer[] {
    return Array.from(this.peers.values()).sort((left, right) => right.lastSeen - left.lastSeen);
  }

  findCandidate(targetCountryCode: string, requesterPeerId: string): ActivePeer | null {
    return (
      this.list().find(
        (peer) =>
          peer.countryCode === targetCountryCode &&
          peer.peerId !== requesterPeerId,
      ) ?? null
    );
  }

  heartbeat(peerId: string, socketId: string): ActivePeer | null {
    const peer = this.peers.get(socketId);

    if (!peer || peer.peerId !== peerId) {
      return null;
    }

    const updatedPeer: ActivePeer = {
      ...peer,
      lastSeen: Date.now(),
    };

    this.peers.set(socketId, updatedPeer);
    return updatedPeer;
  }

  pruneStale(maxAgeMs: number): ActivePeer[] {
    const cutoff = Date.now() - maxAgeMs;
    const removed: ActivePeer[] = [];

    for (const [socketId, peer] of this.peers.entries()) {
      if (peer.lastSeen < cutoff) {
        this.peers.delete(socketId);
        removed.push(peer);
      }
    }

    return removed;
  }
}

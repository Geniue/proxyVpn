import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { startDevProxyServer } from "./devProxyServer.js";
import { PeerRegistry } from "./peerRegistry.js";
import { RelaySessionRegistry } from "./relaySessions.js";
const PORT = Number(process.env.PORT ?? 4000);
const DEV_PROXY_PORT = Number(process.env.DEV_PROXY_PORT ?? 8899);
const PEER_STALE_AFTER_MS = 45_000;
const RELAY_SESSION_TIMEOUT_MS = 20_000;
const app = express();
const httpServer = createServer(app);
const registry = new PeerRegistry();
const relaySessions = new RelaySessionRegistry();
const devProxyServer = startDevProxyServer(DEV_PROXY_PORT);
app.use(cors());
app.use(express.json());
app.get("/health", (_request, response) => {
    response.json({ ok: true, peers: registry.list().length });
});
app.get("/peers", (_request, response) => {
    response.json({ peers: registry.list() });
});
const io = new Server(httpServer, {
    cors: {
        origin: true,
        credentials: false,
    },
});
async function resolvePublicGeo() {
    try {
        const response = await fetch("https://freeipapi.com/api/json");
        if (!response.ok) {
            throw new Error(`Geo lookup failed with status ${response.status}.`);
        }
        const payload = (await response.json());
        if (!payload.countryCode || !payload.ipAddress) {
            throw new Error("Geo lookup did not return a country code.");
        }
        return {
            countryCode: payload.countryCode,
            ip: payload.ipAddress,
            geoFallbackUsed: false,
        };
    }
    catch {
        return {
            countryCode: "US",
            ip: "0.0.0.0",
            geoFallbackUsed: true,
        };
    }
}
io.on("connection", (socket) => {
    socket.on("peer:register", async (registration, acknowledge) => {
        const resolvedGeo = registration.geoFallbackUsed || registration.ip === "0.0.0.0"
            ? await resolvePublicGeo()
            : {
                countryCode: registration.countryCode,
                ip: registration.ip,
                geoFallbackUsed: false,
            };
        const peer = registry.upsert(socket.id, {
            ...registration,
            countryCode: resolvedGeo.countryCode,
            ip: resolvedGeo.ip,
            geoFallbackUsed: resolvedGeo.geoFallbackUsed,
            transport: {
                mode: "dev-proxy",
                proxyHost: "127.0.0.1",
                proxyPort: DEV_PROXY_PORT,
            },
        });
        console.info(`[Peer Registered] peerId=${peer.peerId} country=${peer.countryCode} ip=${peer.ip} socket=${peer.socketId}`);
        acknowledge?.({
            ok: true,
            countryCode: peer.countryCode,
            ip: peer.ip,
            geoFallbackUsed: peer.geoFallbackUsed ?? false,
        });
    });
    socket.on("peer:matchmake", (request, acknowledge) => {
        const candidate = registry.findCandidate(request.targetCountryCode, request.requesterPeerId);
        if (!candidate) {
            acknowledge?.({
                ok: false,
                error: `No active relay peer is available in ${request.targetCountryCode}.`,
            });
            return;
        }
        const relaySession = relaySessions.create({
            sessionId: crypto.randomUUID(),
            requesterPeerId: request.requesterPeerId,
            requesterSocketId: socket.id,
            candidatePeerId: candidate.peerId,
            candidateSocketId: candidate.socketId,
            targetCountryCode: request.targetCountryCode,
        });
        console.info(`[Peer Match] requester=${request.requesterPeerId} targetCountry=${request.targetCountryCode} candidate=${candidate.peerId} socket=${candidate.socketId} session=${relaySession.sessionId}`);
        io.to(candidate.socketId).emit("relay:offer", {
            sessionId: relaySession.sessionId,
            requesterPeerId: request.requesterPeerId,
            targetCountryCode: request.targetCountryCode,
        });
        acknowledge?.({
            ok: true,
            relaySessionId: relaySession.sessionId,
            candidate: {
                peerId: candidate.peerId,
                countryCode: candidate.countryCode,
                ip: candidate.ip,
                socketId: candidate.socketId,
                lastSeen: candidate.lastSeen,
                transport: candidate.transport,
            },
        });
    });
    socket.on("relay:accept", (payload) => {
        const relaySession = relaySessions.get(payload.sessionId);
        if (!relaySession || relaySession.candidatePeerId !== payload.peerId || relaySession.candidateSocketId !== socket.id) {
            return;
        }
        const acceptedSession = relaySessions.updateState(payload.sessionId, "accepted");
        if (!acceptedSession) {
            return;
        }
        console.info(`[Relay Accepted] session=${acceptedSession.sessionId} candidate=${acceptedSession.candidatePeerId}`);
        io.to(acceptedSession.requesterSocketId).emit("relay:accepted", {
            sessionId: acceptedSession.sessionId,
            candidatePeerId: acceptedSession.candidatePeerId,
        });
    });
    socket.on("peer:heartbeat", (heartbeat) => {
        const peer = registry.heartbeat(heartbeat.peerId, socket.id);
        if (!peer) {
            return;
        }
        console.info(`[Peer Heartbeat] peerId=${peer.peerId} country=${peer.countryCode} socket=${peer.socketId}`);
    });
    socket.on("disconnect", (reason) => {
        const peer = registry.remove(socket.id);
        const removedSessions = relaySessions.removeForSocket(socket.id);
        if (!peer) {
            return;
        }
        console.info(`[Peer Disconnected] peerId=${peer.peerId} country=${peer.countryCode} reason=${reason}`);
        for (const session of removedSessions) {
            console.info(`[Relay Cleared] session=${session.sessionId} reason=peer-disconnected`);
        }
    });
});
setInterval(() => {
    const removedPeers = registry.pruneStale(PEER_STALE_AFTER_MS);
    for (const peer of removedPeers) {
        console.info(`[Peer Expired] peerId=${peer.peerId} country=${peer.countryCode} socket=${peer.socketId}`);
    }
}, 15_000);
setInterval(() => {
    const expiredSessions = relaySessions.expireOlderThan(RELAY_SESSION_TIMEOUT_MS);
    for (const session of expiredSessions) {
        console.info(`[Relay Expired] session=${session.sessionId} requester=${session.requesterPeerId} candidate=${session.candidatePeerId}`);
    }
}, 5_000);
httpServer.listen(PORT, () => {
    console.info(`Relay Mesh signaling server listening on http://localhost:${PORT}`);
});
process.on("SIGTERM", () => {
    devProxyServer.close();
    httpServer.close();
});

import { io, type Socket } from "socket.io-client";
import type {
  MatchCandidate,
  RelaySessionState,
  SignalingState,
  VPNEventMessage,
  VPNMessage,
  VPNResponse,
} from "../types/vpn";

declare const __RELAY_MESH_SIGNALING_URL__: string;

type PersistedSession = {
  countryCode: string | null;
  advertisedCountryCode: string | null;
  detectedIp: string | null;
  assignedPeerIp: string | null;
  latencyMs: number | null;
  status: VPNResponse["status"];
  routeMode: NonNullable<VPNResponse["routeMode"]>;
  signalingState: SignalingState;
  relaySessionId: string | null;
  relaySessionState: RelaySessionState;
  peerId: string;
  detectedCountryCode: string | null;
};

type PeerRegistrationAcknowledgement = {
  ok: boolean;
  countryCode: string;
  ip: string;
  geoFallbackUsed: boolean;
};

type MatchmakeAcknowledgement = {
  ok: boolean;
  relaySessionId?: string;
  candidate?: MatchCandidate;
  error?: string;
};

type RelayOfferPayload = {
  sessionId: string;
  requesterPeerId: string;
  targetCountryCode: string;
};

type RelayAcceptedPayload = {
  sessionId: string;
  candidatePeerId: string;
};

type EnsureRelayResponse = {
  ok: boolean;
  status?: "ready" | "provisioning";
  message?: string;
  error?: string;
};

const STORAGE_KEY = "relay-mesh-session";
const SIGNALING_SERVER_URL = __RELAY_MESH_SIGNALING_URL__ || "http://localhost:4000";
const HEARTBEAT_INTERVAL_MS = 15_000;
let signalingSocket: Socket | null = null;
let heartbeatIntervalId: number | null = null;
const pendingRelaySessions = new Map<string, { resolve: () => void; reject: (error: Error) => void; timeoutId: number }>();

function createDefaultSession(): PersistedSession {
  return {
    countryCode: null,
    advertisedCountryCode: null,
    detectedIp: null,
    assignedPeerIp: null,
    latencyMs: null,
    status: "idle",
    routeMode: "direct",
    signalingState: "connecting",
    relaySessionId: null,
    relaySessionState: "idle",
    peerId: crypto.randomUUID(),
    detectedCountryCode: null,
  };
}

function normalizeSession(storedValue: unknown): PersistedSession {
  const defaults = createDefaultSession();

  if (!storedValue || typeof storedValue !== "object") {
    return defaults;
  }

  const candidate = storedValue as Partial<PersistedSession>;

  return {
    countryCode: typeof candidate.countryCode === "string" ? candidate.countryCode : null,
    advertisedCountryCode: typeof candidate.advertisedCountryCode === "string" ? candidate.advertisedCountryCode : null,
    detectedIp: typeof candidate.detectedIp === "string" ? candidate.detectedIp : null,
    assignedPeerIp: typeof candidate.assignedPeerIp === "string" ? candidate.assignedPeerIp : null,
    latencyMs: typeof candidate.latencyMs === "number" ? candidate.latencyMs : null,
    status:
      candidate.status === "idle" ||
      candidate.status === "connecting" ||
      candidate.status === "connected" ||
      candidate.status === "disconnecting"
        ? candidate.status
        : defaults.status,
    routeMode:
      candidate.routeMode === "direct" || candidate.routeMode === "preview" || candidate.routeMode === "proxy"
        ? candidate.routeMode
        : defaults.routeMode,
    signalingState:
      candidate.signalingState === "connecting" ||
      candidate.signalingState === "connected" ||
      candidate.signalingState === "disconnected"
        ? candidate.signalingState
        : defaults.signalingState,
    relaySessionId: typeof candidate.relaySessionId === "string" ? candidate.relaySessionId : null,
    relaySessionState:
      candidate.relaySessionState === "idle" ||
      candidate.relaySessionState === "pending" ||
      candidate.relaySessionState === "accepted" ||
      candidate.relaySessionState === "expired"
        ? candidate.relaySessionState
        : defaults.relaySessionState,
    peerId: typeof candidate.peerId === "string" && candidate.peerId.length > 0 ? candidate.peerId : defaults.peerId,
    detectedCountryCode:
      typeof candidate.detectedCountryCode === "string" ? candidate.detectedCountryCode : null,
  };
}

async function saveSession(session: PersistedSession): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: session });
}

async function loadSession(): Promise<PersistedSession> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const normalized = normalizeSession(stored[STORAGE_KEY]);
  await saveSession(normalized);
  return normalized;
}

async function updateSession(update: Partial<PersistedSession>): Promise<PersistedSession> {
  const current = await loadSession();
  const next = { ...current, ...update };
  await saveSession(next);
  return next;
}

async function detectCountryByIp(): Promise<{ countryCode: string; ip: string; usedFallback: boolean }> {
  try {
    const response = await fetch("https://freeipapi.com/api/json");
    if (!response.ok) {
      throw new Error(`Geo lookup failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as {
      countryCode?: string;
      ipAddress?: string;
    };

    if (!payload.countryCode || !payload.ipAddress) {
      throw new Error("Geo lookup did not return a country code.");
    }

    return {
      countryCode: payload.countryCode,
      ip: payload.ipAddress,
      usedFallback: false,
    };
  } catch {
    return {
      countryCode: "US",
      ip: "0.0.0.0",
      usedFallback: true,
    };
  }
}

function notifyClients(message: VPNEventMessage): void {
  chrome.runtime.sendMessage(message, () => {
    void chrome.runtime.lastError;
  });
}

function buildSignalingEndpoint(path: string): string {
  return new URL(path, `${SIGNALING_SERVER_URL}/`).toString();
}

async function setSignalingState(signalingState: SignalingState, message?: string): Promise<void> {
  await updateSession({ signalingState });
  notifyClients({
    type: "vpn/event",
    event: "signaling/state",
    signalingState,
    message: message ?? `Signaling state changed to ${signalingState}.`,
  });
}

function stopHeartbeatLoop(): void {
  if (heartbeatIntervalId !== null) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
}

function startHeartbeatLoop(peerId: string): void {
  stopHeartbeatLoop();

  heartbeatIntervalId = self.setInterval(() => {
    if (!signalingSocket?.connected) {
      return;
    }

    signalingSocket.emit("peer:heartbeat", { peerId });
  }, HEARTBEAT_INTERVAL_MS);
}

async function ensureSignalingConnection(): Promise<void> {
  if (signalingSocket) {
    return;
  }

  const session = await updateSession({ signalingState: "connecting" });
  const geo = await detectCountryByIp();
  await updateSession({ detectedCountryCode: geo.countryCode, detectedIp: geo.ip, peerId: session.peerId });

  signalingSocket = io(SIGNALING_SERVER_URL, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1500,
  });

  signalingSocket.on("connect", async () => {
    const current = await loadSession();
    signalingSocket?.emit(
      "peer:register",
      {
        peerId: current.peerId,
        countryCode: current.advertisedCountryCode ?? current.detectedCountryCode ?? geo.countryCode,
        ip: geo.ip,
        userAgent: navigator.userAgent,
        geoFallbackUsed: geo.usedFallback,
      },
      async (acknowledgement: PeerRegistrationAcknowledgement) => {
        if (!acknowledgement.ok) {
          return;
        }

        await updateSession({ detectedCountryCode: acknowledgement.countryCode });

        if (acknowledgement.geoFallbackUsed) {
          notifyClients({
            type: "vpn/event",
            event: "geo/fallback",
            message: "IP-based country detection failed. Using a fallback region until the geo lookup succeeds.",
          });
        }
      },
    );
    startHeartbeatLoop(current.peerId);
    await setSignalingState("connected", "Backend socket connected.");
    notifyClients({
      type: "vpn/event",
      event: "signaling/connected",
      message: "Backend socket connected.",
    });
  });

  signalingSocket.on("disconnect", async () => {
    stopHeartbeatLoop();
    for (const pending of pendingRelaySessions.values()) {
      pending.reject(new Error("Backend socket disconnected. Relay matching is unavailable until the server reconnects."));
    }
    pendingRelaySessions.clear();
    await setSignalingState("disconnected", "Backend socket disconnected. Relay matching is unavailable until the server reconnects.");
    notifyClients({
      type: "vpn/event",
      event: "signaling/disconnected",
      message: "Backend socket disconnected. Relay matching is unavailable until the server reconnects.",
    });
  });

  signalingSocket.on("connect_error", async () => {
    stopHeartbeatLoop();
    await setSignalingState("disconnected", "Backend socket is unavailable. Retrying connection.");
  });

  signalingSocket.on("relay:offer", async (payload: RelayOfferPayload) => {
    const session = await loadSession();

    if (payload.requesterPeerId === session.peerId) {
      return;
    }

    signalingSocket?.emit("relay:accept", {
      sessionId: payload.sessionId,
      peerId: session.peerId,
    });
  });

  signalingSocket.on("relay:accepted", async (payload: RelayAcceptedPayload) => {
    const pending = pendingRelaySessions.get(payload.sessionId);
    if (!pending) {
      return;
    }

    await updateSession({ relaySessionId: payload.sessionId, relaySessionState: "accepted" });
    pending.resolve();
  });
}

async function handleAdvertisedCountryUpdate(countryCode: string): Promise<VPNResponse> {
  const session = await updateSession({ advertisedCountryCode: countryCode });

  if (signalingSocket?.connected) {
    signalingSocket.emit("peer:register", {
      peerId: session.peerId,
      countryCode,
      ip: session.detectedIp ?? "0.0.0.0",
      userAgent: navigator.userAgent,
      geoFallbackUsed: false,
    });
  }

  notifyClients({
    type: "vpn/event",
    event: "signaling/connected",
    message: `Peer advertised country updated to ${countryCode}.`,
    signalingState: session.signalingState,
  });

  return {
    ok: true,
    status: session.status,
    routeMode: session.routeMode,
    signalingState: session.signalingState,
    advertisedCountryCode: session.advertisedCountryCode ?? undefined,
    relaySessionId: session.relaySessionId ?? undefined,
    relaySessionState: session.relaySessionState,
    assignedPeerIp: session.assignedPeerIp ?? undefined,
    latencyMs: session.latencyMs ?? undefined,
  };
}

async function setProxy(host: string, port: number): Promise<void> {
  await chrome.proxy.settings.set({
    value: {
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: "http",
          host,
          port,
        },
        bypassList: ["<local>", "127.0.0.1"],
      },
    },
    scope: "regular",
  });
}

async function clearProxy(): Promise<void> {
  await chrome.proxy.settings.clear({ scope: "regular" });
}

function estimateLatencyForCandidate(candidate: MatchCandidate): number {
  const agePenalty = Math.min(Math.floor((Date.now() - candidate.lastSeen) / 1000), 60);
  return 35 + agePenalty;
}

function resolveTransportRoute(candidate: MatchCandidate): {
  routeMode: VPNResponse["routeMode"];
  proxy: VPNResponse["proxy"];
} {
  if (
    (candidate.transport?.mode === "dev-proxy" || candidate.transport?.mode === "peer-agent") &&
    candidate.transport.proxyHost &&
    candidate.transport.proxyPort
  ) {
    return {
      routeMode: "proxy",
      proxy: {
        host: candidate.transport.proxyHost,
        port: candidate.transport.proxyPort,
      },
    };
  }

  return {
    routeMode: "preview",
    proxy: {
      host: candidate.ip,
      port: 8080,
    },
  };
}

async function ensureRelayCapacity(countryCode: string): Promise<void> {
  const response = await fetch(buildSignalingEndpoint("relay/ensure"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      countryCode,
      waitMs: 30_000,
    }),
  });

  const payload = (await response.json()) as EnsureRelayResponse;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? `Failed to ensure relay capacity in ${countryCode}.`);
  }

  if (payload.status === "provisioning") {
    throw new Error(payload.message ?? `A managed ${countryCode} relay is starting. Try connecting again shortly.`);
  }
}

async function releaseRelayCapacity(countryCode: string | null, leaseId: string): Promise<void> {
  if (!countryCode) {
    return;
  }

  await fetch(buildSignalingEndpoint("relay/release"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      countryCode,
      leaseId,
    }),
  });
}

async function requestCandidatePeer(targetCountryCode: string): Promise<MatchCandidate> {
  const session = await loadSession();

  if (!signalingSocket?.connected) {
    throw new Error("Backend socket disconnected. Relay matching is unavailable until the server reconnects.");
  }

  return new Promise<MatchCandidate>((resolve, reject) => {
    signalingSocket?.emit(
      "peer:matchmake",
      {
        requesterPeerId: session.peerId,
        targetCountryCode,
      },
      async (acknowledgement: MatchmakeAcknowledgement) => {
        if (!acknowledgement.ok || !acknowledgement.candidate) {
          reject(new Error(acknowledgement.error ?? `No active relay peer is available in ${targetCountryCode}.`));
          return;
        }

        if (!acknowledgement.relaySessionId) {
          reject(new Error("The signaling backend did not return a relay session."));
          return;
        }

        const timeoutId = self.setTimeout(async () => {
          pendingRelaySessions.delete(acknowledgement.relaySessionId!);
          await updateSession({ relaySessionId: null, relaySessionState: "expired" });
          reject(new Error("Peer connection timed out."));
        }, 10_000);

        pendingRelaySessions.set(acknowledgement.relaySessionId, {
          resolve: () => {
            clearTimeout(timeoutId);
            pendingRelaySessions.delete(acknowledgement.relaySessionId!);
            resolve(acknowledgement.candidate!);
          },
          reject: (error) => {
            clearTimeout(timeoutId);
            pendingRelaySessions.delete(acknowledgement.relaySessionId!);
            reject(error);
          },
          timeoutId,
        });

        await updateSession({ relaySessionId: acknowledgement.relaySessionId, relaySessionState: "pending" });
      },
    );
  });
}

async function handleConnect(countryCode: string): Promise<VPNResponse> {
  try {
    await ensureRelayCapacity(countryCode);
    const candidate = await requestCandidatePeer(countryCode);
    const latencyMs = estimateLatencyForCandidate(candidate);
    const transportRoute = resolveTransportRoute(candidate);

    if (transportRoute.routeMode === "proxy" && transportRoute.proxy) {
      await setProxy(transportRoute.proxy.host, transportRoute.proxy.port);
    } else {
      await clearProxy();
    }

    const session = await loadSession();
    await saveSession({
      countryCode,
      advertisedCountryCode: session.advertisedCountryCode,
      detectedIp: session.detectedIp,
      assignedPeerIp: candidate.ip,
      latencyMs,
      status: "connected",
      routeMode: transportRoute.routeMode ?? "preview",
      signalingState: session.signalingState,
      relaySessionId: session.relaySessionId,
      relaySessionState: session.relaySessionState === "accepted" ? "accepted" : "pending",
      peerId: session.peerId,
      detectedCountryCode: session.detectedCountryCode,
    });

    return {
      ok: true,
      status: "connected",
      routeMode: transportRoute.routeMode,
      signalingState: session.signalingState,
      relaySessionId: session.relaySessionId ?? undefined,
      relaySessionState: session.relaySessionState,
      matchedPeer: candidate,
      proxy: transportRoute.proxy,
      assignedPeerIp: candidate.ip,
      latencyMs,
    };
  } catch (error) {
    return {
      ok: false,
      status: "idle",
      error: error instanceof Error ? error.message : "Extension permission denied while updating proxy settings.",
    };
  }
}

async function handleDisconnect(): Promise<VPNResponse> {
  try {
    const session = await loadSession();
    await clearProxy();
    await releaseRelayCapacity(session.countryCode, session.peerId).catch(() => undefined);
    await saveSession({
      countryCode: null,
      advertisedCountryCode: session.advertisedCountryCode,
      detectedIp: session.detectedIp,
      assignedPeerIp: null,
      latencyMs: null,
      status: "idle",
      routeMode: "direct",
      signalingState: session.signalingState,
      relaySessionId: null,
      relaySessionState: "idle",
      peerId: session.peerId,
      detectedCountryCode: session.detectedCountryCode,
    });

    return {
      ok: true,
      status: "idle",
      routeMode: "direct",
      signalingState: session.signalingState,
      relaySessionState: "idle",
    };
  } catch (error) {
    return {
      ok: false,
      status: "connected",
      error: error instanceof Error ? error.message : "Failed to release proxy route.",
    };
  }
}

async function handleStatus(): Promise<VPNResponse> {
  const session = await loadSession();

  return {
    ok: true,
    status: session.status,
    routeMode: session.routeMode,
    signalingState: session.signalingState,
    advertisedCountryCode: session.advertisedCountryCode ?? session.detectedCountryCode ?? undefined,
    relaySessionId: session.relaySessionId ?? undefined,
    relaySessionState: session.relaySessionState,
    assignedPeerIp: session.assignedPeerIp ?? undefined,
    latencyMs: session.latencyMs ?? undefined,
  };
}

chrome.runtime.onInstalled.addListener(() => {
  void clearProxy().finally(() => saveSession(createDefaultSession()));
  void ensureSignalingConnection();
});

chrome.runtime.onStartup.addListener(() => {
  void clearProxy();
  void ensureSignalingConnection();
});

void ensureSignalingConnection();

chrome.runtime.onMessage.addListener((message: VPNMessage, _sender, sendResponse) => {
  const handler = async () => {
    if (message.type === "vpn/connect") {
      return handleConnect(message.countryCode);
    }

    if (message.type === "vpn/disconnect") {
      return handleDisconnect();
    }

    if (message.type === "vpn/update-advertised-country") {
      return handleAdvertisedCountryUpdate(message.countryCode);
    }

    return handleStatus();
  };

  void handler().then(sendResponse);
  return true;
});

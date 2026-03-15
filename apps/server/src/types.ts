export type PeerRegistration = {
  peerId: string;
  countryCode: string;
  ip: string;
  userAgent?: string;
  geoFallbackUsed?: boolean;
  transport?: RelayTransport;
};

export type RelayTransport = {
  mode: "preview" | "dev-proxy" | "peer-agent";
  protocol?: "http-connect" | "socks5";
  proxyHost?: string;
  proxyPort?: number;
  controlHost?: string;
  controlPort?: number;
};

export type ActivePeer = PeerRegistration & {
  socketId: string;
  lastSeen: number;
};

export type PeerRegistrationAcknowledgement = {
  ok: boolean;
  countryCode: string;
  ip: string;
  geoFallbackUsed: boolean;
};

export type MatchmakeRequest = {
  requesterPeerId: string;
  targetCountryCode: string;
};

export type PeerHeartbeat = {
  peerId: string;
};

export type MatchCandidate = {
  peerId: string;
  countryCode: string;
  ip: string;
  socketId: string;
  lastSeen: number;
  transport?: RelayTransport;
};

export type MatchmakeAcknowledgement = {
  ok: boolean;
  candidate?: MatchCandidate;
  relaySessionId?: string;
  error?: string;
};

export type RelaySessionState = "pending" | "accepted" | "rejected" | "expired";

export type RelaySession = {
  sessionId: string;
  requesterPeerId: string;
  requesterSocketId: string;
  candidatePeerId: string;
  candidateSocketId: string;
  targetCountryCode: string;
  state: RelaySessionState;
  createdAt: number;
  acceptedAt?: number;
};

export type RelayOfferPayload = {
  sessionId: string;
  requesterPeerId: string;
  targetCountryCode: string;
};

export type RelayAcceptPayload = {
  sessionId: string;
  peerId: string;
};

export type RelayAcceptedPayload = {
  sessionId: string;
  candidatePeerId: string;
};

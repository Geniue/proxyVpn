export type RelayTransport = {
  mode: "peer-agent";
  protocol: "http-connect";
  proxyHost: string;
  proxyPort: number;
  controlHost: string;
  controlPort: number;
};

export type RelayAgentRegistration = {
  peerId: string;
  countryCode: string;
  ip: string;
  userAgent: string;
  geoFallbackUsed: boolean;
  transport: RelayTransport;
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

export type RelayAgentStatus = {
  peerId: string;
  countryCode: string;
  publicIp: string;
  signalingState: "connecting" | "connected" | "disconnected";
  proxyBindHost: string;
  proxyAdvertisedHost: string;
  proxyHost: string;
  proxyPort: number;
  controlBindHost: string;
  controlAdvertisedHost: string;
  controlHost: string;
  controlPort: number;
  startedAt: number;
};

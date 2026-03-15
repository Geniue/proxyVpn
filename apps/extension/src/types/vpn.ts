export type ConnectionState = "idle" | "connecting" | "connected" | "disconnecting";

export type CountryOption = {
  code: string;
  label: string;
  flag: string;
  region: string;
};

export type ProxyAssignment = {
  host: string;
  port: number;
};

export type RelayTransport = {
  mode: "preview" | "dev-proxy" | "peer-agent";
  protocol?: "http-connect" | "socks5";
  proxyHost?: string;
  proxyPort?: number;
  controlHost?: string;
  controlPort?: number;
};

export type MatchCandidate = {
  peerId: string;
  countryCode: string;
  ip: string;
  socketId: string;
  lastSeen: number;
  transport?: RelayTransport;
};

export type RouteMode = "direct" | "preview" | "proxy";
export type SignalingState = "connecting" | "connected" | "disconnected";
export type RelaySessionState = "idle" | "pending" | "accepted" | "expired";

export type ConnectRequest = {
  type: "vpn/connect";
  countryCode: string;
};

export type DisconnectRequest = {
  type: "vpn/disconnect";
};

export type StatusRequest = {
  type: "vpn/status";
};

export type UpdateAdvertisedCountryRequest = {
  type: "vpn/update-advertised-country";
  countryCode: string;
};

export type VPNMessage = ConnectRequest | DisconnectRequest | StatusRequest | UpdateAdvertisedCountryRequest;

export type VPNEventMessage = {
  type: "vpn/event";
  event: "signaling/disconnected" | "signaling/connected" | "signaling/state" | "geo/fallback";
  message: string;
  signalingState?: SignalingState;
};

export type VPNResponse = {
  ok: boolean;
  status: ConnectionState;
  routeMode?: RouteMode;
  signalingState?: SignalingState;
  advertisedCountryCode?: string;
  relaySessionId?: string;
  relaySessionState?: RelaySessionState;
  proxy?: ProxyAssignment;
  matchedPeer?: MatchCandidate;
  assignedPeerIp?: string;
  latencyMs?: number;
  error?: string;
};

export type VPNStoreState = {
  selectedCountry: CountryOption | null;
  advertisedCountry: CountryOption | null;
  connectionState: ConnectionState;
  routeMode: RouteMode;
  signalingState: SignalingState;
  assignedPeerIp: string | null;
  latencyMs: number | null;
  lastError: string | null;
  setSelectedCountry: (country: CountryOption | null) => void;
  setAdvertisedCountry: (country: CountryOption | null) => Promise<void>;
  hydrate: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

import { io, type Socket } from "socket.io-client";
import type { RelayAgentConfig } from "./config.js";
import type { RelayAgentRegistration, RelayAgentStatus } from "./types.js";

export class RelayAgentSignalingClient {
  private socket: Socket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: RelayAgentConfig,
    private readonly getStatus: () => RelayAgentStatus,
    private readonly onStateChange: (state: RelayAgentStatus["signalingState"]) => void,
  ) {}

  start() {
    if (this.socket) {
      return;
    }

    this.socket = io(this.config.signalingUrl, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
    });

    this.socket.on("connect", () => {
      this.onStateChange("connected");
      this.register();
      this.startHeartbeat();
    });

    this.socket.on("disconnect", () => {
      this.onStateChange("disconnected");
      this.stopHeartbeat();
    });

    this.socket.on("connect_error", () => {
      this.onStateChange("disconnected");
      this.stopHeartbeat();
    });
  }

  stop() {
    this.onStateChange("disconnected");
    this.stopHeartbeat();
    this.socket?.disconnect();
    this.socket = null;
  }

  private register() {
    if (!this.socket?.connected) {
      return;
    }

    const registration: RelayAgentRegistration = {
      peerId: this.config.peerId,
      countryCode: this.config.countryCode,
      ip: this.config.publicIp,
      userAgent: `relay-agent/${process.version}`,
      geoFallbackUsed: false,
      transport: {
        mode: "peer-agent",
        protocol: "http-connect",
        proxyHost: this.config.proxyAdvertisedHost,
        proxyPort: this.config.proxyPort,
        controlHost: this.config.controlAdvertisedHost,
        controlPort: this.config.controlPort,
      },
    };

    this.socket.emit("peer:register", registration);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket?.connected) {
        return;
      }

      this.socket.emit("peer:heartbeat", { peerId: this.config.peerId });
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

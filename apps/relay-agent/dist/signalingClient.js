import { io } from "socket.io-client";
export class RelayAgentSignalingClient {
    config;
    getStatus;
    onStateChange;
    socket = null;
    heartbeatTimer = null;
    constructor(config, getStatus, onStateChange) {
        this.config = config;
        this.getStatus = getStatus;
        this.onStateChange = onStateChange;
    }
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
        this.socket.on("relay:offer", (payload) => {
            if (!this.socket?.connected) {
                return;
            }
            const acceptPayload = {
                sessionId: payload.sessionId,
                peerId: this.config.peerId,
            };
            this.socket.emit("relay:accept", acceptPayload);
            console.info(`Relay agent accepted session ${payload.sessionId} for requester ${payload.requesterPeerId} targeting ${payload.targetCountryCode}`);
        });
    }
    stop() {
        this.onStateChange("disconnected");
        this.stopHeartbeat();
        this.socket?.disconnect();
        this.socket = null;
    }
    register() {
        if (!this.socket?.connected) {
            return;
        }
        const registration = {
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
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (!this.socket?.connected) {
                return;
            }
            this.socket.emit("peer:heartbeat", { peerId: this.config.peerId });
        }, this.config.heartbeatIntervalMs);
    }
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
}

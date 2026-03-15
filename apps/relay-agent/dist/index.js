import { loadConfig } from "./config.js";
import { startControlServer } from "./controlServer.js";
import { startLocalProxyServer } from "./localProxy.js";
import { RelayAgentSignalingClient } from "./signalingClient.js";
async function main() {
    const config = await loadConfig();
    const startedAt = Date.now();
    let signalingState = "connecting";
    const getStatus = () => ({
        peerId: config.peerId,
        countryCode: config.countryCode,
        publicIp: config.publicIp,
        signalingState,
        proxyBindHost: config.proxyBindHost,
        proxyAdvertisedHost: config.proxyAdvertisedHost,
        proxyHost: config.proxyAdvertisedHost,
        proxyPort: config.proxyPort,
        controlBindHost: config.controlBindHost,
        controlAdvertisedHost: config.controlAdvertisedHost,
        controlHost: config.controlAdvertisedHost,
        controlPort: config.controlPort,
        startedAt,
    });
    const proxyServer = startLocalProxyServer(config.proxyPort, config.proxyBindHost);
    const controlServer = startControlServer(config.controlBindHost, config.controlPort, getStatus);
    const signalingClient = new RelayAgentSignalingClient(config, getStatus, (nextState) => {
        signalingState = nextState;
    });
    signalingClient.start();
    const shutdown = () => {
        signalingClient.stop();
        controlServer.close();
        proxyServer.close();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    console.info(`Relay agent booted for ${config.countryCode} on peer ${config.peerId} with advertised proxy ${config.proxyAdvertisedHost}:${config.proxyPort}`);
}
void main();

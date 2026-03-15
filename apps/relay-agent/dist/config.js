import os from "node:os";
async function resolveAwsPublicIp() {
    try {
        const tokenResponse = await fetch("http://169.254.169.254/latest/api/token", {
            method: "PUT",
            headers: {
                "X-aws-ec2-metadata-token-ttl-seconds": "21600",
            },
        });
        if (!tokenResponse.ok) {
            return null;
        }
        const token = await tokenResponse.text();
        const ipResponse = await fetch("http://169.254.169.254/latest/meta-data/public-ipv4", {
            headers: {
                "X-aws-ec2-metadata-token": token,
            },
        });
        if (!ipResponse.ok) {
            return null;
        }
        const publicIp = (await ipResponse.text()).trim();
        return publicIp || null;
    }
    catch {
        return null;
    }
}
async function resolvePublicIp() {
    if (process.env.RELAY_AGENT_PUBLIC_IP) {
        return process.env.RELAY_AGENT_PUBLIC_IP;
    }
    const awsPublicIp = await resolveAwsPublicIp();
    if (awsPublicIp) {
        return awsPublicIp;
    }
    try {
        const response = await fetch("https://checkip.amazonaws.com");
        if (!response.ok) {
            throw new Error("Public IP lookup failed.");
        }
        const publicIp = (await response.text()).trim();
        return publicIp || "127.0.0.1";
    }
    catch {
        return "127.0.0.1";
    }
}
export async function loadConfig() {
    const publicIp = await resolvePublicIp();
    const proxyBindHost = process.env.RELAY_AGENT_PROXY_BIND_HOST ?? "127.0.0.1";
    const controlBindHost = process.env.RELAY_AGENT_CONTROL_BIND_HOST ?? "127.0.0.1";
    return {
        peerId: process.env.RELAY_AGENT_PEER_ID ?? `${os.hostname()}-${crypto.randomUUID()}`,
        countryCode: process.env.RELAY_AGENT_COUNTRY ?? "EG",
        publicIp,
        signalingUrl: process.env.RELAY_AGENT_SIGNALING_URL ?? "http://localhost:4000",
        proxyBindHost,
        proxyAdvertisedHost: process.env.RELAY_AGENT_PROXY_PUBLIC_HOST ?? process.env.RELAY_AGENT_ADVERTISED_HOST ?? publicIp,
        proxyPort: Number(process.env.RELAY_AGENT_PROXY_PORT ?? 1080),
        controlBindHost,
        controlAdvertisedHost: process.env.RELAY_AGENT_CONTROL_PUBLIC_HOST ?? process.env.RELAY_AGENT_ADVERTISED_HOST ?? publicIp,
        controlPort: Number(process.env.RELAY_AGENT_CONTROL_PORT ?? 9900),
        heartbeatIntervalMs: Number(process.env.RELAY_AGENT_HEARTBEAT_MS ?? 15000),
    };
}

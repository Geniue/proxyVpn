import { getCountryByCode } from "./countries";
import type { VPNEventMessage, VPNMessage, VPNResponse } from "../types/vpn";

const MOCK_PROXY_BY_COUNTRY: Record<string, { host: string; port: number; latencyMs: number }> = {
  US: { host: "198.51.100.24", port: 8080, latencyMs: 46 },
  DE: { host: "198.51.100.41", port: 8080, latencyMs: 79 },
  SG: { host: "198.51.100.56", port: 8080, latencyMs: 132 },
  JP: { host: "198.51.100.73", port: 8080, latencyMs: 141 },
  BR: { host: "198.51.100.88", port: 8080, latencyMs: 162 },
  IN: { host: "198.51.100.97", port: 8080, latencyMs: 178 },
};

function isExtensionRuntimeAvailable(): boolean {
  return typeof chrome !== "undefined" && typeof chrome.runtime?.sendMessage === "function";
}

async function sendMockResponse(message: VPNMessage): Promise<VPNResponse> {
  if (message.type === "vpn/status") {
    return {
      ok: true,
      status: "idle",
      signalingState: "disconnected",
      routeMode: "direct",
    };
  }

  if (message.type === "vpn/disconnect") {
    return {
      ok: true,
      status: "idle",
      signalingState: "disconnected",
      routeMode: "direct",
    };
  }

  const country = getCountryByCode(message.countryCode);
  const proxy = MOCK_PROXY_BY_COUNTRY[message.countryCode];

  if (!country || !proxy) {
    return {
      ok: false,
      status: "idle",
      signalingState: "disconnected",
      routeMode: "direct",
      error: "Selected relay region is unavailable.",
    };
  }

  await new Promise((resolve) => setTimeout(resolve, 450));

  return {
    ok: true,
    status: "connected",
    signalingState: "connected",
    routeMode: "preview",
    proxy: {
      host: proxy.host,
      port: proxy.port,
    },
    assignedPeerIp: proxy.host,
    latencyMs: proxy.latencyMs,
  };
}

export async function sendVPNMessage(message: VPNMessage): Promise<VPNResponse> {
  if (!isExtensionRuntimeAvailable()) {
    return sendMockResponse(message);
  }

  return new Promise<VPNResponse>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: VPNResponse | undefined) => {
      const runtimeError = chrome.runtime.lastError;

      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      if (!response) {
        reject(new Error("The VPN controller did not return a response."));
        return;
      }

      resolve(response);
    });
  });
}

export function addVPNEventListener(listener: (message: VPNEventMessage) => void): () => void {
  if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
    return () => undefined;
  }

  const wrapped = (message: unknown) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      (message as { type?: string }).type === "vpn/event"
    ) {
      listener(message as VPNEventMessage);
    }
  };

  chrome.runtime.onMessage.addListener(wrapped);

  return () => {
    chrome.runtime.onMessage.removeListener(wrapped);
  };
}

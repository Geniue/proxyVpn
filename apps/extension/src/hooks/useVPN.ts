import { create } from "zustand";
import { toast } from "sonner";
import { getCountryByCode } from "../lib/countries";
import { sendVPNMessage } from "../lib/chrome";
import type { SignalingState, VPNStoreState } from "../types/vpn";

export const useVPN = create<VPNStoreState>((set, get) => ({
  selectedCountry: null,
  advertisedCountry: null,
  connectionState: "idle",
  routeMode: "direct",
  signalingState: "connecting",
  assignedPeerIp: null,
  latencyMs: null,
  lastError: null,
  setSelectedCountry: (country) => {
    set({ selectedCountry: country, lastError: null });
  },
  setAdvertisedCountry: async (country) => {
    if (!country) {
      return;
    }

    try {
      const response = await sendVPNMessage({ type: "vpn/update-advertised-country", countryCode: country.code });
      if (!response.ok) {
        throw new Error(response.error ?? "Failed to update advertised relay country.");
      }

      set({ advertisedCountry: country });
      toast.success(`This peer now advertises ${country.label} for relay matching.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update advertised relay country.";
      toast.error(message);
    }
  },
  hydrate: async () => {
    try {
      const response = await sendVPNMessage({ type: "vpn/status" });

      if (!response.ok) {
        throw new Error(response.error ?? "Unable to load VPN state.");
      }

      set({
        advertisedCountry: getCountryByCode(response.advertisedCountryCode) ?? null,
        connectionState: response.status,
        routeMode: response.routeMode ?? "direct",
        signalingState: response.signalingState ?? "disconnected",
        assignedPeerIp: response.assignedPeerIp ?? null,
        latencyMs: response.latencyMs ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to restore VPN state.";
      set({ connectionState: "idle", lastError: message });
      toast.error(message);
    }
  },
  connect: async () => {
    const { selectedCountry } = get();

    if (!selectedCountry) {
      const message = "Select a country before connecting.";
      set({ lastError: message });
      toast.error(message);
      return;
    }

    set({ connectionState: "connecting", lastError: null });

    try {
      const response = await sendVPNMessage({ type: "vpn/connect", countryCode: selectedCountry.code });

      if (!response.ok || !response.matchedPeer) {
        throw new Error(response.error ?? `No active relay peer is available in ${selectedCountry.label}.`);
      }

      set({
        connectionState: response.status,
        routeMode: response.routeMode ?? "preview",
        signalingState: response.signalingState ?? get().signalingState,
        assignedPeerIp: response.assignedPeerIp ?? response.matchedPeer.ip,
        latencyMs: response.latencyMs ?? null,
      });

      const restoredCountry = getCountryByCode(selectedCountry.code);
      if (restoredCountry) {
        set({ selectedCountry: restoredCountry });
      }

      if ((response.routeMode ?? "preview") === "proxy") {
        toast.success(`Connected through ${selectedCountry.label}. Browser traffic is now routed through the matched relay node.`);
      } else if ((response.routeMode ?? "preview") === "preview") {
        toast.success(`Matched a live relay peer in ${selectedCountry.label}. Browsing remains direct until proxy routing is enabled.`);
      } else {
        toast.success(`Connected through ${selectedCountry.label}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Peer connection timed out.";
      set({
        connectionState: "idle",
        routeMode: "direct",
        signalingState: get().signalingState,
        assignedPeerIp: null,
        latencyMs: null,
        lastError: message,
      });
      toast.error(message);
    }
  },
  disconnect: async () => {
    set({ connectionState: "disconnecting", lastError: null });

    try {
      const response = await sendVPNMessage({ type: "vpn/disconnect" });

      if (!response.ok) {
        throw new Error(response.error ?? "Failed to release proxy route.");
      }

      set({
        connectionState: "idle",
        routeMode: response.routeMode ?? "direct",
        signalingState: response.signalingState ?? get().signalingState,
        assignedPeerIp: null,
        latencyMs: null,
      });
      toast.success("Relay route disconnected.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to release proxy route.";
      set({ connectionState: "connected", lastError: message });
      toast.error(message);
    }
  },
}));

export function updateVPNStoreFromSignaling(signalingState: SignalingState) {
  useVPN.setState({ signalingState });
}

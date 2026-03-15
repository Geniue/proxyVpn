import { useEffect } from "react";
import { Orbit, ShieldEllipsis } from "lucide-react";
import { Toaster } from "sonner";
import { toast } from "sonner";
import { CountrySelector } from "./components/CountrySelector";
import { ConnectionButton } from "./components/ConnectionButton";
import { StatusIndicator } from "./components/StatusIndicator";
import { updateVPNStoreFromSignaling, useVPN } from "./hooks/useVPN";
import { addVPNEventListener } from "./lib/chrome";

export default function App() {
  const {
    selectedCountry,
    advertisedCountry,
    connectionState,
    routeMode,
    signalingState,
    assignedPeerIp,
    latencyMs,
    setSelectedCountry,
    setAdvertisedCountry,
    connect,
    disconnect,
    hydrate,
  } = useVPN();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    return addVPNEventListener((message) => {
      if (message.event === "signaling/state" && message.signalingState) {
        updateVPNStoreFromSignaling(message.signalingState);
        return;
      }

      if (message.event === "geo/fallback") {
        toast.error(message.message);
        return;
      }

      if (message.event === "signaling/disconnected") {
        if (message.signalingState) {
          updateVPNStoreFromSignaling(message.signalingState);
        }
        toast.error(message.message);
        return;
      }

      if (message.signalingState) {
        updateVPNStoreFromSignaling(message.signalingState);
      }
      toast.success(message.message);
    });
  }, []);

  return (
    <main className="min-h-screen bg-aurora p-4 text-foreground">
      <div className="mx-auto flex min-h-[30rem] w-full max-w-sm flex-col rounded-[1.8rem] border border-white/70 bg-card p-5 shadow-panel backdrop-blur-xl">
        <header className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-slate-500">Relay Mesh</p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-slate-900">Peer-powered private routing.</h1>
          </div>
          <div className="rounded-2xl bg-white/80 p-3 shadow-sm">
            <ShieldEllipsis className="h-5 w-5 text-cyan-700" />
          </div>
        </header>

        <section className="mt-5 rounded-[1.4rem] border border-cyan-100 bg-cyan-950 px-4 py-4 text-cyan-50 shadow-lg shadow-cyan-950/10">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-cyan-200">
            <Orbit className="h-4 w-4" /> Overlay posture
          </div>
          <p className="mt-3 text-sm leading-6 text-cyan-50/90">
            Select a country pool, negotiate a relay path, and let the background worker own proxy updates.
          </p>
        </section>

        <div className="mt-5 space-y-4">
          <CountrySelector value={selectedCountry} onChange={setSelectedCountry} />
          <CountrySelector
            value={advertisedCountry}
            onChange={(country) => {
              if (country) {
                void setAdvertisedCountry(country);
              }
            }}
            label="Advertise As"
            helperText="Choose the relay country this peer provides"
            placeholder="Choose this peer's country"
          />
          <ConnectionButton
            connectionState={connectionState}
            onConnect={connect}
            onDisconnect={disconnect}
          />
          <StatusIndicator
            connectionState={connectionState}
            routeMode={routeMode}
            signalingState={signalingState}
            assignedPeerIp={assignedPeerIp}
            latencyMs={latencyMs}
          />
        </div>
      </div>
      <Toaster position="bottom-center" richColors closeButton />
    </main>
  );
}

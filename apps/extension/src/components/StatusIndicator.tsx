import { Activity, Globe2, ShieldCheck, Wifi } from "lucide-react";
import type { ConnectionState, RouteMode, SignalingState } from "../types/vpn";

type StatusIndicatorProps = {
  connectionState: ConnectionState;
  routeMode: RouteMode;
  signalingState: SignalingState;
  assignedPeerIp: string | null;
  latencyMs: number | null;
};

const STATE_COPY: Record<ConnectionState, { label: string; tone: string }> = {
  idle: { label: "Standby", tone: "bg-slate-200 text-slate-700" },
  connecting: { label: "Negotiating Relay", tone: "bg-amber-100 text-amber-800" },
  connected: { label: "Connected", tone: "bg-emerald-100 text-emerald-800" },
  disconnecting: { label: "Releasing Route", tone: "bg-rose-100 text-rose-700" },
};

const ROUTE_COPY: Record<RouteMode, string> = {
  direct: "Traffic is using your normal direct connection.",
  preview: "Preview mode is active. A live relay peer has been selected, but no browser-wide proxy is applied yet.",
  proxy: "Traffic is routing through the matched relay node for the selected country pool.",
};

const SIGNALING_TONE: Record<SignalingState, string> = {
  connected: "bg-emerald-100 text-emerald-800",
  connecting: "bg-amber-100 text-amber-800",
  disconnected: "bg-rose-100 text-rose-700",
};

export function StatusIndicator({ connectionState, routeMode, signalingState, assignedPeerIp, latencyMs }: StatusIndicatorProps) {
  const status = STATE_COPY[connectionState];
  const effectiveLabel = connectionState === "connected" && routeMode === "preview"
    ? "Preview"
    : connectionState === "connected" && routeMode === "proxy"
      ? "Protected"
      : status.label;
  const effectiveTone = connectionState === "connected" && routeMode === "preview"
    ? "bg-cyan-100 text-cyan-800"
    : connectionState === "connected" && routeMode === "proxy"
      ? "bg-emerald-100 text-emerald-800"
      : status.tone;

  return (
    <section className="rounded-[1.4rem] border border-white/80 bg-white/70 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">Tunnel Status</p>
          <h2 className="mt-2 font-display text-lg font-semibold text-slate-900">{effectiveLabel}</h2>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${effectiveTone}`}>{effectiveLabel}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
        <div className="rounded-2xl bg-slate-50/90 p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5" /> Peer IP
          </div>
          <p className="mt-2 font-medium text-slate-900">{assignedPeerIp ?? "Awaiting assignment"}</p>
        </div>
        <div className="rounded-2xl bg-slate-50/90 p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
            <Activity className="h-3.5 w-3.5" /> Latency
          </div>
          <p className="mt-2 font-medium text-slate-900">{latencyMs ? `${latencyMs} ms` : "Pending"}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <Globe2 className="h-3.5 w-3.5" /> {ROUTE_COPY[routeMode]}
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${SIGNALING_TONE[signalingState]}`}>
          <Wifi className="h-3 w-3" /> {signalingState}
        </span>
      </div>
    </section>
  );
}

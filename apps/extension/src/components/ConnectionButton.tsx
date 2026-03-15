import { LoaderCircle, Power } from "lucide-react";
import { Button } from "./ui/button";
import type { ConnectionState } from "../types/vpn";

type ConnectionButtonProps = {
  connectionState: ConnectionState;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
};

export function ConnectionButton({ connectionState, onConnect, onDisconnect }: ConnectionButtonProps) {
  const isBusy = connectionState === "connecting" || connectionState === "disconnecting";
  const isConnected = connectionState === "connected";

  return (
    <Button
      className="w-full gap-2 rounded-[1.2rem] text-base"
      variant={isConnected ? "destructive" : "primary"}
      onClick={isConnected ? onDisconnect : onConnect}
      disabled={isBusy}
    >
      {isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
      {connectionState === "connecting" && "Connecting..."}
      {connectionState === "disconnecting" && "Disconnecting..."}
      {connectionState === "connected" && "Disconnect"}
      {connectionState === "idle" && "Connect"}
    </Button>
  );
}

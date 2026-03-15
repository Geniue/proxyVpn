# System Architecture

## UI Architecture (React/Tailwind)
- **State Management:** Zustand (lightweight for extension popups).
- **Proxy Controller:** A background service worker that listens to UI changes and updates `chrome.proxy` settings.
- **Components:**
    - `CountrySelector`: Dropdown with flags.
    - `ConnectionButton`: Toggle state (Connect/Disconnect).
    - `StatusIndicator`: Shows real-time latency and assigned Peer IP.
    - `NotificationProvider`: Global Snackbar/Toast system for errors.

## Control Plane Architecture (Node.js/Socket.io)
- **Signaling Server:** Maintains a registry of active peers and managed exit nodes using WebSockets.
- **Peer Directory:** Stores active relay registrations with transport metadata, country, and last heartbeat.
- **Matchmaking Engine:** When a user selects "US", the engine finds an active relay in that country and creates a relay session.

## Data Plane Architecture (Managed Relay Nodes)
- **Requester Path:** The extension remains the control plane and sets browser proxy state only after a relay path is negotiated.
- **Relay Agent:** Each exit node runs the relay-agent process and exposes an HTTP CONNECT proxy plus a small control API.
- **Managed Production Proxies:** Production launch will use AWS EC2 `t3.micro` instances as managed relay nodes in target countries instead of relying on random end-user peers.
- **Hybrid Model:** The relay/requestor design remains intact. The main change is that some relays are operator-managed EC2 nodes, which improves availability and launch reliability.
- **Transport Advertisement:** Relay agents must advertise public EC2 endpoints, not loopback bind addresses.

## AWS Production Notes
- **Instance Class:** Use `t3.micro` for the first production launch to minimize cost while validating throughput and concurrency.
- **Regional Layout:** Deploy one relay-agent node per launch country/region and register each node with the signaling server.
- **Security Model:** Open only the required proxy and control ports, restrict SSH access, and keep signaling on TLS-enabled infrastructure.
- **Scaling Path:** Add more `t3.micro` nodes per country behind the same signaling backend before moving to larger instance classes.
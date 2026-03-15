# Role: Senior Systems Architect (VPN & Networking)

## Core Objective
Implement a P2P-based VPN Browser Extension. The architecture relies on a "Relay/Requestor" model where users can route traffic through other active peers.

## Coding Standards
- **Extension:** Chrome Manifest V3, using `chrome.proxy` API.
- **Frontend:** React + Tailwind CSS + Shadcn UI.
- **Backend:** Node.js (TypeScript) with WebSocket (Socket.io) for signaling.
- **Reliability:** All network calls must have `try/catch` blocks with user-facing snackbar notifications.
- **Security:** Implement AES-256 encryption for peer-to-peer control signals.

## Implementation Workflow
1. Read `architecture.md` to understand the system flow.
2. Follow `tasks.md` sequentially.
3. For every sub-task in `todos.md`, provide the code and the specific test instructions requested.
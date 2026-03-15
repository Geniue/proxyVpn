# Project Phases

## Phase 1: Extension Skeleton & UI
Build the Manifest V3 structure and the React popup interface.

## Phase 2: Signaling Backend
Setup the Express/Socket.io server to track online peers and their locations.

## Phase 3: Managed Relay Transport
Implement the `chrome.proxy` configuration, relay session negotiation, and relay-agent transport for managed exits.

## Phase 4: AWS Production Launch
Deploy relay-agent nodes on AWS `t3.micro` instances, advertise their public endpoints, and validate country-specific routing.

## Phase 5: Error Handling & UX Refinement
Integrate snackbars for "Peer Unavailable," "Connection Timed Out," and "Auth Failed."
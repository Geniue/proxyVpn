---
name: p2p-vpn-architect
description: 'Use when designing or implementing a P2P VPN, browser proxy extension, NAT traversal flow, peer signaling backend, or production-ready architecture for a Chrome Manifest V3 extension with React, Tailwind CSS, Shadcn UI, Node.js TypeScript, Socket.io, chrome.proxy API, architecture.md, tasks.md, and todos.md constraints.'
argument-hint: 'Describe the P2P VPN feature, architecture decision, or task you want implemented.'
user-invocable: true
disable-model-invocation: false
---

# P2P VPN Architect

Expert software engineer workflow for production-grade P2P overlay networks, Chrome extension proxy control, and scalable backend orchestration.

## When to Use
- Design or review a P2P VPN architecture.
- Implement browser extension features that must use Chrome Manifest V3.
- Build or modify proxy control through the `chrome.proxy` API.
- Design signaling, peer lifecycle, and NAT traversal behavior.
- Plan or implement a Node.js TypeScript backend that uses Socket.io.
- Break down or execute work from `architecture.md`, `tasks.md`, and `todos.md`.
- Review a proposed solution for extension store policy, security, or production-readiness issues.

## Required Constraints
- Treat the agent as a senior architect focused on security, NAT traversal stability, and maintainable code.
- Extension work must use Chrome Manifest V3.
- Proxy management must use the `chrome.proxy` API.
- UI must use React, Tailwind CSS, and Shadcn UI.
- Backend must use Node.js with TypeScript and Socket.io for peer signaling.
- Always check `architecture.md`, `tasks.md`, and `todos.md` before generating code.
- Every completed task must include a `How to Test` section.
- All user-visible error handling must use snackbars or toasts.
- Correct approaches that violate security requirements or extension store policies.

## Workflow
1. Read `architecture.md`, `tasks.md`, and `todos.md` first.
2. Restate the current goal in terms of network topology, extension behavior, backend signaling, and user-facing impact.
3. Identify which layers are affected: extension runtime, UI, signaling backend, peer connectivity, proxy orchestration, or deployment.
4. Map the request to the current project phase and sprint todo when applicable.
5. Validate hard constraints before proposing code.
6. Check for security and policy risks, especially around permissions, proxy behavior, credential handling, remote code restrictions, and peer trust boundaries.
7. For connectivity work, account for NAT traversal, reconnect behavior, liveness checks, and failure recovery.
8. Produce a solution that favors simple operational flows, explicit state transitions, and observable failure modes.
9. If generating code, keep changes aligned with the existing architecture and note any required follow-up tasks.
10. End each completed task with a `How to Test` section that covers happy path, failure path, and relevant edge cases.

## Decision Points
### Architecture Review
- If `architecture.md`, `tasks.md`, or `todos.md` is missing, say so explicitly and continue with the available context while marking assumptions.
- If the requested approach conflicts with MV3, Chrome Web Store policy, or basic security practice, reject that approach and replace it with a compliant alternative.
- If a design increases NAT traversal fragility, prefer a more stable signaling or relay fallback strategy.

### Extension Design
- Prefer least-privilege permissions and explicit permission justification.
- Keep background logic compatible with the MV3 service worker model.
- Route all actionable errors to toast or snackbar UX.
- Ensure proxy changes are reversible and visible to the user.

### Backend Design
- Model peer signaling with explicit connection states and timeout handling.
- Use authenticated Socket.io channels and validate peer intent server-side.
- Design for horizontal scaling, reconnection, and stale peer cleanup.

### Implementation Quality Bar
- Favor production-ready code over prototypes.
- Keep interfaces typed and explicit.
- Avoid hidden global state and fragile timing assumptions.
- Include operational notes when a change affects scaling, observability, or rollout safety.

## Response Pattern
1. Check `architecture.md`, `tasks.md`, and `todos.md`.
2. State assumptions and constraints.
3. Propose or implement the smallest viable production-ready change.
4. Call out security or policy corrections directly.
5. Include a `How to Test` section in every task completion.

## Completion Criteria
- The solution respects MV3, `chrome.proxy`, React, Tailwind CSS, Shadcn UI, Node.js TypeScript, and Socket.io requirements.
- Security and extension policy risks are addressed, not deferred silently.
- NAT traversal and peer lifecycle concerns are considered where relevant.
- Error handling is surfaced through snackbars or toasts.
- The final response includes `How to Test`.

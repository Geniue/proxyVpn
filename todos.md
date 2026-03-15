# Sprint 1: UI & Proxy Foundation

### Todo 1.1: Initialize Manifest V3 & Popup
- Create `manifest.json` with `proxy`, `storage`, and `notifications` permissions.
- Build a simple React popup with a "Connect" button and Country Dropdown.
- **How to Test:** Load the unpacked extension in Chrome. Click the icon. Ensure the UI renders without console errors.

### Todo 1.2: Implement Connection Toggle Logic
- Create a `useVPN` hook to manage `isConnected` state.
- Button should turn Red ("Disconnect") when active and Blue/Green ("Connect") when idle.
- **How to Test:** Click the button. Verify the UI state changes and the label updates instantly.

### Todo 1.3: Integration of Snackbar Errors
- Setup a Toast provider (e.g., Sonner or React-Hot-Toast).
- Trigger a dummy error snackbar if the country is not selected before clicking "Connect".
- **How to Test:** Leave country empty, click "Connect". Verify a snackbar appears at the bottom with a clear error message.

# Sprint 2: Networking

### Todo 2.1: Signaling Client
- Connect the extension background script to the Backend via WebSockets.
- On connection, send the user's current country (detected via IP) to the server.
- **How to Test:** Open Backend logs. Verify a new "Peer Registered" log appears when the extension is enabled.

### Todo 2.2: Dynamic Proxy Routing
- Use `chrome.proxy.settings.set` to route traffic through a dummy proxy IP when "Connect" is clicked.
- **How to Test:** Check `chrome://net-internals/#proxy` in a new tab. Verify the proxy settings match the IP assigned by your code.

# Sprint 3: AWS Managed Relay Nodes

### Todo 3.1: Relay-Agent Public Endpoint Advertisement
- Separate local bind hosts from public advertised hosts in the relay-agent configuration.
- Support AWS EC2 public IP discovery so a `t3.micro` node registers reachable transport metadata.
- **How to Test:** Start the relay-agent with AWS-style env vars and verify `/status` shows public advertised hosts while the process still binds locally.

### Todo 3.2: AWS t3.micro Deployment Baseline
- Document required ports, environment variables, and startup commands for deploying one relay-agent per country on AWS.
- Define the minimum security group rules for signaling, proxy, and control traffic.
- **How to Test:** Launch a `t3.micro`, start the relay-agent, and confirm it appears in `/peers` with `mode: "peer-agent"` and a non-loopback proxy host.
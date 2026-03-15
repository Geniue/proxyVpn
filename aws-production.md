# AWS t3.micro Production Launch

## Summary
- Production relay nodes will run on AWS EC2 `t3.micro` instances.
- The extension remains the browser control plane.
- The signaling server remains the session and matchmaking control plane.
- Each AWS relay node runs `apps/relay-agent` and advertises a public proxy endpoint.

## Target Topology
- **Signaling backend:** one Node.js service reachable over HTTPS/WSS.
- **Relay nodes:** one `t3.micro` per launch country.
- **Requester browser:** the extension selects a country, requests a match, and then routes traffic through the matched relay transport.

## Multi-Country Rollout
- The current code can already match and route to multiple countries.
- To make a country selectable in practice, you must run at least one live relay-agent node in that country.
- One Sweden node can only provide Sweden egress. It cannot honestly appear as UAE, Germany, Singapore, or the US.
- The extension should only be expected to work for countries that currently have a live relay in `/peers`.

Recommended first production set:
- `SE`: `eu-north-1` Stockholm
- `DE`: `eu-central-1` Frankfurt
- `AE`: `me-central-1` UAE
- `SG`: `ap-southeast-1` Singapore
- `US`: `us-east-1` or `us-west-2`

Important AWS constraint:
- AWS does not currently offer a Turkey region, so `TR` cannot be a true Turkey exit on AWS alone. For Turkey you need a non-AWS VPS/provider physically located in Turkey.

## Relay-Agent Environment
Use these environment variables on each EC2 instance:

```powershell
RELAY_AGENT_COUNTRY=AE
RELAY_AGENT_SIGNALING_URL=https://your-signaling-domain
RELAY_AGENT_PROXY_BIND_HOST=0.0.0.0
RELAY_AGENT_PROXY_PORT=1080
RELAY_AGENT_CONTROL_BIND_HOST=127.0.0.1
RELAY_AGENT_CONTROL_PORT=9900
RELAY_AGENT_PUBLIC_IP=<ec2-public-ip-or-elastic-ip>
RELAY_AGENT_PROXY_PUBLIC_HOST=<ec2-public-ip-or-dns>
RELAY_AGENT_CONTROL_PUBLIC_HOST=<optional-public-control-host>
```

If `RELAY_AGENT_PUBLIC_IP` is omitted, the relay-agent now tries AWS instance metadata first and then `checkip.amazonaws.com`.

## Extension Build Configuration
The extension background worker now supports a build-time signaling URL.

Use this when building the unpacked extension that will connect to production signaling:

```powershell
$env:RELAY_MESH_SIGNALING_URL='http://<signaling-public-ip-or-domain>:4000'
npm run build:extension
```

That embeds the public signaling URL into the extension background bundle instead of `http://localhost:4000`.

## Minimum AWS Security Group Rules
- Allow inbound TCP `1080` from requester-side relay traffic sources.
- Allow inbound TCP `22` only from admin IP ranges.
- Keep control API `9900` private unless a later control-plane feature explicitly requires remote access.
- Allow outbound HTTPS so the node can reach signaling and public IP discovery.

## Deployment Steps
1. Launch an Ubuntu or Amazon Linux `t3.micro` in the target AWS region.
2. Assign an Elastic IP if you want a stable advertised endpoint.
3. Install Node.js LTS.
4. Copy the built relay-agent files or deploy from the repo.
5. Start the agent with the environment variables above.
6. Confirm the node appears in `/peers` with `transport.mode: "peer-agent"` and a non-loopback `proxyHost`.
7. Build the extension with `RELAY_MESH_SIGNALING_URL` pointing at the public signaling server.

For repeatable setup on a new EC2 instance, use [deploy/bootstrap-ubuntu-relay.sh](deploy/bootstrap-ubuntu-relay.sh).

## Current Limitation
The repo now supports correct EC2 endpoint advertisement and the extension can route through `peer-agent` transports. The remaining production hardening work is around TLS, authentication, and operational controls rather than basic relay routing.
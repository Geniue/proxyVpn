import { createServer, type Server as HttpServer } from "node:http";
import type { RelayAgentStatus } from "./types.js";

export function startControlServer(host: string, port: number, getStatus: () => RelayAgentStatus): HttpServer {
  const server = createServer((request, response) => {
    if (!request.url) {
      response.writeHead(404).end();
      return;
    }

    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.url === "/status") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(getStatus()));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(port, host, () => {
    console.info(`Relay agent control API listening on http://${host}:${port}`);
  });

  return server;
}

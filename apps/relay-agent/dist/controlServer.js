import { createServer } from "node:http";
export function startControlServer(host, port, getStatus) {
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

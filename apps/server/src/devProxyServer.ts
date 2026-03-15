import { createServer, request as httpRequest, type IncomingMessage, type RequestOptions, type ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";
import net from "node:net";

function sanitizeHeaders(headers: IncomingMessage["headers"], host: string) {
  const nextHeaders = { ...headers };
  delete nextHeaders.connection;
  delete nextHeaders["proxy-connection"];

  return {
    ...nextHeaders,
    host,
  };
}

function writeProxyError(response: ServerResponse, message: string) {
  response.writeHead(502, { "content-type": "text/plain" });
  response.end(message);
}

export function startDevProxyServer(port: number, host = "127.0.0.1") {
  const server = createServer((clientRequest, clientResponse) => {
    if (!clientRequest.url) {
      writeProxyError(clientResponse, "Missing target URL.");
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(clientRequest.url);
    } catch {
      writeProxyError(clientResponse, "Invalid target URL.");
      return;
    }

    const isHttps = targetUrl.protocol === "https:";
    const upstreamRequest = (isHttps ? httpsRequest : httpRequest)(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isHttps ? 443 : 80),
        method: clientRequest.method,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        headers: sanitizeHeaders(clientRequest.headers, targetUrl.host),
      } satisfies RequestOptions,
      (upstreamResponse) => {
        clientResponse.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(clientResponse);
      },
    );

    upstreamRequest.on("error", (error) => {
      writeProxyError(clientResponse, `Upstream request failed: ${error.message}`);
    });

    clientRequest.pipe(upstreamRequest);
  });

  server.on("connect", (request, clientSocket, head) => {
    const [targetHost, targetPort] = (request.url ?? "").split(":");
    const upstreamSocket = net.connect(Number(targetPort || 443), targetHost, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) {
        upstreamSocket.write(head);
      }
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);
    });

    upstreamSocket.on("error", () => {
      clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      clientSocket.destroy();
    });

    clientSocket.on("error", () => {
      upstreamSocket.destroy();
    });
  });

  server.listen(port, host, () => {
    console.info(`Relay Mesh dev proxy listening on http://${host}:${port}`);
  });

  return server;
}

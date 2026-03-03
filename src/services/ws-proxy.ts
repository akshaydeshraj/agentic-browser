import { WebSocket, WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import type { BrowserManager } from "./browser-manager.js";

export class WsProxy {
  private wss: WebSocketServer;

  constructor(
    private browserManager: BrowserManager,
    private apiToken: string,
  ) {
    this.wss = new WebSocketServer({ noServer: true });
  }

  handleUpgrade(
    req: IncomingMessage,
    socket: import("net").Socket,
    head: Buffer,
  ): void {
    // Parse session ID from URL: /cdp/:sessionId
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    const match = url.pathname.match(/^\/cdp\/([^/]+)$/);

    if (!match) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    // Auth: check token from query param or Authorization header
    const token =
      url.searchParams.get("token") ??
      req.headers.authorization?.replace("Bearer ", "");

    if (token !== this.apiToken) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const sessionId = match[1];
    const internalUrl = this.browserManager.getInternalCdpUrl(sessionId);

    if (!internalUrl) {
      socket.write("HTTP/1.1 404 Session Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    // Upgrade and proxy
    this.wss.handleUpgrade(req, socket, head, (agentWs) => {
      this.proxyToChrome(agentWs, internalUrl);
    });
  }

  private proxyToChrome(agentWs: WebSocket, internalUrl: string): void {
    const chromeWs = new WebSocket(internalUrl);

    chromeWs.on("open", () => {
      // Proxy agent → Chrome
      agentWs.on("message", (data, isBinary) => {
        if (chromeWs.readyState === WebSocket.OPEN) {
          chromeWs.send(data, { binary: isBinary });
        }
      });

      // Proxy Chrome → agent
      chromeWs.on("message", (data, isBinary) => {
        if (agentWs.readyState === WebSocket.OPEN) {
          agentWs.send(data, { binary: isBinary });
        }
      });
    });

    // Clean up on close from either side
    agentWs.on("close", () => {
      if (chromeWs.readyState === WebSocket.OPEN) chromeWs.close();
    });

    chromeWs.on("close", () => {
      if (agentWs.readyState === WebSocket.OPEN) agentWs.close();
    });

    agentWs.on("error", () => {
      if (chromeWs.readyState === WebSocket.OPEN) chromeWs.close();
    });

    chromeWs.on("error", () => {
      if (agentWs.readyState === WebSocket.OPEN) agentWs.close();
    });
  }
}

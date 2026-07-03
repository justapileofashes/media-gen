import { chromium, type Page } from "playwright";

export interface PageOptions {
  width: number;
  height: number;
  timeoutMs: number;
}

export async function withPage<T>(opts: PageOptions, fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({
    headless: true,
    // Block WebRTC UDP egress — route()/routeWebSocket() cannot intercept RTCPeerConnection traffic.
    args: ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp", "--disable-features=WebRtcHideLocalIpsWithMdns"]
  });
  try {
    const context = await browser.newContext({
      viewport: { width: opts.width, height: opts.height },
      serviceWorkers: "block"
    });
    // Containment: rendered code must never reach the network.
    await context.route("**/*", (route) => route.abort());
    // route() does not intercept WebSocket handshakes — close them explicitly.
    await context.routeWebSocket("**/*", (ws) => ws.close());
    const page = await context.newPage();
    page.setDefaultTimeout(opts.timeoutMs);
    return await fn(page);
  } finally {
    await browser.close();
  }
}

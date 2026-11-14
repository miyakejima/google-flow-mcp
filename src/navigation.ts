type Navigable = Pick<import("playwright").Page, "goto" | "waitForLoadState">;

// Google redirects the legacy labs.google/fx/tools/flow URL to flow.google.com
// (and sign-in pages redirect onward), which Playwright reports as the goto
// being "interrupted by another navigation". That is the expected destination,
// so wait for it to load instead of failing.
export async function gotoPage(page: Navigable, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (!/interrupted by another navigation/i.test(String((error as Error)?.message))) throw error;
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  }
}

// Gallery tiles load Flow media as sized thumbnails (e.g. ".../asb/<id>=s512-rw",
// a 512px WebP). The "=d" suffix serves the full-resolution original (verified:
// 1024x1024 JPEG for a 1:1 Nano Banana image), so downloads must request it.
export function originalMediaUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.hostname !== "flow.google.com" || !url.pathname.startsWith("/asb/")) return rawUrl;
    const [, id = ""] = url.pathname.match(/^\/asb\/([^=]+)/) ?? [];
    if (!id) return rawUrl;
    url.pathname = `/asb/${id}=d`;
    return url.href;
  } catch {
    return rawUrl;
  }
}

export function isFlowPageUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && (url.hostname === "flow.google.com"
      || (url.hostname === "labs.google" && /^\/fx\/(?:[^/]+\/)?tools\/flow(?:\/|$)/i.test(url.pathname)));
  } catch {
    return false;
  }
}

export function canonicalFlowProjectUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const match = url.pathname.match(/^(.*\/(?:tools\/flow\/)?project\/[^/]+)\/edit\/[^/]+\/?$/i);
    if (!match) return rawUrl;
    url.pathname = match[1]!;
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return rawUrl;
  }
}

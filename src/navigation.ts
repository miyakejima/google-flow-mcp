type Navigable = Pick<import("playwright").Page, "goto" | "waitForLoadState" | "waitForURL">;

// Google redirects the legacy labs.google/fx/tools/flow URL to flow.google.com
// (and sign-in pages redirect onward), which Playwright reports as the goto
// being "interrupted by another navigation". That is the expected destination,
// so wait for it to load instead of failing.
export async function gotoPage(page: Navigable, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (!/interrupted by another navigation/i.test(String((error as Error)?.message))) throw error;
    // Wait for the redirect target itself to commit (not the document being left), then load.
    await page.waitForURL((current) => current.href !== url, { waitUntil: "domcontentloaded", timeout: 30_000 })
      .catch(() => page.waitForLoadState("domcontentloaded").catch(() => undefined));
  }
}

// URLs to try, best first, when downloading a tracked Flow asset. For flow.google.com/asb/
// thumbnails (verified live): images "=d" is the full-resolution original; videos "=m22" is
// the 720p H.264+AAC MP4 and "=m18" the 360p one. The tracked URL is always the last resort.
export function mediaDownloadCandidates(rawUrl: string, mediaType: "image" | "video"): string[] {
  const asb = asbBase(rawUrl);
  if (!asb) return [rawUrl];
  const variants = mediaType === "image" ? ["=d"] : ["=m22", "=m18"];
  return [...new Set([...variants.map((suffix) => asb + suffix), rawUrl])];
}

function asbBase(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.hostname !== "flow.google.com") return undefined;
    const id = url.pathname.match(/^\/asb\/([^=]+)/)?.[1];
    return id ? `${url.origin}/asb/${id}` : undefined;
  } catch {
    return undefined;
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

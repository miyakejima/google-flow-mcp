export function canonicalFlowProjectUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const match = url.pathname.match(/^(.*(?:\/tools\/flow|\/flow)?\/project\/[^/]+)\/edit\/[^/]+\/?$/i);
    if (!match) return rawUrl;
    url.pathname = match[1]!;
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return rawUrl;
  }
}

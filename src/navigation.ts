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

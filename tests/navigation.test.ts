import assert from "node:assert/strict";
import test from "node:test";
import { canonicalFlowProjectUrl, gotoPage, isFlowPageUrl, originalMediaUrl } from "../src/navigation.js";

function fakePage(gotoError?: Error) {
  const calls: string[] = [];
  return {
    calls,
    goto: async (url: string) => {
      calls.push(`goto ${url}`);
      if (gotoError) throw gotoError;
      return null;
    },
    waitForLoadState: async () => { calls.push("waitForLoadState"); },
  } as unknown as Parameters<typeof gotoPage>[0] & { calls: string[] };
}

test("a redirect from the legacy Flow URL is followed, not treated as a failure", async () => {
  const page = fakePage(new Error('page.goto: Navigation to "https://labs.google/fx/tools/flow" is interrupted by another navigation to "https://flow.google.com/"'));
  await gotoPage(page, "https://labs.google/fx/tools/flow");
  assert.deepEqual(page.calls, ["goto https://labs.google/fx/tools/flow", "waitForLoadState"]);
});

test("other navigation failures still propagate", async () => {
  const page = fakePage(new Error("page.goto: net::ERR_NAME_NOT_RESOLVED"));
  await assert.rejects(gotoPage(page, "https://flow.google.com/"), /ERR_NAME_NOT_RESOLVED/);
});

test("a normal navigation does not wait twice", async () => {
  const page = fakePage();
  await gotoPage(page, "https://flow.google.com/");
  assert.deepEqual(page.calls, ["goto https://flow.google.com/"]);
});

test("Flow navigation recognizes current and legacy origins without accepting lookalike hosts", () => {
  for (const url of ["https://flow.google.com/?pli=1", "https://flow.google.com/project/test", "https://labs.google/fx/tools/flow", "https://labs.google/fx/es/tools/flow/project/test"]) {
    assert.equal(isFlowPageUrl(url), true, url);
  }
  for (const url of ["https://flow.google.com.evil.example/", "https://labs.google/fx/tools/whisk", "https://accounts.google.com/", "http://flow.google.com/", "not a URL"]) {
    assert.equal(isFlowPageUrl(url), false, url);
  }
});

test("asset editor URLs return to their language-preserving project workspace", () => {
  assert.equal(
    canonicalFlowProjectUrl("https://flow.google.com/project/project-1/edit/asset-2?view=full#clip"),
    "https://flow.google.com/project/project-1",
  );
  assert.equal(
    canonicalFlowProjectUrl("https://labs.google/fx/es/tools/flow/project/project-1/edit/asset-2?view=full#clip"),
    "https://labs.google/fx/es/tools/flow/project/project-1",
  );
  assert.equal(
    canonicalFlowProjectUrl("https://labs.google/fx/tools/flow/project/project-1"),
    "https://labs.google/fx/tools/flow/project/project-1",
  );
});

test("Flow media downloads request the full-resolution original, not the gallery thumbnail", () => {
  assert.equal(
    originalMediaUrl("https://flow.google.com/asb/ANqvLObHCQ_abc-123=s512-rw"),
    "https://flow.google.com/asb/ANqvLObHCQ_abc-123=d",
  );
  assert.equal(originalMediaUrl("https://flow.google.com/asb/ANqvLObHCQ"), "https://flow.google.com/asb/ANqvLObHCQ=d");
  for (const untouched of [
    "blob:https://flow.google.com/1234",
    "https://lh3.googleusercontent.com/some/legacy=s512",
    "https://flow.google.com.evil.example/asb/x=s512",
    "not a url",
  ]) {
    assert.equal(originalMediaUrl(untouched), untouched);
  }
});

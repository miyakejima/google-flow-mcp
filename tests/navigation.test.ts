import assert from "node:assert/strict";
import test from "node:test";
import { canonicalFlowProjectUrl, isFlowPageUrl } from "../src/navigation.js";

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

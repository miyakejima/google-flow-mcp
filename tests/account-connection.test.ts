import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import type { Page } from "playwright";
import { BrowserManager } from "../src/browser-manager.js";
import { CookieBridge } from "../src/cookie-bridge.js";
import { FlowAdapter, classifyPageAccess } from "../src/flow-adapter.js";
import { FlowStore } from "../src/store.js";

async function connectionFixture(context: TestContext, workspaceAt: number, signedIn = true) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "flow-mcp-connection-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const store = new FlowStore(temporary);
  const browsers = new BrowserManager(store);
  const bridge = new CookieBridge();
  const adapter = new FlowAdapter(store, browsers, bridge);
  let elapsed = 0;
  let currentUrl = "about:blank";
  let resets = 0;
  const screenshots: string[] = [];
  context.mock.method(Date, "now", () => elapsed);
  const page = {
    goto: async (url: string) => {
      currentUrl = url.includes("AccountChooser")
        ? "https://myaccount.google.com/"
        : "https://flow.google.com/?pli=1";
    },
    url: () => currentUrl,
    waitForTimeout: async (ms: number) => { elapsed += ms; },
    screenshot: async ({ path: file }: { path: string }) => {
      assert.equal(resets, 1, "capture diagnostics before closing the login browser");
      screenshots.push(file);
    },
  } as unknown as Page;
  context.mock.method(bridge, "waitForSession", async () => ({ profile: "Chromium", cookies: [] }));
  context.mock.method(browsers, "runExclusive", async (_id: string, operation: () => Promise<unknown>) => operation());
  context.mock.method(browsers, "reset", async () => { resets += 1; });
  context.mock.method(browsers, "importCookies", async () => page);
  // Exercise the real connection loop and store; replace only external UI observations/actions.
  const ui = adapter as unknown as {
    pageAccessState: () => Promise<ReturnType<typeof classifyPageAccess>>;
    openProject: () => Promise<void>;
    ensureAgentAutoApprove: () => Promise<void>;
  };
  context.mock.method(ui, "pageAccessState", async () => classifyPageAccess(signedIn, elapsed >= workspaceAt));
  context.mock.method(ui, "openProject", async () => {});
  context.mock.method(ui, "ensureAgentAutoApprove", async () => {});
  return { adapter, store, screenshots, elapsed: () => elapsed, resets: () => resets };
}

test("account connection accepts a workspace loading more than five seconds after login", async (context) => {
  const fixture = await connectionFixture(context, 10_000);
  const result = await fixture.adapter.connectAccount("slow", undefined, {
    chooseGoogleAccount: true, waitForAccountSelectionSeconds: 20,
  });
  assert.match(result, /Connected Google Flow/);
  assert.equal(fixture.elapsed(), 10_000);
  assert.equal((await fixture.store.listAccounts()).defaultAccountId, "slow");
  assert.equal(fixture.resets(), 2);
  assert.equal(fixture.screenshots.length, 0);
});

for (const signedIn of [true, false]) {
  test(`connection timeout keeps diagnostics and stays unverified (signedIn=${signedIn})`, async (context) => {
    const fixture = await connectionFixture(context, Infinity, signedIn);
    await assert.rejects(fixture.adapter.connectAccount("unavailable", undefined, {
      chooseGoogleAccount: true, waitForAccountSelectionSeconds: 12,
    }), (error: Error) => {
      assert.match(error.message, /https:\/\/flow.google.com\/\?pli=1/);
      assert.match(error.message, /Screenshot:/);
      return true;
    });
    assert.equal(fixture.elapsed(), 12_000);
    assert.equal(fixture.screenshots.length, 1);
    assert.equal(fixture.resets(), 2);
    assert.equal((await fixture.store.listAccounts()).defaultAccountId, undefined);
  });
}

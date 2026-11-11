import assert from "node:assert/strict";
import test from "node:test";
import { classifyPageAccess, FlowAdapter } from "../src/flow-adapter.js";
import type { Page } from "playwright";

test("a signed-in public landing page is not classified as a Flow workspace", () => {
  assert.deepEqual(classifyPageAccess(true, false), {
    signedIn: true,
    workspaceAvailable: false,
    pageKind: "landing_or_unavailable",
  });
});

test("workspace evidence takes precedence over weak sign-in detection", () => {
  assert.deepEqual(classifyPageAccess(false, true), {
    signedIn: true,
    workspaceAvailable: true,
    pageKind: "workspace",
  });
});

for (const label of ["New project", "新项目", "Nuevo proyecto"]) {
  test(`workspace recognizes a visible ${label} button without legacy links or icons`, async () => {
    const empty = { count: async () => 0, filter() { return this; } };
    const visible = { count: async () => 1, nth() { return this; }, isVisible: async () => true };
    const page = {
      url: () => "https://flow.google.com/",
      locator: () => empty,
      getByRole: (role: string, options: { name: RegExp }) =>
        role === "button" && options.name.test(label) ? visible : empty,
    } as unknown as Page;
    const adapter = new FlowAdapter(undefined!, undefined!, undefined!);
    const ui = adapter as unknown as { hasWorkspace: (page: Page) => Promise<boolean> };
    assert.equal(await ui.hasWorkspace(page), true);
  });
}

test("hidden new-project buttons do not establish workspace access", async () => {
  const empty = { count: async () => 0, filter() { return this; } };
  const hidden = { count: async () => 1, nth() { return this; }, isVisible: async () => false };
  const page = {
    url: () => "https://flow.google.com/",
    locator: () => empty,
    getByRole: () => hidden,
  } as unknown as Page;
  const adapter = new FlowAdapter(undefined!, undefined!, undefined!);
  const ui = adapter as unknown as { hasWorkspace: (page: Page) => Promise<boolean> };
  assert.equal(await ui.hasWorkspace(page), false);
});

test("a lookalike origin cannot establish workspace access", async () => {
  const page = { url: () => "https://flow.google.com.evil.example/project/test" } as Page;
  const adapter = new FlowAdapter(undefined!, undefined!, undefined!);
  const ui = adapter as unknown as { hasWorkspace: (page: Page) => Promise<boolean> };
  assert.equal(await ui.hasWorkspace(page), false);
});

test("a current-origin project URL establishes workspace access without legacy controls", async () => {
  const page = { url: () => "https://flow.google.com/project/test-project" } as Page;
  const adapter = new FlowAdapter(undefined!, undefined!, undefined!);
  const ui = adapter as unknown as { hasWorkspace: (page: Page) => Promise<boolean> };
  assert.equal(await ui.hasWorkspace(page), true);
});

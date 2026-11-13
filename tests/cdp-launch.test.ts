import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { waitForCdp } from "../src/browser-manager.js";

async function cdpEndpoint(context: test.TestContext): Promise<string> {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test("a clean launcher exit is a relaunch handoff, not a failure", async (context) => {
  // Windows Chrome launched elevated relaunches itself de-elevated and the
  // original process exits 0 while the relaunched browser serves CDP.
  await waitForCdp(await cdpEndpoint(context), { exitCode: 0 }, 3_000);
});

test("a crashing launcher still fails fast", async (context) => {
  await assert.rejects(
    waitForCdp(await cdpEndpoint(context), { exitCode: 1 }, 3_000),
    /exit code 1/,
  );
});

test("a handoff with no browser behind it times out", async () => {
  await assert.rejects(
    waitForCdp("http://127.0.0.1:1", { exitCode: 0 }, 1_000),
    /did not expose CDP/,
  );
});

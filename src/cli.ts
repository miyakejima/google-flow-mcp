#!/usr/bin/env node
import path from "node:path";
import { BrowserManager, findBrowserExecutable } from "./browser-manager.js";
import { CookieBridge } from "./cookie-bridge.js";
import { errorText } from "./errors.js";
import { FlowAdapter } from "./flow-adapter.js";
import { FlowStore } from "./store.js";
import type { GenerationRequest } from "./types.js";

function usage(): never {
  console.error(`Usage:
  flow-mcp-cli account list
  flow-mcp-cli account connect <account-id> [label] [--cdp http://127.0.0.1:9222] [--wait 600]
  flow-mcp-cli account inspect <account-id>
  flow-mcp-cli browser detect
  flow-mcp-cli video generate <prompt> [--account <id>] [--project <name>] [--model <model>] [--ratio <ratio>] [--outputs <n>] [--outdir <path>] [--upscale <factor>] [--ref <file>]
  flow-mcp-cli image generate <prompt> [--account <id>] [--project <name>] [--model <model>] [--ratio <ratio>] [--outputs <n>] [--outdir <path>] [--ref <file>]
  flow-mcp-cli job status <job-id>
  flow-mcp-cli job download <job-id>

Examples:
  flow-mcp-cli account connect personal "Personal Google Pro"
  flow-mcp-cli account connect studio "Existing Chromium" --cdp http://127.0.0.1:9222
  flow-mcp-cli account inspect personal
  flow-mcp-cli video generate "prompt text" --account personal --outdir ./output`);
  process.exit(2);
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function optionValues(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && args[i + 1]) values.push(args[i + 1]!);
  }
  return values;
}

const [, , group, action, idOrPrompt, ...rest] = process.argv;
if (!group || !action) usage();

if (group === "browser" && action === "detect") {
  const executable = findBrowserExecutable();
  console.log(executable ?? "No system Chromium/Chrome executable detected.");
  process.exit(executable ? 0 : 1);
}

const store = new FlowStore();
await store.initialize();
const browsers = new BrowserManager(store);
const cookieBridge = new CookieBridge();
await cookieBridge.start();
const flow = new FlowAdapter(store, browsers, cookieBridge);

try {
  if (group === "account") {
    if (action === "list") {
      console.log(JSON.stringify(await store.listAccounts(), null, 2));
    } else if (action === "connect") {
      if (!idOrPrompt) usage();
      const cdpUrl = optionValue(rest, "--cdp");
      const waitValue = optionValue(rest, "--wait");
      const labelParts = rest.slice(0, rest.findIndex((value) => value.startsWith("--")) === -1
        ? rest.length
        : rest.findIndex((value) => value.startsWith("--")));
      const waitForAccountSelectionSeconds = waitValue ? Number.parseInt(waitValue, 10) : 600;
      if (!cdpUrl) {
        cookieBridge.armForSession(300);
        console.log("USER ACTION: Open Flow Login Bridge in your normal signed-in Chromium and click Connect Flow. Then select the desired existing account in the temporary chooser.");
      }
      console.log(await flow.connectAccount(idOrPrompt, labelParts.join(" ") || undefined, {
        browserMode: cdpUrl ? "attach_cdp" : "extension",
        waitForBridgeSeconds: 60,
        waitForAccountSelectionSeconds,
        ...(cdpUrl ? { cdpUrl } : {}),
      }));
    } else if (action === "inspect") {
      if (!idOrPrompt) usage();
      console.log(JSON.stringify(await flow.inspect(idOrPrompt), null, 2));
    } else {
      usage();
    }
  } else if (group === "video" || group === "image") {
    if (action === "generate") {
      if (!idOrPrompt) usage();
      const accountId = optionValue(rest, "--account");
      const account = await store.requireConnectedAccount(accountId);
      const project = optionValue(rest, "--project");
      const model = optionValue(rest, "--model");
      const ratio = optionValue(rest, "--ratio");
      const outputsStr = optionValue(rest, "--outputs");
      const outputs = outputsStr ? Number.parseInt(outputsStr, 10) : 1;
      const outdir = path.resolve(optionValue(rest, "--outdir") || process.cwd());
      const upscale = optionValue(rest, "--upscale") || "none";
      const timeoutStr = optionValue(rest, "--timeout");
      const timeoutSeconds = timeoutStr ? Number.parseInt(timeoutStr, 10) : 600;
      const refFiles = optionValues(rest, "--ref").map((f) => path.resolve(f));

      const request: GenerationRequest = {
        accountId: account.id,
        mediaType: group,
        prompt: idOrPrompt,
        outputs,
        referenceFiles: refFiles,
        upscale: group === "video" ? upscale : "none",
        outputDirectory: outdir,
        download: true,
        timeoutSeconds,
        ...(project ? { flowProject: project } : {}),
        ...(model ? { model } : {}),
        ...(ratio ? { aspectRatio: ratio } : {}),
      };

      console.log(`Starting ${group} generation with account '${account.id}'...`);
      const job = await flow.generate(request);
      console.log(JSON.stringify(job, null, 2));
    } else {
      usage();
    }
  } else if (group === "job") {
    if (!idOrPrompt) usage();
    if (action === "status") {
      console.log(JSON.stringify(await flow.refreshJob(idOrPrompt), null, 2));
    } else if (action === "download") {
      console.log(JSON.stringify(await flow.downloadJob(idOrPrompt), null, 2));
    } else {
      usage();
    }
  } else {
    usage();
  }
} catch (error) {
  console.error(errorText(error));
  process.exitCode = 1;
} finally {
  await browsers.closeAll();
  await cookieBridge.close();
  process.exit(process.exitCode ?? 0);
}

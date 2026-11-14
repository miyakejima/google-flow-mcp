#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FLOW_ACCOUNT_GUIDANCE, FLOW_AGENT_INSTRUCTIONS, FLOW_TOOL_GUARD } from "./agent-contract.js";
import { BrowserManager } from "./browser-manager.js";
import { CookieBridge } from "./cookie-bridge.js";
import { errorText, FlowError } from "./errors.js";
import { FlowAdapter } from "./flow-adapter.js";
import { assertExistingFiles, requireAbsoluteDirectory } from "./paths.js";
import { FlowStore } from "./store.js";
import type { FlowJob, GenerationRequest, UiCapabilities } from "./types.js";

const store = new FlowStore();
await store.initialize();
const browsers = new BrowserManager(store);
const cookieBridge = new CookieBridge();
await cookieBridge.start();
const flow = new FlowAdapter(store, browsers, cookieBridge);
const extensionDirectory = fileURLToPath(new URL("../extension/", import.meta.url));

const server = new McpServer({
  name: "flow-mcp",
  version: "0.2.3",
  description: "Automates Google Flow through user-owned, persistent Chromium sessions and saves generated media locally.",
}, {
  instructions: FLOW_AGENT_INSTRUCTIONS,
});

function ok(value: string | FlowJob | UiCapabilities | unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
  };
}

function failed(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return { content: [{ type: "text", text: errorText(error) }], isError: true };
}

const accountId = z
  .string()
  .min(1)
  .max(48)
  .describe("Local account profile ID such as 'personal' or 'studio'. Each managed ID has an isolated persistent Chromium profile.");
const connectedAccountId = accountId.optional().describe(FLOW_ACCOUNT_GUIDANCE);
const upscale = z
  .string()
  .min(2)
  .max(80)
  .describe("Exact normalized upscale ID returned by flow_inspect_account (for example 1080p, 2x, or 4k), none, or highest_available. Unsupported and unavailable choices fail explicitly.");
const referenceFiles = z
  .array(z.string())
  .default([])
  .describe("Absolute paths to optional local images or videos to attach as Flow references/ingredients/frames.");
const outputDirectory = z
  .string()
  .describe("Absolute directory where downloads and .flow.json manifests are saved, e.g. C:\\project\\public\\generated\\flow.");
const timeoutSeconds = z
  .number()
  .int()
  .min(15)
  .max(900)
  .default(600)
  .describe("Maximum seconds to wait for this generation or upscale. A timeout leaves a persistent job that can be polled.");
const confirmCreditSpend = z
  .literal(true)
  .describe("Must be true. Confirms the user explicitly authorized this operation to consume Google Flow/AI credits.");

server.registerTool(
  "flow_help",
  {
    title: "What Can Google Flow MCP Do?",
    description: "Call this when the user asks what Google Flow MCP can do, how to use it, or for example requests. Returns a concise multilingual-ready capability guide without opening a browser or spending credits.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    try {
      const accounts = await store.listAccounts();
      return ok({
        product: "Google Flow MCP",
        summary: "Create Google Flow videos and images from natural-language requests, discover the exact options on the connected account, use real Flow upscaling, and download validated media into the user's project.",
        capabilities: [
          "Generate one or more videos with live Flow video models such as Omni Flash or available Veo variants",
          "Generate or edit images with available Nano Banana variants",
          "Use prompts in any language",
          "Select live aspect ratios, output counts, and durations when Flow exposes them",
          "Attach local image/video references, ingredients, or frames",
          "Use Flow's available video upscale options such as 1080p or highest_available",
          "Persist Flow's Never-ask generation setting inside each isolated managed Chromium profile",
          "Track each job's exact generated assets so gallery reordering cannot substitute an older file",
          "Download media plus reproducibility manifests, hashes, and optional FFprobe metadata",
          "Keep multiple Google Flow accounts in isolated local sessions",
        ],
        exampleRequests: [
          "Create one 16:9 Omni Flash video of a glass jellyfish floating through a rainy neon city and save it in my project.",
          "Generate a vertical 9:16 image with Nano Banana 2 using this reference image.",
          "Inspect my Flow account and tell me which models, ratios, durations, output counts, and upscales are available.",
          "Upscale the last generated video to the highest option my Flow account currently offers.",
          "Download the finished clip into my Remotion public/generated/flow folder.",
        ],
        connectedAccountIds: accounts.accounts.filter((account) => account.connectionStatus === "connected").map((account) => account.id),
        defaultAccountId: accounts.defaultAccountId,
        ready: Boolean(accounts.defaultAccountId),
        agentInstruction: "Answer the user in their language with relevant examples. For generation, call flow_list_accounts, flow_inspect_account, then the matching flow_generate_* tool; never operate the Flow website with generic browser tools.",
      });
    } catch (error) {
      return failed(error);
    }
  },
);

server.registerTool(
  "flow_list_accounts",
  {
    title: "List Google Flow Accounts",
    description: `MANDATORY FIRST STEP for Google Flow work. Returns readyForGeneration and the verified default account. When readyForGeneration=true, use defaultAccountId and DO NOT call either account-connection tool. ${FLOW_TOOL_GUARD}`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    try {
      const accounts = await store.listAccounts();
      const connectedAccountIds = accounts.accounts.filter((account) => account.connectionStatus === "connected").map((account) => account.id);
      const readyForGeneration = Boolean(accounts.defaultAccountId && connectedAccountIds.includes(accounts.defaultAccountId));
      return ok({
        ...accounts,
        connectedAccountIds,
        readyForGeneration,
        connectionRequired: !readyForGeneration,
        agentInstruction: readyForGeneration
          ? `ACCOUNT IS ALREADY CONNECTED. Use '${accounts.defaultAccountId}'. Call flow_inspect_account next. DO NOT call flow_begin_account_connection, flow_complete_account_connection, flow_login_bridge_status, PowerShell, or browser/computer-use tools.`
          : "No verified default account exists. Call flow_begin_account_connection, STOP and tell the user to click Connect Flow in the extension, then wait for their reply before calling flow_complete_account_connection.",
      });
    } catch (error) {
      return failed(error);
    }
  },
);

server.registerTool(
  "flow_login_bridge_status",
  {
    title: "Check Flow Login Bridge",
    description: "Login diagnostic only. Reports whether the localhost Flow Login Bridge is waiting for the Chromium extension. Do not use this for generation and do not open Flow with browser tools. Normally call flow_list_accounts first.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    try {
      return ok(cookieBridge.status());
    } catch (error) {
      return failed(error);
    }
  },
);

server.registerTool(
  "flow_begin_account_connection",
  {
    title: "Begin Google Flow Account Connection",
    description: `FIRST CONNECTION STEP. Returns the exact user instructions and extension path immediately; it never blocks waiting for a click. After this response, STOP and tell the user to open Flow Login Bridge in their normal signed-in Chromium, click Connect Flow, and reply when the popup says Session sent. Do not call the completion tool until the user replies. ${FLOW_TOOL_GUARD}`,
    inputSchema: {
      accountId: accountId.optional().describe("Optional intended local account ID, used only to make the returned instructions specific."),
      label: z.string().max(100).optional().describe("Optional intended local label, used only in the returned connection plan."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ accountId: id, label }) => {
    try {
      const accounts = await store.listAccounts();
      const connectedDefault = accounts.defaultAccountId
        ? accounts.accounts.find((account) => account.id === accounts.defaultAccountId && account.connectionStatus === "connected")
        : undefined;
      if (connectedDefault && (!id || id === connectedDefault.id)) {
        return ok({
          status: "ALREADY_CONNECTED",
          accountId: connectedDefault.id,
          readyForGeneration: true,
          connectionRequired: false,
          nextTool: "flow_inspect_account",
          agentInstruction: `Use connected account '${connectedDefault.id}'. DO NOT ask the user to reconnect and DO NOT run browser or process diagnostics.`,
        });
      }
      const connection = cookieBridge.armForSession(300);
      const { connectionId, ...bridge } = connection;
      return ok({
        status: "USER_ACTION_REQUIRED",
        accountId: id,
        label,
        connectionId,
        bridge,
        extensionDirectory,
        userMessage: [
          "Open your normal Chromium browser—the one where your Google accounts are already signed in.",
          "Open the Flow Login Bridge extension.",
          "Click Connect Flow.",
          "Wait until the popup says: Session sent.",
          "Return here and say: connected.",
        ],
        nextTool: "flow_complete_account_connection",
        connectedAccountIds: accounts.accounts.filter((account) => account.connectionStatus === "connected").map((account) => account.id),
        agentInstruction: "STOP NOW. Show userMessage to the user in their language and wait for their reply. Preserve connectionId, but do not call flow_complete_account_connection in this turn.",
      });
    } catch (error) {
      return failed(error);
    }
  },
);

server.registerTool(
  "flow_complete_account_connection",
  {
    title: "Complete Google Flow Account Connection",
    description: `SECOND CONNECTION STEP. Call only after the user confirms they clicked Connect Flow and the extension popup says Session sent. Before calling, tell the user that a temporary Google chooser will open and they should click the desired existing account. Requires the begin-step connectionId and explicit user confirmation; if the session was not sent it fails immediately instead of blocking. ${FLOW_TOOL_GUARD}`,
    inputSchema: {
      connectionId: z.string().uuid().describe("Required token returned by flow_begin_account_connection. Never invent or reuse it."),
      userConfirmedSessionSent: z.literal(true).describe("Must be true only after the user explicitly says the extension popup displayed Session sent."),
      accountId: accountId.optional().describe("Optional local ID. Omit for the simplest setup; a safe ID is created automatically."),
      label: z.string().max(100).optional().describe("Optional local label. Omit to use the transferred Chromium profile name."),
      chooseGoogleAccount: z.boolean().default(true).describe("Keep true to show Google's chooser populated with the transferred existing accounts."),
      waitForAccountSelectionSeconds: z.number().int().min(30).max(900).default(300).describe("Time for the user to click an existing account in the temporary Google chooser and for Flow to load."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ connectionId, accountId: id, label, chooseGoogleAccount, waitForAccountSelectionSeconds }) => {
    try {
      cookieBridge.assertSessionReady(connectionId);
      return ok(await flow.connectAccount(id, label, {
        browserMode: "extension",
        chooseGoogleAccount,
        waitForBridgeSeconds: 1,
        waitForAccountSelectionSeconds,
      }));
    } catch (error) {
      return failed(error);
    }
  },
);

server.registerTool(
  "flow_inspect_account",
  {
    title: "Inspect Google Flow Account UI",
    description: `MANDATORY before generation. Verifies the real Flow workspace and returns a language-independent live capability map. A landing page returns workspaceAvailable=false and a stop instruction; never browse or scroll it. ${FLOW_TOOL_GUARD}`,
    inputSchema: { accountId: connectedAccountId },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ accountId: id }) => {
    try {
      return ok(await flow.inspect(id));
    } catch (error) {
      return failed(error);
    }
  },
);

server.registerTool(
  "flow_generate_video",
  {
    title: "Generate and Download a Google Flow Video",
    description: `THE REQUIRED AND EXCLUSIVE PATH for every Google Flow video request. Submits one persistent job, waits briefly, and returns. If status=processing, poll flow_job_status with the SAME job ID; never generate again. It optionally upscales and downloads locally. Never open or control Flow with browser/computer-use tools. Requires explicit credit authorization.`,
    inputSchema: {
      accountId: connectedAccountId,
      prompt: z.string().min(3).max(20_000).describe("Video prompt in any language, describing subject, action, setting, camera, lighting, style, and audio as desired."),
      flowProject: z.string().max(200).optional().describe("Existing Flow project name to open. If omitted, the current project is reused or a new project is created."),
      model: z.string().default("best").describe("Video model. Default \"best\" picks the highest-quality model the account offers right now (quality tier first, then newest version; e.g. veo-3-1-quality). Or pass a normalized model ID returned by flow_inspect_account (e.g. omni-1-2-flash, veo-3-1-lite) or its exact visible label. Use ui-default to keep whatever Flow currently has selected. Higher tiers usually cost more credits."),
      aspectRatio: z.string().regex(/^(?:ui-default|\d+:\d+)$/).default("ui-default").describe("Exact video aspect ratio returned by flow_inspect_account, or ui-default."),
      durationSeconds: z.number().int().min(1).max(120).optional().describe("Requested clip length only when flow_inspect_account reports that exact value in visibleDurations. Omit when the current Flow Agent UI exposes no duration control."),
      outputs: z.number().int().min(1).max(4).default(1).describe("Number of generated video outputs requested from Flow. Credits are typically charged per generation."),
      referenceFiles,
      upscale: upscale.default("none"),
      outputDirectory,
      fileName: z.string().max(120).optional().describe("Optional safe file stem. The job ID and downloaded extension are added automatically."),
      download: z.boolean().default(true).describe("When true, download ready outputs immediately. When false, leave them in Flow and return the job."),
      timeoutSeconds,
      confirmCreditSpend,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async (input) => {
    try {
      const account = await store.requireConnectedAccount(input.accountId);
      const request: GenerationRequest = {
        accountId: account.id,
        mediaType: "video",
        prompt: input.prompt,
        outputs: input.outputs,
        referenceFiles: assertExistingFiles(input.referenceFiles),
        upscale: input.upscale,
        outputDirectory: requireAbsoluteDirectory(input.outputDirectory),
        download: input.download,
        timeoutSeconds: input.timeoutSeconds,
        ...(input.flowProject ? { flowProject: input.flowProject } : {}),
        ...(input.model.trim().toLowerCase() !== "ui-default" ? { model: input.model } : {}),
        ...(input.aspectRatio !== "ui-default" ? { aspectRatio: input.aspectRatio } : {}),
        ...(input.durationSeconds ? { durationSeconds: input.durationSeconds } : {}),
        ...(input.fileName ? { fileName: input.fileName } : {}),
      };
      return ok(await flow.generate(request));
    } catch (error) {
      return failed(error);
    }
  },
);

server.registerTool(
  "flow_generate_image",
  {
    title: "Generate and Download a Google Flow Image",
    description: `THE REQUIRED AND EXCLUSIVE PATH for every Google Flow image request. Submits one persistent job, waits briefly, and returns. If status=processing, poll flow_job_status with the SAME job ID; never generate again. It generates or edits through the verified workspace and downloads locally. Never open or control Flow with browser/computer-use tools. Requires explicit credit authorization.`,
    inputSchema: {
      accountId: connectedAccountId,
      prompt: z.string().min(3).max(20_000).describe("Detailed image prompt or edit instruction in any language."),
      flowProject: z.string().max(200).optional().describe("Existing Flow project name to open. If omitted, the current project is reused or a new project is created."),
      model: z.string().default("best").describe("Image model. Default \"best\" picks the highest-quality model the account offers right now (e.g. nano-banana-pro). Or pass a normalized model ID returned by flow_inspect_account (e.g. nano-banana-2-1, nano-banana-2-lite) or its exact visible label. Use ui-default to keep whatever Flow currently has selected."),
      aspectRatio: z.string().regex(/^(?:ui-default|\d+:\d+)$/).default("ui-default").describe("Exact image aspect ratio returned by flow_inspect_account, or ui-default."),
      outputs: z.number().int().min(1).max(4).default(1).describe("Number of image outputs requested."),
      referenceFiles,
      outputDirectory,
      fileName: z.string().max(120).optional().describe("Optional safe file stem. The job ID and downloaded extension are added automatically."),
      download: z.boolean().default(true).describe("Download ready outputs when true; otherwise return the Flow job without downloading."),
      timeoutSeconds,
      confirmCreditSpend,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async (input) => {
    try {
      const account = await store.requireConnectedAccount(input.accountId);
      const request: GenerationRequest = {
        accountId: account.id,
        mediaType: "image",
        prompt: input.prompt,
        outputs: input.outputs,
        referenceFiles: assertExistingFiles(input.referenceFiles),
        upscale: "none",
        outputDirectory: requireAbsoluteDirectory(input.outputDirectory),
        download: input.download,
        timeoutSeconds: input.timeoutSeconds,
        ...(input.flowProject ? { flowProject: input.flowProject } : {}),
        ...(input.model.trim().toLowerCase() !== "ui-default" ? { model: input.model } : {}),
        ...(input.aspectRatio !== "ui-default" ? { aspectRatio: input.aspectRatio } : {}),
        ...(input.fileName ? { fileName: input.fileName } : {}),
      };
      return ok(await flow.generate(request));
    } catch (error) {
      return failed(error);
    }
  },
);

server.registerTool(
  "flow_job_status",
  {
    title: "Check a Google Flow Job",
    description: `The exclusive status path for jobs returned by a Flow generation tool. Poll the SAME job ID until completed or failed; never resubmit generation. It safely finalizes any download already authorized by the original request. Never inspect Flow with generic browser/computer-use tools.`,
    inputSchema: {
      jobId: z.string().uuid().describe("UUID returned by flow_generate_video or flow_generate_image."),
      waitSeconds: z.number().int().min(0).max(60).default(10).describe("Seconds to poll before returning; use 0 for an immediate snapshot."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ jobId, waitSeconds }) => {
    try {
      return ok(waitSeconds === 0 ? await store.getJob(jobId) : await flow.refreshJob(jobId, waitSeconds));
    } catch (error) {
      return failed(error);
    }
  },
);

server.registerTool(
  "flow_upscale_video",
  {
    title: "Upscale an Existing Google Flow Video Job",
    description: `The exclusive path for real Flow video upscaling. Uses live available options and rejects unavailable/upgrade-only choices. Never right-click or control Flow with generic browser/computer-use tools. May consume credits and requires explicit authorization.`,
    inputSchema: {
      jobId: z.string().uuid().describe("UUID of an existing video generation job."),
      factor: z.string().min(2).max(80).refine((value) => value !== "none", "Use a live upscale ID or highest_available, not none.").describe("Exact available upscale ID returned by flow_inspect_account, such as 1080p or 2x, or highest_available. Missing/unavailable options fail explicitly."),
      timeoutSeconds,
      confirmCreditSpend,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ jobId, factor, timeoutSeconds: timeout }) => {
    try {
      return ok(await flow.upscaleJob(jobId, factor, timeout));
    } catch (error) {
      return failed(error);
    }
  },
);

server.registerTool(
  "flow_download_job",
  {
    title: "Download an Existing Google Flow Job",
    description: `The exclusive path to download an existing Flow job. Uses the exact asset identities recorded for that job and fails instead of guessing from gallery order. Never download through generic browser/computer-use tools. Saves to the configured absolute directory, validates files, writes manifests, and does not start a generation.`,
    inputSchema: { jobId: z.string().uuid().describe("Exact UUID returned by the video or image generation whose asset must be downloaded. Never substitute a different or guessed job ID.") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ jobId }) => {
    try {
      return ok(await flow.downloadJob(jobId));
    } catch (error) {
      return failed(error);
    }
  },
);

const shutdown = async (): Promise<void> => {
  await browsers.closeAll();
  await cookieBridge.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[flow-mcp] ready; data directory: ${store.dataDir}`);

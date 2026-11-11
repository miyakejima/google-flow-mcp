import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, stat, unlink, writeFile, type FileHandle } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { FlowError } from "./errors.js";
import { validateAccountId } from "./paths.js";
import { FlowStore } from "./store.js";
import { FLOW_URL } from "./types.js";
import { isFlowPageUrl } from "./navigation.js";
import type { TransferredCookie } from "./types.js";

interface AccountBrowser {
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

interface SharedBrowserSession {
  endpoint: string;
  ownerPid: number;
  createdAt: string;
}

function systemChromiumCandidates(): string[] {
  const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  if (process.platform === "win32") {
    return [
      path.join(local, "Chromium", "Application", "chrome.exe"),
      "C:\\Program Files\\Chromium\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ];
  }
  if (process.platform === "darwin") {
    return [
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ];
  }
  return [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ];
}

export function findBrowserExecutable(): string | undefined {
  const explicit = process.env.FLOW_MCP_BROWSER_EXECUTABLE;
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new FlowError("browser_error", `FLOW_MCP_BROWSER_EXECUTABLE does not exist: ${explicit}`);
    }
    return path.resolve(explicit);
  }
  return systemChromiumCandidates().find(existsSync);
}

async function reserveLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not reserve a local CDP port.")));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForCdp(endpoint: string, process: ChildProcess, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`Chromium exited before CDP was ready (exit code ${process.exitCode}).`);
    }
    try {
      const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // Browser is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Chromium did not expose CDP at ${endpoint} within ${timeoutMs / 1_000} seconds.`);
}

async function closeManagedBrowser(browser: Browser, process: ChildProcess): Promise<void> {
  await browser.close().catch(() => undefined);
  if (process.exitCode === null && !process.killed) process.kill();
}

export class BrowserManager {
  private readonly browsers = new Map<string, AccountBrowser>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly store: FlowStore) {}

  private sessionDirectory(): string {
    return path.join(this.store.dataDir, "browser-sessions");
  }

  private sessionFile(accountId: string): string {
    return path.join(this.sessionDirectory(), `${validateAccountId(accountId)}.json`);
  }

  private launchLockFile(accountId: string): string {
    return path.join(this.sessionDirectory(), `${validateAccountId(accountId)}.launch.lock`);
  }

  private operationLockFile(accountId: string): string {
    return path.join(this.sessionDirectory(), `${validateAccountId(accountId)}.operation.lock`);
  }

  private async removeStaleLock(file: string): Promise<void> {
    try {
      const pid = Number.parseInt((await readFile(file, "utf8")).trim(), 10);
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
          return;
        } catch {
          // The owner process is gone.
        }
      } else if (Date.now() - (await stat(file)).mtimeMs < 30_000) {
        return;
      }
      await unlink(file);
    } catch {
      // Another process may have released it.
    }
  }

  private async attachSharedBrowser(accountId: string): Promise<Page | null> {
    let session: SharedBrowserSession;
    try {
      session = JSON.parse(await readFile(this.sessionFile(accountId), "utf8")) as SharedBrowserSession;
    } catch {
      return null;
    }
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(session.endpoint)) return null;
    try {
      const probe = await fetch(`${session.endpoint}/json/version`, { signal: AbortSignal.timeout(1_000) });
      if (!probe.ok) return null;
      const browser = await chromium.connectOverCDP(session.endpoint);
      const context = browser.contexts()[0];
      if (!context) return null;
      const page = context.pages().find((candidate) => isFlowPageUrl(candidate.url()))
        ?? context.pages()[0]
        ?? (await context.newPage());
      this.preparePage(page);
      this.browsers.set(accountId, { context, page, close: async () => undefined });
      return page;
    } catch {
      return null;
    }
  }

  private async acquireLaunchLock(accountId: string): Promise<FileHandle> {
    await mkdir(this.sessionDirectory(), { recursive: true });
    const file = this.launchLockFile(accountId);
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      try {
        const handle = await open(file, "wx");
        await handle.writeFile(`${process.pid}\n`);
        return handle;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await this.removeStaleLock(file);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new FlowError("browser_error", `Timed out waiting for another MCP process to finish opening account '${accountId}'.`);
  }

  async pageFor(accountId: string): Promise<Page> {
    const existing = this.browsers.get(accountId);
    if (existing && !existing.page.isClosed()) return existing.page;

    const shared = await this.attachSharedBrowser(accountId);
    if (shared) return shared;

    const account = await this.store.requireAccount(accountId);
    let launchLock: FileHandle | undefined;
    try {
      if (account.browserMode === "attach_cdp") {
        if (!account.cdpUrl) {
          throw new FlowError("validation_error", `Account '${accountId}' uses attach_cdp but has no cdpUrl.`);
        }
        const browser = await chromium.connectOverCDP(account.cdpUrl);
        const context = browser.contexts()[0];
        if (!context) throw new FlowError("browser_error", `No browser context was exposed at ${account.cdpUrl}.`);
        const page = context.pages().find((candidate) => isFlowPageUrl(candidate.url()))
          ?? (await context.newPage());
        this.preparePage(page);
        this.browsers.set(accountId, { context, page, close: async () => undefined });
        return page;
      }

      const executablePath = account.browserExecutablePath ?? findBrowserExecutable();
      if (!executablePath) {
        throw new FlowError(
          "browser_error",
          "No Chromium or Google Chrome executable was detected.",
          ["Set FLOW_MCP_BROWSER_EXECUTABLE to the browser executable's absolute path."],
        );
      }
      launchLock = await this.acquireLaunchLock(accountId);
      const sharedAfterLock = await this.attachSharedBrowser(accountId);
      if (sharedAfterLock) return sharedAfterLock;
      const port = await reserveLocalPort();
      const endpoint = `http://127.0.0.1:${port}`;
      const args = [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${this.store.profileDir(accountId)}`,
        "--profile-directory=Default",
        "--no-first-run",
        "--no-default-browser-check",
        ...(process.env.FLOW_MCP_HEADLESS === "1" || account.headlessAfterLogin ? ["--headless=new"] : []),
        `--app=${FLOW_URL}`,
      ];
      const processHandle = spawn(executablePath, args, {
        stdio: "ignore",
        windowsHide: false,
      });
      let browser: Browser | undefined;
      try {
        await waitForCdp(endpoint, processHandle);
        browser = await chromium.connectOverCDP(endpoint);
      } catch (error) {
        if (processHandle.exitCode === null && !processHandle.killed) processHandle.kill();
        throw error;
      }
      const context = browser.contexts()[0];
      if (!context) {
        await closeManagedBrowser(browser, processHandle);
        throw new FlowError("browser_error", "Managed Chromium started without a usable browser context.");
      }
      const page = context.pages().find((candidate) => isFlowPageUrl(candidate.url()))
        ?? context.pages()[0]
        ?? (await context.newPage());
      this.preparePage(page);
      const session: SharedBrowserSession = { endpoint, ownerPid: process.pid, createdAt: new Date().toISOString() };
      await writeFile(this.sessionFile(accountId), `${JSON.stringify(session, null, 2)}\n`, "utf8");
      this.browsers.set(accountId, {
        context,
        page,
        close: async () => {
          await closeManagedBrowser(browser, processHandle);
          await unlink(this.sessionFile(accountId)).catch(() => undefined);
        },
      });
      return page;
    } catch (error) {
      if (error instanceof FlowError) throw error;
      throw new FlowError(
        "browser_error",
        `Could not connect Chromium for Flow account '${accountId}': ${error instanceof Error ? error.message : String(error)}`,
        [
          "Install Chromium/Chrome, or set FLOW_MCP_BROWSER_EXECUTABLE to its absolute executable path.",
          "For attach_cdp, confirm the localhost /json/version endpoint is reachable.",
        ],
      );
    } finally {
      await launchLock?.close().catch(() => undefined);
      if (launchLock) await unlink(this.launchLockFile(accountId)).catch(() => undefined);
    }
  }

  async importCookies(accountId: string, cookies: TransferredCookie[]): Promise<Page> {
    const page = await this.pageFor(accountId);
    const managed = this.browsers.get(accountId);
    if (!managed) throw new FlowError("browser_error", `Browser context for '${accountId}' is unavailable.`);
    await managed.context.clearCookies();
    await managed.context.addCookies(cookies.map((cookie) => {
      const common = {
        name: cookie.name,
        value: cookie.value,
        secure: cookie.secure ?? true,
        httpOnly: cookie.httpOnly ?? false,
        sameSite: cookie.sameSite === "strict" ? "Strict" as const
          : cookie.sameSite === "lax" ? "Lax" as const
            : "None" as const,
        ...(cookie.expirationDate && cookie.expirationDate > 0 ? { expires: cookie.expirationDate } : {}),
      };
      if (cookie.hostOnly) {
        const host = cookie.domain.replace(/^\./, "");
        return { ...common, url: `https://${host}${cookie.path || "/"}` };
      }
      return { ...common, domain: cookie.domain, path: cookie.path || "/" };
    }));
    return page;
  }

  async runExclusive<T>(accountId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(accountId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.queues.set(accountId, tail);
    await previous;
    await mkdir(this.sessionDirectory(), { recursive: true });
    const operationLockFile = this.operationLockFile(accountId);
    let operationLock: FileHandle | undefined;
    try {
      const deadline = Date.now() + 90_000;
      while (!operationLock && Date.now() < deadline) {
        try {
          operationLock = await open(operationLockFile, "wx");
          await operationLock.writeFile(`${process.pid}\n`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          await this.removeStaleLock(operationLockFile);
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      if (!operationLock) {
        throw new FlowError("browser_error", `Timed out waiting for another MCP process using account '${accountId}'.`);
      }
      return await operation();
    } finally {
      await operationLock?.close().catch(() => undefined);
      if (operationLock) await unlink(operationLockFile).catch(() => undefined);
      release();
      if (this.queues.get(accountId) === tail) this.queues.delete(accountId);
    }
  }

  async reset(accountId: string): Promise<void> {
    const existing = this.browsers.get(accountId);
    if (!existing) return;
    this.browsers.delete(accountId);
    await existing.close();
  }

  async closeAll(): Promise<void> {
    await Promise.allSettled([...this.browsers.values()].map(({ close }) => close()));
    this.browsers.clear();
  }

  private preparePage(page: Page): void {
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(45_000);
  }
}

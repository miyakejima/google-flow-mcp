export const FLOW_URL = "https://labs.google/fx/tools/flow";

export type MediaType = "video" | "image";
export type UpscaleFactor = string;
export type AccountConnectionStatus = "unverified" | "connected" | "needs_reconnect" | "access_unavailable";
export type JobStatus =
  | "created"
  | "configuring"
  | "submitted"
  | "processing"
  | "ready"
  | "upscaling"
  | "downloading"
  | "completed"
  | "failed"
  | "needs_attention";

export interface AccountRecord {
  id: string;
  label: string;
  createdAt: string;
  lastOpenedAt?: string;
  browserMode?: "managed" | "extension" | "attach_cdp";
  cdpUrl?: string;
  browserExecutablePath?: string;
  headlessAfterLogin?: boolean;
  connectionStatus?: AccountConnectionStatus;
  lastValidatedAt?: string;
  lastValidationError?: string;
}

export interface AccountOptions {
  browserMode?: "managed" | "extension" | "attach_cdp";
  cdpUrl?: string;
  browserExecutablePath?: string;
}

export interface TransferredCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  hostOnly?: boolean;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "no_restriction" | "lax" | "strict" | "unspecified";
  expirationDate?: number;
}

export interface TransferredBrowserSession {
  cookies: TransferredCookie[];
  browser?: string;
  profile?: string;
  receivedAt: string;
}

export interface AccountsFile {
  version: 1;
  defaultAccountId?: string;
  accounts: AccountRecord[];
}

export interface MediaProbe {
  format?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  codec?: string;
  sizeBytes: number;
  sha256: string;
  ffprobeAvailable: boolean;
}

export interface MediaAssetIdentity {
  keys: string[];
}

export interface FlowJob {
  id: string;
  accountId: string;
  mediaType: MediaType;
  status: JobStatus;
  prompt: string;
  flowProject?: string;
  flowProjectUrl?: string;
  model?: string;
  aspectRatio?: string;
  durationSeconds?: number;
  outputs: number;
  upscale: UpscaleFactor;
  availableUpscales?: string[];
  chosenUpscale?: string;
  upscaleSubmitted?: boolean;
  upscaleBaselineMediaKeys?: string[];
  outputDirectory: string;
  downloadRequested?: boolean;
  fileName?: string;
  downloadedFiles?: string[];
  mediaProbe?: MediaProbe[];
  error?: string;
  diagnosticScreenshot?: string;
  creditConfirmationMode?: "auto_approve";
  baselineMediaCount?: number;
  baselineMediaKeys?: string[];
  generatedAssets?: MediaAssetIdentity[];
  createdAt: string;
  updatedAt: string;
}

export interface GenerationRequest {
  accountId: string;
  mediaType: MediaType;
  prompt: string;
  flowProject?: string;
  model?: string;
  aspectRatio?: string;
  durationSeconds?: number;
  outputs: number;
  referenceFiles: string[];
  upscale: UpscaleFactor;
  outputDirectory: string;
  fileName?: string;
  download: boolean;
  timeoutSeconds: number;
}

export interface UiCapabilities {
  url: string;
  signedIn: boolean;
  workspaceAvailable: boolean;
  pageKind: "workspace" | "signed_out" | "landing_or_unavailable";
  agentInstruction: string;
  language?: string;
  models?: {
    image: Array<{ id: string; label: string; selected: boolean }>;
    video: Array<{ id: string; label: string; selected: boolean }>;
  };
  aspectRatiosByMedia?: { image: string[]; video: string[] };
  outputCountsByMedia?: { image: number[]; video: number[] };
  /** Model each generation tool uses when model is "best" (the default). */
  bestModels?: { image: string | undefined; video: string | undefined };
  visibleModels: string[];
  visibleAspectRatios: string[];
  visibleDurations: number[];
  availableUpscales: string[];
  unavailableUpscales?: string[];
  upscaleOptions?: UpscaleOption[];
  pageTextExcerpt: string;
  screenshot?: string;
}

export interface UpscaleOption {
  id: string;
  label: string;
  available: boolean;
  kind: "preview" | "original" | "upscale" | "unknown";
}

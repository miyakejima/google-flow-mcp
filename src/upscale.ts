import { FlowError } from "./errors.js";
import type { UpscaleFactor, UpscaleOption } from "./types.js";

export interface AssetMenuEntry {
  text: string;
  disabled?: boolean;
}

export function normalizeUpscaleId(value: string): string {
  const factor = value.match(/\b(1x|2x|4x)\b/i)?.[1];
  if (factor) return factor.toLowerCase();
  const resolution = value.match(/\b(\d{3,4}p|[48]k)\b/i)?.[1];
  if (resolution) return resolution.toLowerCase();
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

export function upscaleHeight(id: string): number | undefined {
  const normalized = normalizeUpscaleId(id);
  if (normalized === "4k") return 2160;
  if (normalized === "8k") return 4320;
  const match = normalized.match(/^(\d{3,4})p$/);
  return match?.[1] ? Number.parseInt(match[1], 10) : undefined;
}

const UPSCALED_LABEL = /\bupscal|mejorad|escalad/i;
const ORIGINAL_LABEL = /\boriginal\b/i;
const PREVIEW_LABEL = /\bgif\b|animated|animad/i;

export function extractUpscaleOptions(
  entries: AssetMenuEntry[],
  originalHeight?: number,
): UpscaleOption[] {
  const seen = new Set<string>();
  const options: UpscaleOption[] = [];
  for (const entry of entries) {
    const id = normalizeUpscaleId(entry.text);
    if (!/^(?:1x|2x|4x|\d{3,4}p|[48]k)$/.test(id) || seen.has(id)) continue;
    const height = upscaleHeight(id);
    const factor = id.match(/^(\d)x$/)?.[1];
    // Current Flow labels state the kind ("720p Original size", "1080p Upscaled",
    // "270p Animated GIF"); prefer that, then fall back to factor/height comparison.
    const labelKind = UPSCALED_LABEL.test(entry.text) ? "upscale" as const
      : ORIGINAL_LABEL.test(entry.text) ? "original" as const
        : PREVIEW_LABEL.test(entry.text) ? "preview" as const
          : undefined;
    // A factor ("Upscale 1x"/"2x") is authoritative; "Upscale" there is only the menu prefix.
    const kind = factor
      ? Number.parseInt(factor, 10) <= 1 ? "original" as const : "upscale" as const
      : labelKind ?? (originalHeight && height
        ? height < originalHeight ? "preview" as const : height === originalHeight ? "original" as const : "upscale" as const
        : "unknown" as const);
    seen.add(id);
    options.push({
      id,
      label: entry.text.trim().replace(/\s+/g, " "),
      available: !entry.disabled,
      kind,
    });
  }
  return options;
}

export function extractUpscaleLabels(texts: string[], originalHeight?: number): string[] {
  return extractUpscaleOptions(texts.map((text) => ({ text })), originalHeight)
    .filter((option) => option.kind === "upscale" && option.available)
    .map((option) => option.id);
}

export function chooseUpscaleOption(
  options: string[],
  requested: Exclude<UpscaleFactor, "none">,
): string {
  if (!options.length) {
    throw new FlowError(
      "unsupported_option",
      "The selected video did not expose any available upscale choices in its Flow asset menu.",
      ["The video may still be processing, or this account/model may not support upscaling."],
    );
  }
  if (requested !== "highest_available") {
    const requestedId = normalizeUpscaleId(requested);
    const exact = options.find((option) => normalizeUpscaleId(option) === requestedId);
    if (exact) return exact;
    throw new FlowError(
      "unsupported_option",
      `Upscale '${requested}' is not offered for this video. Available choices: ${options.join(", ")}`,
      ["Call flow_inspect_account for the live choices, or use highest_available."],
    );
  }
  const score = (value: string): number => {
    const height = upscaleHeight(value);
    if (height) return height;
    const factor = normalizeUpscaleId(value).match(/^(\d)x$/)?.[1];
    return factor ? Number.parseInt(factor, 10) * 1_000 : 0;
  };
  return [...options].sort((left, right) => score(right) - score(left))[0]!;
}

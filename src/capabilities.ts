export interface CapabilityOption {
  id: string;
  label: string;
  selected: boolean;
  /** Flow's availability badge, e.g. "Leaving Dec 5". Kept out of id/label so IDs stay stable. */
  note?: string;
}

const ICON_WORDS = /\b(?:arrow_drop_down|crop_16_9|crop_9_16|crop_landscape|crop_portrait|crop_square)\b/gi;
// Flow appends retirement badges to menu labels ("Veo 3.1 - Quality Leaving Dec 5").
const AVAILABILITY_NOTE = /\s+((?:leaving|retiring|ending|removed)\b.*)$/i;

function stripIcons(value: string): string {
  return value
    .replace(ICON_WORDS, " ")
    .replace(/[🍌]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function capabilityNote(value: string): string | undefined {
  return stripIcons(value).match(AVAILABILITY_NOTE)?.[1];
}

export function cleanCapabilityLabel(value: string): string {
  return stripIcons(value).replace(AVAILABILITY_NOTE, "").trim();
}

// "best" model selection: quality tier first, then version. Pattern-based so new
// releases (e.g. a future "Veo 4 - Quality") rank correctly without code changes,
// and a retired model simply drops out of the live option list.
function modelTier(id: string): number {
  if (/(?:^|-)(?:pro|quality|ultra)(?:-|$)/.test(id)) return 3;
  if (/(?:^|-)lite(?:-|$)/.test(id)) return 0;
  if (/(?:^|-)fast(?:-|$)/.test(id)) return 1;
  return 2;
}

function modelVersion(id: string): number {
  const match = id.match(/(\d+)(?:-(\d+))?/);
  if (!match) return 0;
  return Number.parseFloat(`${match[1]}.${match[2] ?? "0"}`);
}

export function rankModels<T extends Pick<CapabilityOption, "id">>(options: T[]): T[] {
  return [...options].sort((a, b) => modelTier(b.id) - modelTier(a.id) || modelVersion(b.id) - modelVersion(a.id));
}

export function pickBestModel<T extends Pick<CapabilityOption, "id">>(options: T[]): T | undefined {
  return rankModels(options)[0];
}

export function normalizeCapabilityId(value: string): string {
  return cleanCapabilityLabel(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^gemini\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    // Accept IDs captured while a retirement badge was part of the label.
    .replace(/-(?:leaving|retiring|ending|removed)(?:-.*)?$/, "");
}

export function parseOutputCount(value: string): number | undefined {
  const match = cleanCapabilityLabel(value).match(/^(?:x\s*)?(\d+)(?:\s*x)?$/i);
  return match?.[1] ? Number.parseInt(match[1], 10) : undefined;
}

export function parseDurationSeconds(value: string): number | undefined {
  const match = value.match(/\b(4|6|8|10)\s*(?:s|sec|seconds?|seg|segundos?)\b/i);
  return match?.[1] ? Number.parseInt(match[1], 10) : undefined;
}

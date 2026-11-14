import assert from "node:assert/strict";
import test from "node:test";
import { capabilityNote, cleanCapabilityLabel, normalizeCapabilityId, pickBestModel, rankModels } from "../src/capabilities.js";

const ids = (labels: string[]) => labels.map((label) => ({ id: normalizeCapabilityId(label) }));

test("retirement badges stay out of model IDs and labels but are kept as a note", () => {
  const raw = "Veo 3.1 - Quality Leaving Dec 5";
  assert.equal(cleanCapabilityLabel(raw), "Veo 3.1 - Quality");
  assert.equal(normalizeCapabilityId(raw), "veo-3-1-quality");
  assert.equal(capabilityNote(raw), "Leaving Dec 5");
  assert.equal(capabilityNote("🍌 Nano Banana Pro"), undefined);
  // IDs captured while the badge was part of the label still resolve.
  assert.equal(normalizeCapabilityId("veo-3-1-quality-leaving-dec-5"), "veo-3-1-quality");
});

test("best image model is the Pro tier over newer standard models", () => {
  const options = ids(["🍌 Nano Banana Pro", "🍌 Nano Banana 2 Lite", "🍌 Nano Banana 2.1"]);
  assert.equal(pickBestModel(options)?.id, "nano-banana-pro");
  assert.deepEqual(rankModels(options).map((o) => o.id), ["nano-banana-pro", "nano-banana-2-1", "nano-banana-2-lite"]);
});

test("best video model is the quality tier, and falls back sensibly once it is retired", () => {
  const live = ids(["Omni 1.2 Flash", "Omni 1.1 Flash Leaving Dec 5", "Veo 3.1 - Lite", "Veo 3.1 - Fast Leaving Dec 5", "Veo 3.1 - Quality Leaving Dec 5"]);
  assert.deepEqual(rankModels(live).map((o) => o.id), ["veo-3-1-quality", "veo-3-1-fast", "omni-1-2-flash", "omni-1-1-flash", "veo-3-1-lite"]);
  const afterDec5 = ids(["Omni 1.2 Flash", "Veo 3.1 - Lite"]);
  assert.equal(pickBestModel(afterDec5)?.id, "omni-1-2-flash");
});

test("a newer release in the same tier wins without code changes", () => {
  assert.equal(pickBestModel(ids(["Veo 3.1 - Quality", "Veo 4 - Quality", "Omni 2 Flash"]))?.id, "veo-4-quality");
  assert.equal(pickBestModel([]), undefined);
});

test("versions compare as integers and the keywords are case-insensitive", async () => {
  const { isBestModelKeyword, isUiDefaultKeyword } = await import("../src/capabilities.js");
  assert.equal(pickBestModel(ids(["Veo 3.9 - Quality", "Veo 3.10 - Quality"]))?.id, "veo-3-10-quality");
  assert.equal(isBestModelKeyword(" Best "), true);
  assert.equal(isBestModelKeyword("nano-banana-pro"), false);
  assert.equal(isUiDefaultKeyword("UI-Default"), true);
});

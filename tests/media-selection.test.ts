import assert from "node:assert/strict";
import test from "node:test";
import {
  identitiesFor,
  resolveMediaIdentities,
  selectNewMedia,
  type MediaSnapshot,
} from "../src/media-selection.js";

const ready = (index: number, ...keys: string[]): MediaSnapshot => ({ index, keys, ready: true });

test("new media is selected by identity, not DOM position", () => {
  const baseline = ["url:blob:jellyfish"];
  const current = [
    ready(0, "url:blob:rainy"),
    ready(1, "url:blob:jellyfish"),
  ];

  assert.deepEqual(selectNewMedia(current, baseline), [current[0]]);
});

test("a tracked generated asset still resolves after gallery reordering", () => {
  const generated = ready(1, "url:https://video.example/videoplayback?id=rainy&signature=one", "url-stable:https://video.example/videoplayback?id=rainy");
  const identities = identitiesFor([generated]);
  const reordered = [
    ready(0, "url:https://video.example/videoplayback?id=rainy&signature=two", "url-stable:https://video.example/videoplayback?id=rainy"),
    ready(1, "url:blob:jellyfish"),
  ];

  assert.deepEqual(resolveMediaIdentities(reordered, identities), [reordered[0]]);
});

test("ambiguous or missing identities fail closed", () => {
  const identity = [{ keys: ["url-stable:https://video.example/shared"] }];
  const ambiguous = [
    ready(0, "url-stable:https://video.example/shared"),
    ready(1, "url-stable:https://video.example/shared"),
  ];

  assert.equal(resolveMediaIdentities(ambiguous, identity), null);
  assert.equal(resolveMediaIdentities([ready(0, "url:blob:other")], identity), null);
});

test("an older tile that loads late below known media is never mistaken for a new output", () => {
  const baseline = ["url:https://flow.google.com/asb/raindrop-a"];
  const current = [
    ready(0, "url:https://flow.google.com/asb/new-beach"),
    ready(1, "url:https://flow.google.com/asb/raindrop-a"),
    ready(2, "url:https://flow.google.com/asb/raindrop-b-loaded-late"),
  ];
  assert.deepEqual(selectNewMedia(current, baseline), [current[0]]);
  // Before the real output arrives, the late-loaded old tile alone must not count.
  assert.deepEqual(selectNewMedia(current.slice(1), baseline), []);
  // An empty project has nothing known, so any tile is new.
  assert.deepEqual(selectNewMedia([ready(0, "url:x")], []), [ready(0, "url:x")]);
});

test("identities recorded with a player URL still match the tile's thumbnail", () => {
  const recorded = [{ keys: ["url:https://flow.google.com/asb/TOKEN123=mm,22,15"] }];
  const thumbnail = ready(0, "url:https://flow.google.com/asb/TOKEN123", "asb:TOKEN123");
  assert.deepEqual(resolveMediaIdentities([thumbnail], recorded), [thumbnail]);
  assert.deepEqual(selectNewMedia([thumbnail], ["url:https://flow.google.com/asb/TOKEN123=mm,22,15"]), []);
});

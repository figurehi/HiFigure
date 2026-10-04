import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyStyleKit } from "./style-kit";
import { historyMatchIngredients } from "./history-match";

test("History Match keeps icons, font, and preset colors from the saved snapshot", () => {
  const styleKit = {
    ...createEmptyStyleKit("2026-08-24T00:00:00.000Z"),
    iconIds: ["tabler:search"],
  };
  const ingredients = historyMatchIngredients({
    activeStyleKit: styleKit,
    nodeIconBindings: {
      query: "tabler:search",
      model: "legacy-icon-id",
    },
    fontReferenceId: "paper",
    paletteReferenceId: "categorical",
    matchedStylePalette: null,
  });

  assert.deepEqual(ingredients.iconIds, ["tabler:search", "legacy-icon-id"]);
  assert.equal(ingredients.boundIconCount, 2);
  assert.equal(ingredients.font?.label, "IBM Plex Sans");
  assert.equal(ingredients.palette?.label, "Categorical Modules");
  assert.deepEqual(ingredients.palette?.colors, ["#3B6EA8", "#5C9E6E", "#C8903D", "#8D6AB8", "#D36F5B", "#4BA3A5"]);
});

test("History Match preserves extracted colors and unknown legacy font IDs", () => {
  const ingredients = historyMatchIngredients({
    nodeIconBindings: {},
    fontReferenceId: "legacy-font",
    paletteReferenceId: "categorical",
    matchedStylePalette: {
      kind: "region",
      id: "region:style-crop-1",
      sourceRegionId: "style-crop-1",
      colors: ["#112233", "#AABBCC"],
    },
  });

  assert.equal(ingredients.font?.label, "legacy-font");
  assert.equal(ingredients.palette?.label, "Style crop colors");
  assert.deepEqual(ingredients.palette?.colors, ["#112233", "#AABBCC"]);
});

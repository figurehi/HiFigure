import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultReferenceRetrievalDomain,
  referenceRetrievalDomainGroups,
} from "./retrieval-domains.ts";

test("reference similarity exposes only the three supported retrieval goals", () => {
  assert.equal(defaultReferenceRetrievalDomain, "idea_overview");
  assert.deepEqual(
    referenceRetrievalDomainGroups.flatMap((group) => group.options.map((option) => option.value)),
    ["idea_overview", "structure_overview", "style_overview"],
  );
  assert.deepEqual(
    referenceRetrievalDomainGroups.flatMap((group) => group.options.map((option) => option.label)),
    ["Idea formation", "Layout", "Style"],
  );
});

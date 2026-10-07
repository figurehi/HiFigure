import assert from "node:assert/strict";
import test from "node:test";

import { resolveApiAssetUrl } from "./api-assets.ts";

test("resolves backend-root asset URLs against the API base", () => {
  assert.equal(
    resolveApiAssetUrl("/dataset/images/figurebench_0132.png", "http://127.0.0.1:8000"),
    "http://127.0.0.1:8000/dataset/images/figurebench_0132.png",
  );
});

test("leaves browser-ready image URLs unchanged", () => {
  assert.equal(resolveApiAssetUrl(null, "http://127.0.0.1:8000"), null);
  assert.equal(resolveApiAssetUrl("", "http://127.0.0.1:8000"), "");
  assert.equal(
    resolveApiAssetUrl("data:image/png;base64,abc", "http://127.0.0.1:8000"),
    "data:image/png;base64,abc",
  );
  assert.equal(
    resolveApiAssetUrl("https://cdn.example.test/figure.png", "http://127.0.0.1:8000"),
    "https://cdn.example.test/figure.png",
  );
  assert.equal(
    resolveApiAssetUrl("/tutorial/style-1.svg", "http://127.0.0.1:8000"),
    "/tutorial/style-1.svg",
  );
});

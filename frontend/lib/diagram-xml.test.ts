import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync, strToU8 } from "fflate";
import {
  clearDrawioConnections,
  diagramPlanToDrawioXml,
  removeDrawioConnection,
  routeOrthogonalPreviewEdge,
} from "./diagram-xml";

const modelXml =
  '<mxGraphModel pageWidth="900" pageHeight="600"><root>' +
  '<mxCell id="0"/><mxCell id="1" parent="0"/>' +
  '<mxCell id="node-a" value="A" style="rounded=1" vertex="1" parent="1"><mxGeometry x="20" y="30" width="120" height="60" as="geometry"/></mxCell>' +
  '<mxCell id="node-b" value="B" style="rounded=1" vertex="1" parent="1"><mxGeometry x="220" y="30" width="120" height="60" as="geometry"/></mxCell>' +
  '<mxCell id="edge-a" value="flow" edge="1" parent="1" source="node-a" target="node-b"><mxGeometry relative="1" as="geometry"/></mxCell>' +
  '<object label="wrapped edge"><mxCell id="edge-b" edge="1" parent="1" source="node-b" target="node-a"><mxGeometry relative="1" as="geometry"/></mxCell></object>' +
  '</root></mxGraphModel>';

test("clearDrawioConnections removes raw edge cells and preserves nodes", () => {
  const result = clearDrawioConnections(modelXml);

  assert.equal(result.removedCount, 2);
  assert.doesNotMatch(result.xml, /edge="1"/);
  assert.doesNotMatch(result.xml, /wrapped edge/);
  assert.match(result.xml, /id="node-a"/);
  assert.match(result.xml, /style="rounded=1"/);
  assert.equal(clearDrawioConnections(result.xml).removedCount, 0);
});

test("removeDrawioConnection deletes only the selected complete edge cell", () => {
  const result = removeDrawioConnection(modelXml, "edge-a");

  assert.equal(result.removedCount, 1);
  assert.doesNotMatch(result.xml, /id="edge-a"/);
  assert.doesNotMatch(result.xml, /value="flow"/);
  assert.match(result.xml, /id="edge-b"/);
  assert.match(result.xml, /id="node-a"/);
  assert.equal(removeDrawioConnection(result.xml, "edge-a").removedCount, 0);
});

test("clearDrawioConnections handles entity-encoded Draw.io diagrams", () => {
  const encodedModel = modelXml
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const input = `<mxfile><diagram id="page-1">${encodedModel}</diagram></mxfile>`;
  const result = clearDrawioConnections(input);

  assert.equal(result.removedCount, 2);
  assert.match(result.xml, /<diagram id="page-1">&lt;mxGraphModel/);
  assert.equal(clearDrawioConnections(result.xml).removedCount, 0);
});

test("clearDrawioConnections handles compressed .drawio diagram bodies", () => {
  const compressed = Buffer.from(
    deflateSync(strToU8(encodeURIComponent(modelXml))),
  ).toString("base64");
  const input = `<mxfile compressed="true"><diagram id="page-1">${compressed}</diagram></mxfile>`;
  const result = clearDrawioConnections(input);

  assert.equal(result.removedCount, 2);
  assert.match(result.xml, /<mxfile compressed="true">/);
  assert.equal(clearDrawioConnections(result.xml).removedCount, 0);
});

test("draw.io plans preserve dashed arrow appearance independently from feedback semantics", () => {
  const xml = diagramPlanToDrawioXml({
    title: "Arrow edit",
    width: 800,
    height: 400,
    nodes: [
      { id: "a", label: "A", role: "process", x: 20, y: 30, w: 120, h: 60 },
      { id: "b", label: "B", role: "process", x: 220, y: 30, w: 120, h: 60 },
    ],
    edges: [
      { id: "e1", from: "b", to: "a", kind: "flow", lineStyle: "dashed" },
    ],
  });
  assert.match(xml, /lineStyle="dashed"/);
  assert.match(xml, /dashed=1/);
  assert.match(xml, /kind="flow"/);
  assert.match(xml, /source="b" target="a"/);
});

test("Preview reconstructs an orthogonal route when draw.io stores only automatic routing", () => {
  const route = routeOrthogonalPreviewEdge({
    source: { id: "a", x: 20, y: 40, w: 120, h: 60 },
    target: { id: "b", x: 360, y: 180, w: 120, h: 60 },
    width: 600,
    height: 360,
  });

  assert.equal(route.sourcePort, "east");
  assert.equal(route.targetPort, "west");
  assert.deepEqual(route.points[0], { x: 140, y: 70 });
  assert.deepEqual(route.points.at(-1), { x: 360, y: 210 });
  assert.equal(
    route.points.slice(1).every((point, index) =>
      point.x === route.points[index].x || point.y === route.points[index].y),
    true,
  );
});

test("Preview orthogonal fallback avoids an intervening module", () => {
  const obstacle = { id: "middle", x: 180, y: 70, w: 80, h: 100 };
  const route = routeOrthogonalPreviewEdge({
    source: { id: "a", x: 0, y: 100, w: 120, h: 60 },
    target: { id: "b", x: 400, y: 100, w: 120, h: 60 },
    obstacles: [obstacle],
    width: 600,
    height: 300,
  });

  const crossesObstacle = route.points.slice(1).some((point, index) => {
    const previous = route.points[index];
    if (previous.y === point.y) {
      return previous.y > obstacle.y && previous.y < obstacle.y + obstacle.h &&
        Math.max(Math.min(previous.x, point.x), obstacle.x) <
          Math.min(Math.max(previous.x, point.x), obstacle.x + obstacle.w);
    }
    return previous.x > obstacle.x && previous.x < obstacle.x + obstacle.w &&
      Math.max(Math.min(previous.y, point.y), obstacle.y) <
        Math.min(Math.max(previous.y, point.y), obstacle.y + obstacle.h);
  });
  assert.equal(crossesObstacle, false);
  assert.equal(route.points.some((point) => point.y < obstacle.y || point.y > obstacle.y + obstacle.h), true);
});

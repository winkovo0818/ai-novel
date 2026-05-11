import { describe, it, expect } from "vitest";

import type { Character } from "@/lib/validation/schemas";

import {
  extractRelationEdges,
  circularLayout,
  insetSegment,
} from "./relations";

function buildChar(overrides: Partial<Character> & { name: string }): Character {
  return {
    role: "protagonist",
    age: 25,
    appearance: "x",
    personality: "x",
    catchphrase: "x",
    abilities: ["x"],
    goals: "x",
    motivation: "x",
    secrets: ["x"],
    relations: [],
    ...overrides,
  } as Character;
}

describe("extractRelationEdges", () => {
  it("emits a directed edge when a relation string contains another character's name", () => {
    const result = extractRelationEdges([
      buildChar({ name: "Alice", relations: ["Bob 的姐姐"] }),
      buildChar({ name: "Bob", relations: [] }),
    ]);
    expect(result.edges).toEqual([
      { fromName: "Alice", toName: "Bob", label: "Bob 的姐姐" },
    ]);
    expect(result.unmatched).toEqual([]);
  });

  it("emits multiple edges when one relation mentions several characters", () => {
    const result = extractRelationEdges([
      buildChar({ name: "Alice", relations: ["与 Bob 和 Carol 联盟"] }),
      buildChar({ name: "Bob" }),
      buildChar({ name: "Carol" }),
    ]);
    expect(result.edges.map((e) => e.toName).sort()).toEqual(["Bob", "Carol"]);
  });

  it("does not emit a self-loop when a character mentions their own name", () => {
    const result = extractRelationEdges([
      buildChar({ name: "Alice", relations: ["Alice 是孤儿"] }),
    ]);
    expect(result.edges).toEqual([]);
    expect(result.unmatched).toEqual([{ fromName: "Alice", relation: "Alice 是孤儿" }]);
  });

  it("collects relations with no recognised character into unmatched", () => {
    const result = extractRelationEdges([
      buildChar({ name: "Alice", relations: ["神秘的过去"] }),
      buildChar({ name: "Bob" }),
    ]);
    expect(result.edges).toEqual([]);
    expect(result.unmatched).toEqual([
      { fromName: "Alice", relation: "神秘的过去" },
    ]);
  });

  it("skips empty / whitespace-only relations", () => {
    const result = extractRelationEdges([
      buildChar({ name: "Alice", relations: ["", "   ", "Bob 的好友"] }),
      buildChar({ name: "Bob" }),
    ]);
    expect(result.edges).toHaveLength(1);
    expect(result.unmatched).toEqual([]);
  });

  it("trims surrounding whitespace before matching", () => {
    const result = extractRelationEdges([
      buildChar({ name: "Alice", relations: ["  Bob 的对手  "] }),
      buildChar({ name: "Bob" }),
    ]);
    expect(result.edges[0].label).toBe("Bob 的对手");
  });
});

describe("circularLayout", () => {
  it("returns an empty array for zero nodes", () => {
    expect(circularLayout(0, 100, 50, 50)).toEqual([]);
  });

  it("places the first node at 12 o'clock (top)", () => {
    const [first] = circularLayout(4, 100, 100, 100);
    expect(first.x).toBeCloseTo(100);
    expect(first.y).toBeCloseTo(0);
  });

  it("distributes 4 nodes evenly: top → right → bottom → left", () => {
    const pts = circularLayout(4, 100, 0, 0);
    expect(pts[0].x).toBeCloseTo(0);
    expect(pts[0].y).toBeCloseTo(-100);
    expect(pts[1].x).toBeCloseTo(100);
    expect(pts[1].y).toBeCloseTo(0);
    expect(pts[2].x).toBeCloseTo(0);
    expect(pts[2].y).toBeCloseTo(100);
    expect(pts[3].x).toBeCloseTo(-100);
    expect(pts[3].y).toBeCloseTo(0);
  });
});

describe("insetSegment", () => {
  it("pulls both endpoints inward along the segment", () => {
    const { start, end } = insetSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(start.x).toBeCloseTo(10);
    expect(end.x).toBeCloseTo(90);
  });

  it("handles a degenerate zero-length segment by returning inputs", () => {
    const { start, end } = insetSegment({ x: 5, y: 5 }, { x: 5, y: 5 }, 10);
    expect(start).toEqual({ x: 5, y: 5 });
    expect(end).toEqual({ x: 5, y: 5 });
  });

  it("respects diagonal direction", () => {
    const { start } = insetSegment({ x: 0, y: 0 }, { x: 3, y: 4 }, 5);
    // unit vector is (0.6, 0.8), inset 5 → moves to (3, 4)
    expect(start.x).toBeCloseTo(3);
    expect(start.y).toBeCloseTo(4);
  });
});

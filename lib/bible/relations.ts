import type { Character } from "@/lib/validation/schemas";

export interface RelationEdge {
  fromName: string;
  toName: string;
  /** The full relation text from the character that mentioned the target. */
  label: string;
}

export interface UnmatchedRelation {
  fromName: string;
  relation: string;
}

export interface RelationGraph {
  edges: RelationEdge[];
  unmatched: UnmatchedRelation[];
}

/**
 * Walk every character's `relations` array and synthesize edges by checking
 * which *other* character names appear as substrings inside each relation
 * string. Relations that don't mention any known character become entries
 * in `unmatched` so the UI can list them on the source node's card.
 *
 * Substring matching is intentional — relation strings are free-form
 * ("Alice 的妹妹", "Bob 的死对头") and the bible enforces 3-8 distinct
 * characters per book, so name collisions are rare in practice.
 */
export function extractRelationEdges(characters: Character[]): RelationGraph {
  const names = characters.map((c) => c.name);
  const edges: RelationEdge[] = [];
  const unmatched: UnmatchedRelation[] = [];

  for (const c of characters) {
    for (const relation of c.relations) {
      const trimmed = relation.trim();
      if (!trimmed) continue;
      const found = names.filter((n) => n !== c.name && trimmed.includes(n));
      if (found.length === 0) {
        unmatched.push({ fromName: c.name, relation: trimmed });
        continue;
      }
      for (const target of found) {
        edges.push({ fromName: c.name, toName: target, label: trimmed });
      }
    }
  }

  return { edges, unmatched };
}

export interface NodePosition {
  x: number;
  y: number;
}

/**
 * Place N points around a circle of `radius` centered at (cx, cy). Start at
 * 12 o'clock so the first character (which is always the protagonist per
 * BibleDraft schema) lands at the top.
 */
export function circularLayout(
  n: number,
  radius: number,
  cx: number,
  cy: number,
): NodePosition[] {
  if (n <= 0) return [];
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });
}

/**
 * Trim a line segment back from each endpoint by `inset` units so an edge
 * drawn between two circular nodes stops at the node boundary instead of
 * the center. Returns the new start + end points.
 */
export function insetSegment(
  from: NodePosition,
  to: NodePosition,
  inset: number,
): { start: NodePosition; end: NodePosition } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { start: from, end: to };
  const ux = dx / dist;
  const uy = dy / dist;
  return {
    start: { x: from.x + ux * inset, y: from.y + uy * inset },
    end: { x: to.x - ux * inset, y: to.y - uy * inset },
  };
}

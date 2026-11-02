import type { MathNode, Operator, OperatorClass, Row } from "./ast";

export const row = (...children: MathNode[]): Row => ({ kind: "row", children });

export const isRowEmpty = (r: Row | undefined): boolean => !r || r.children.length === 0;

/** Wraps a node in a Row unless it already is one. */
export const asRow = (node: MathNode): Row => (node.kind === "row" ? node : row(node));

export const op = (text: string, opClass: OperatorClass): Operator => ({ kind: "operator", text, opClass });

/** Nodes that become a single text run in OMML (as opposed to a structure). */
export const isRunNode = (n: MathNode): boolean =>
  n.kind === "ident" || n.kind === "number" || n.kind === "operator" || n.kind === "text" || n.kind === "space";

/** Depth-first walk over every node (including Rows). */
export function walk(node: MathNode, visit: (n: MathNode) => void): void {
  visit(node);
  for (const child of childRows(node)) walk(child, visit);
  if (node.kind === "row") for (const c of node.children) walk(c, visit);
}

/** All Row slots directly owned by a node (not including a Row's own children). */
export function childRows(node: MathNode): Row[] {
  const out: Row[] = [];
  const add = (r: Row | undefined) => {
    if (r) out.push(r);
  };
  switch (node.kind) {
    case "fraction":
      add(node.num);
      add(node.den);
      break;
    case "scripts":
    case "prescripts":
      add(node.base);
      add(node.sub);
      add(node.sup);
      break;
    case "radical":
      add(node.index);
      add(node.body);
      break;
    case "nary":
      add(node.sub);
      add(node.sup);
      add(node.body);
      break;
    case "delimited":
      node.parts.forEach(add);
      break;
    case "function":
      add(node.sub);
      add(node.sup);
      add(node.arg);
      break;
    case "accent":
    case "boxed":
      add(node.body);
      break;
    case "stack":
      add(node.body);
      add(node.annotation);
      break;
    case "matrix":
    case "cases":
    case "aligned":
      node.rows.forEach((r) => r.forEach(add));
      break;
    default:
      break;
  }
  return out;
}

/** Number of nodes in the tree; handy for tests and performance budgets. */
export function countNodes(node: MathNode): number {
  let n = 0;
  walk(node, () => n++);
  return n;
}

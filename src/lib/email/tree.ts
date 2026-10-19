import { uid, type Block, type ChildBlock } from "./design";

type AnyBlock = Block | ChildBlock;

/** Apply `fn` to the block with `id`, wherever it lives (top level or inside columns). */
export function updateBlock(blocks: Block[], id: string, fn: (b: AnyBlock) => AnyBlock): Block[] {
  return blocks.map((b) => {
    if (b.id === id) return fn(b) as Block;
    if (b.type === "columns") {
      return { ...b, columns: b.columns.map((col) => col.map((c) => (c.id === id ? (fn(c) as ChildBlock) : c))) };
    }
    return b;
  });
}

export function removeBlock(blocks: Block[], id: string): Block[] {
  return blocks
    .filter((b) => b.id !== id)
    .map((b) => (b.type === "columns" ? { ...b, columns: b.columns.map((col) => col.filter((c) => c.id !== id)) } : b));
}

export function findBlock(blocks: Block[], id: string | null): { block: AnyBlock; parentId: string | null; col: number } | null {
  if (!id) return null;
  for (const b of blocks) {
    if (b.id === id) return { block: b, parentId: null, col: -1 };
    if (b.type === "columns") {
      for (let i = 0; i < b.columns.length; i++) {
        const c = b.columns[i].find((x) => x.id === id);
        if (c) return { block: c, parentId: b.id, col: i };
      }
    }
  }
  return null;
}

const reid = <T extends AnyBlock>(b: T): T =>
  b.type === "columns"
    ? ({ ...b, id: uid(), columns: b.columns.map((col) => col.map((c) => ({ ...c, id: uid() }))) } as T)
    : { ...b, id: uid() };

export function duplicateBlock(blocks: Block[], id: string): { blocks: Block[]; newId: string | null } {
  let newId: string | null = null;
  const out: Block[] = [];
  for (const b of blocks) {
    out.push(b);
    if (b.id === id) {
      const copy = reid(b);
      newId = copy.id;
      out.push(copy);
    } else if (b.type === "columns" && !newId) {
      const cols = b.columns.map((col) => {
        const next: ChildBlock[] = [];
        for (const c of col) {
          next.push(c);
          if (c.id === id) {
            const copy = reid(c);
            newId = copy.id;
            next.push(copy);
          }
        }
        return next;
      });
      out[out.length - 1] = { ...b, columns: cols };
    }
  }
  return { blocks: out, newId };
}

/** Move a block up/down within its own list (top level or its column). */
export function moveBlock(blocks: Block[], id: string, dir: -1 | 1): Block[] {
  const shift = <T extends { id: string }>(list: T[]) => {
    const i = list.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const copy = [...list];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  };
  if (blocks.some((b) => b.id === id)) return shift(blocks);
  return blocks.map((b) => (b.type === "columns" ? { ...b, columns: b.columns.map((col) => shift(col)) } : b));
}

/** Insert after the selected top-level block (or its parent columns block), else at the end. */
export function insertBlock(blocks: Block[], block: Block, afterId: string | null): Block[] {
  const loc = findBlock(blocks, afterId);
  const anchor = loc ? loc.parentId ?? loc.block.id : null;
  const i = anchor ? blocks.findIndex((b) => b.id === anchor) : -1;
  if (i < 0) return [...blocks, block];
  return [...blocks.slice(0, i + 1), block, ...blocks.slice(i + 1)];
}

export function addToColumn(blocks: Block[], columnsId: string, col: number, child: ChildBlock): Block[] {
  return blocks.map((b) =>
    b.id === columnsId && b.type === "columns"
      ? { ...b, columns: b.columns.map((c, i) => (i === col ? [...c, child] : c)) }
      : b,
  );
}

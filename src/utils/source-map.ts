import type { Position, SourceSpan } from "../api/types";

export interface SourceMapIndex {
  readonly code: string;
  readonly lineStartOffsets: readonly number[];
}

export function buildSourceIndex(code: string): SourceMapIndex {
  const lineStartOffsets: number[] = [0];
  for (let i = 0; i < code.length; i += 1) {
    if (code[i] === "\n") {
      lineStartOffsets.push(i + 1);
    }
  }

  return { code, lineStartOffsets };
}

export function positionAt(index: SourceMapIndex, offset: number): Position {
  const boundedOffset = Math.max(0, Math.min(offset, index.code.length));

  let low = 0;
  let high = index.lineStartOffsets.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    const startOffset = index.lineStartOffsets[mid];
    if (startOffset !== undefined && startOffset <= boundedOffset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const lineStart = index.lineStartOffsets[low] ?? 0;
  return {
    offset: boundedOffset,
    line: low + 1,
    column: boundedOffset - lineStart + 1
  };
}

export function offsetAt(index: SourceMapIndex, line: number, column: number): number {
  const boundedLine = Math.max(1, Math.min(line, index.lineStartOffsets.length));
  const lineStart = index.lineStartOffsets[boundedLine - 1] ?? 0;
  const lineEnd = index.lineStartOffsets[boundedLine] ?? index.code.length;
  const maxColumn = Math.max(1, lineEnd - lineStart + 1);
  const boundedColumn = Math.max(1, Math.min(column, maxColumn));
  return lineStart + boundedColumn - 1;
}

export function spanAt(index: SourceMapIndex, start: number, end: number): SourceSpan {
  const safeStart = Math.max(0, Math.min(start, index.code.length));
  const safeEnd = Math.max(safeStart, Math.min(end, index.code.length));
  return {
    start: positionAt(index, safeStart),
    end: positionAt(index, safeEnd)
  };
}

export function spanForLine(index: SourceMapIndex, line: number): SourceSpan {
  const boundedLine = Math.max(1, Math.min(line, index.lineStartOffsets.length));
  const lineStart = index.lineStartOffsets[boundedLine - 1] ?? 0;
  const lineEnd = index.lineStartOffsets[boundedLine] ?? index.code.length;
  return spanAt(index, lineStart, lineEnd);
}

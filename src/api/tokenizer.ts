import type { SourceSpan, SyntaxToken, SyntaxTokenKind } from "./types";
import { buildSourceIndex, spanAt } from "../utils/source-map";

const BARLINE_PATTERNS: readonly string[] = [":||:", "||:", ":||", "||.", "||", "|", "./|/.", "./."];
const CHORD_ROOT_PATTERN = /^[A-G](?:b|#)?/;
const DURATION_PATTERN = /^:\d+(?:\.?\d+)?(?:\.)?$/;

interface CursorState {
  readonly source: string;
  readonly lineOffset: number;
}

function createToken(kind: SyntaxTokenKind, lexeme: string, span: SourceSpan): SyntaxToken {
  return { kind, lexeme, span };
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\t";
}

function classifyDirectiveValue(rawValue: string): SyntaxTokenKind {
  if (rawValue.length === 0) {
    return "directive-value";
  }
  if (rawValue.startsWith("\"") || rawValue.startsWith("'") || rawValue.startsWith("`")) {
    return "string";
  }
  if (/^-?\d+(?:\.\d+)?$/.test(rawValue)) {
    return "number";
  }
  return "directive-value";
}

function readUntilDelimiter(text: string, from: number): number {
  let cursor = from;
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === undefined) {
      break;
    }
    if (isWhitespace(char) || char === "|" || char === "[" || char === "]" || char === "%" || char === ",") {
      break;
    }
    cursor += 1;
  }
  return cursor;
}

function createAbsoluteSpan(
  sourceIndex: ReturnType<typeof buildSourceIndex>,
  start: number,
  end: number
): SourceSpan {
  return spanAt(sourceIndex, start, end);
}

function pushToken(
  tokens: SyntaxToken[],
  sourceIndex: ReturnType<typeof buildSourceIndex>,
  kind: SyntaxTokenKind,
  lexeme: string,
  start: number,
  end: number
): void {
  tokens.push(createToken(kind, lexeme, createAbsoluteSpan(sourceIndex, start, end)));
}

function tokenizeLine(
  state: CursorState,
  sourceIndex: ReturnType<typeof buildSourceIndex>,
  output: SyntaxToken[]
): void {
  const text = state.source;
  let cursor = 0;

  while (cursor < text.length && isWhitespace(text[cursor] ?? "")) {
    cursor += 1;
  }

  if (cursor >= text.length) {
    return;
  }

  if (text[cursor] === "#") {
    pushToken(
      output,
      sourceIndex,
      "comment",
      text.slice(cursor),
      state.lineOffset + cursor,
      state.lineOffset + text.length
    );
    return;
  }

  if (text.startsWith("//", cursor)) {
    pushToken(
      output,
      sourceIndex,
      "comment",
      text.slice(cursor),
      state.lineOffset + cursor,
      state.lineOffset + text.length
    );
    return;
  }

  const sectionMatch = text.slice(cursor).match(/^\[([^\]]*)\]/);
  if (sectionMatch !== null) {
    const sectionLexeme = sectionMatch[0];
    pushToken(
      output,
      sourceIndex,
      "section",
      sectionLexeme,
      state.lineOffset + cursor,
      state.lineOffset + cursor + sectionLexeme.length
    );
    cursor += sectionLexeme.length;
  }

  const directiveMatch = text.slice(cursor).match(/^%([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (directiveMatch !== null) {
    const directiveName = `%${directiveMatch[1] ?? ""}`;
    const directiveStart = state.lineOffset + cursor;
    pushToken(output, sourceIndex, "directive", directiveName, directiveStart, directiveStart + directiveName.length);
    const equalOffset = text.indexOf("=", cursor);
    if (equalOffset >= 0) {
      pushToken(output, sourceIndex, "operator", "=", state.lineOffset + equalOffset, state.lineOffset + equalOffset + 1);
      const valueStart = equalOffset + 1;
      const rawValue = text.slice(valueStart).trim();
      if (rawValue.length > 0) {
        const absoluteStart = state.lineOffset + text.indexOf(rawValue, valueStart);
        pushToken(
          output,
          sourceIndex,
          classifyDirectiveValue(rawValue),
          rawValue,
          absoluteStart,
          absoluteStart + rawValue.length
        );
      }
    }
    return;
  }

  while (cursor < text.length) {
    const current = text[cursor];
    if (current === undefined) {
      break;
    }

    if (isWhitespace(current)) {
      cursor += 1;
      continue;
    }

    const matchedBarline = BARLINE_PATTERNS.find((pattern) => text.startsWith(pattern, cursor));
    if (matchedBarline !== undefined) {
      const kind: SyntaxTokenKind = matchedBarline.includes(":") ? "repeat" : "barline";
      pushToken(
        output,
        sourceIndex,
        kind,
        matchedBarline,
        state.lineOffset + cursor,
        state.lineOffset + cursor + matchedBarline.length
      );
      cursor += matchedBarline.length;
      continue;
    }

    if (current === "~") {
      pushToken(output, sourceIndex, "tie", current, state.lineOffset + cursor, state.lineOffset + cursor + 1);
      cursor += 1;
      continue;
    }

    if (current === "'" || current === "\"" || current === "`") {
      const quote = current;
      let end = cursor + 1;
      while (end < text.length) {
        const c = text[end];
        if (c === undefined) {
          break;
        }
        if (c === quote) {
          end += 1;
          break;
        }
        end += 1;
      }
      pushToken(
        output,
        sourceIndex,
        "string",
        text.slice(cursor, end),
        state.lineOffset + cursor,
        state.lineOffset + end
      );
      cursor = end;
      continue;
    }

    const chunkEnd = readUntilDelimiter(text, cursor);
    const lexeme = text.slice(cursor, chunkEnd);
    if (lexeme.length === 0) {
      cursor += 1;
      continue;
    }

    if (/^r(?::\d+(?:\.?\d+)?(?:\.)?)?$/i.test(lexeme)) {
      const durationMatch = lexeme.match(/:\d+(?:\.?\d+)?(?:\.)?$/);
      const restHeadLength = durationMatch === null ? lexeme.length : lexeme.length - durationMatch[0].length;
      pushToken(
        output,
        sourceIndex,
        "rest",
        lexeme.slice(0, restHeadLength),
        state.lineOffset + cursor,
        state.lineOffset + cursor + restHeadLength
      );
      if (durationMatch !== null) {
        pushToken(
          output,
          sourceIndex,
          "duration",
          durationMatch[0],
          state.lineOffset + cursor + restHeadLength,
          state.lineOffset + cursor + lexeme.length
        );
      }
      cursor = chunkEnd;
      continue;
    }

    if (CHORD_ROOT_PATTERN.test(lexeme)) {
      const durationIndex = lexeme.lastIndexOf(":");
      const chordSegment = durationIndex >= 0 ? lexeme.slice(0, durationIndex) : lexeme;
      const durationSegment = durationIndex >= 0 ? lexeme.slice(durationIndex) : "";
      const chordStart = cursor;

      const rootMatch = chordSegment.match(CHORD_ROOT_PATTERN);
      const rootLexeme = rootMatch?.[0] ?? "";
      if (rootLexeme.length > 0) {
        pushToken(
          output,
          sourceIndex,
          "chord-root",
          rootLexeme,
          state.lineOffset + chordStart,
          state.lineOffset + chordStart + rootLexeme.length
        );
      }

      const slashIndex = chordSegment.indexOf("/");
      const qualityEnd = slashIndex >= 0 ? slashIndex : chordSegment.length;
      const qualityLexeme = chordSegment.slice(rootLexeme.length, qualityEnd);
      if (qualityLexeme.length > 0) {
        pushToken(
          output,
          sourceIndex,
          "chord-quality",
          qualityLexeme,
          state.lineOffset + chordStart + rootLexeme.length,
          state.lineOffset + chordStart + qualityEnd
        );
      }

      if (slashIndex >= 0) {
        const bassLexeme = chordSegment.slice(slashIndex + 1);
        if (bassLexeme.length > 0) {
          pushToken(
            output,
            sourceIndex,
            "chord-bass",
            bassLexeme,
            state.lineOffset + chordStart + slashIndex + 1,
            state.lineOffset + chordStart + chordSegment.length
          );
        }
      }

      if (durationSegment.length > 0 && DURATION_PATTERN.test(durationSegment)) {
        pushToken(
          output,
          sourceIndex,
          "duration",
          durationSegment,
          state.lineOffset + chordStart + durationIndex,
          state.lineOffset + chordStart + lexeme.length
        );
      }

      cursor = chunkEnd;
      continue;
    }

    if (/^\d+(?:\/\d+)?$/.test(lexeme)) {
      pushToken(output, sourceIndex, "number", lexeme, state.lineOffset + cursor, state.lineOffset + chunkEnd);
      cursor = chunkEnd;
      continue;
    }

    pushToken(output, sourceIndex, "text", lexeme, state.lineOffset + cursor, state.lineOffset + chunkEnd);
    cursor = chunkEnd;
  }
}

export function tokenizeFumen(code: string): readonly SyntaxToken[] {
  const normalizedCode = code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const sourceIndex = buildSourceIndex(normalizedCode);
  const tokens: SyntaxToken[] = [];
  const lines = normalizedCode.split("\n");
  const lineOffsets: number[] = [];

  let currentOffset = 0;
  for (const line of lines) {
    lineOffsets.push(currentOffset);
    currentOffset += line.length + 1;
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const lineOffset = lineOffsets[lineIndex] ?? 0;
    tokenizeLine(
      {
        source: line,
        lineOffset
      },
      sourceIndex,
      tokens
    );
  }

  return tokens;
}

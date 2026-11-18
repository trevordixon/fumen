import { Parser as LegacyParser } from "../parser/parser";
import type {
  ParseMode,
  ParseOptions,
  ParseResult,
  ParserDiagnostic,
  ParserDiagnosticRelatedInfo,
  SourceSpan,
  SyntaxToken,
  TrackLike
} from "./types";
import { buildSourceIndex, spanAt, spanForLine } from "../utils/source-map";
import { tokenizeFumen } from "./tokenizer";

const DIAGNOSTIC_SOURCE = "fumen";

interface LegacyErrorMeta {
  readonly code?: string;
  readonly message?: string;
  readonly line?: number;
  readonly column?: number;
}

interface LegacyParserLike {
  parse(code: string): TrackLike | null;
  readonly lastError?: LegacyErrorMeta | null;
}

interface LegacyCallbackError {
  readonly message: string;
  readonly meta: LegacyErrorMeta | null;
}

const legacyCodeMap: Readonly<Record<string, string>> = {
  ERROR_WHILE_PARSE_MOST_OUTSIDER: "FUMEN001",
  ERROR_WHILE_PARSING_PLAIN_STRING: "FUMEN002",
  INVALID_TOKEN_DETECTED: "FUMEN003",
  INVALID_CODE_DETECTED_AFTER_BACK_SLASH: "FUMEN004",
  ERROR_WHILE_PARSE_VARIABLE: "FUMEN005",
  ERROR_WHILE_PARSE_VARIABLE_VALUE: "FUMEN006",
  ERROR_WHILE_PARSE_MEASURE: "FUMEN007",
  ERROR_WHILE_PARSE_MEASURES: "FUMEN008"
};

function normalizeCode(rawCode: string): string {
  return rawCode.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeParserErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown parser error";
}

function extractLineFromMessage(message: string): number | null {
  const match = message.match(/line\s*(\d+)/i);
  if (match === null) {
    return null;
  }
  const lineValue = match[1];
  if (lineValue === undefined || lineValue.length === 0) {
    return null;
  }
  const lineNum = Number.parseInt(lineValue, 10);
  return Number.isFinite(lineNum) && lineNum > 0 ? lineNum : null;
}

function normalizeLegacyCode(input: string | undefined): string {
  if (input === undefined || input.length === 0) {
    return "FUMEN000";
  }
  return legacyCodeMap[input] ?? "FUMEN000";
}

function spanFromLegacyMeta(code: string, meta: LegacyErrorMeta | null, fallbackMessage: string): SourceSpan {
  const sourceIndex = buildSourceIndex(code);
  const lineFromMeta = meta?.line;
  if (lineFromMeta !== undefined) {
    return spanForLine(sourceIndex, lineFromMeta);
  }

  const lineFromMessage = extractLineFromMessage(fallbackMessage);
  if (lineFromMessage !== null) {
    return spanForLine(sourceIndex, lineFromMessage);
  }

  return spanAt(sourceIndex, 0, Math.min(1, code.length));
}

function buildLegacyDiagnostic(
  code: string,
  parserMessage: string,
  meta: LegacyErrorMeta | null,
  related: readonly ParserDiagnosticRelatedInfo[]
): ParserDiagnostic {
  return {
    code: normalizeLegacyCode(meta?.code),
    severity: "error",
    message: parserMessage,
    span: spanFromLegacyMeta(code, meta, parserMessage),
    related
  };
}

interface UnterminatedString {
  readonly quote: string;
  readonly index: number;
}

// Scans a line once, tracking which delimiter is currently open, and reports a string that
// is still open at end of line. Checking each quote character independently (the previous
// behaviour) mis-read any quote nested inside a differently-quoted string: `"Don't stop"`
// looked like an unterminated `'` literal, so valid text containing an apostrophe was
// rejected by strict parsing. Backslash escapes are honoured, matching the tokenizer.
function unterminatedStringOnLine(line: string): UnterminatedString | null {
  let openQuote: string | null = null;
  let openIndex = -1;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === undefined) {
      break;
    }
    if (openQuote !== null && ch === "\\") {
      const next = i + 1 < line.length ? line[i + 1] : undefined;
      if (next === openQuote || next === "\\") {
        i += 1;
      }
      continue;
    }
    if (openQuote === null) {
      if (ch === "\"" || ch === "'" || ch === "`") {
        openQuote = ch;
        openIndex = i;
      }
      continue;
    }
    if (ch === openQuote) {
      openQuote = null;
      openIndex = -1;
    }
  }
  return openQuote === null ? null : { quote: openQuote, index: openIndex };
}

function scanLineDiagnostics(code: string): readonly ParserDiagnostic[] {
  const diagnostics: ParserDiagnostic[] = [];
  const lines = code.split("\n");
  const sourceIndex = buildSourceIndex(code);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const lineNumber = lineIndex + 1;
    const trimmed = line.trim();

    if (trimmed.startsWith("%") && !trimmed.includes("=")) {
      diagnostics.push({
        code: "FUMEN010",
        severity: "error",
        message: "Directive is missing '=' assignment",
        span: spanForLine(sourceIndex, lineNumber)
      });
    }

    if (trimmed.startsWith("[") && !trimmed.includes("]")) {
      diagnostics.push({
        code: "FUMEN011",
        severity: "error",
        message: "Section header is missing closing ']'",
        span: spanForLine(sourceIndex, lineNumber)
      });
    }

    const unterminated = unterminatedStringOnLine(line);
    if (unterminated !== null) {
      const absoluteStart = (sourceIndex.lineStartOffsets[lineIndex] ?? 0) + unterminated.index;
      diagnostics.push({
        code: "FUMEN012",
        severity: "error",
        message: `Unterminated ${unterminated.quote} string literal`,
        span: spanAt(sourceIndex, absoluteStart, absoluteStart + 1)
      });
    }
  }

  return diagnostics;
}

function dedupeDiagnostics(diagnostics: readonly ParserDiagnostic[]): readonly ParserDiagnostic[] {
  const seen = new Set<string>();
  const unique: ParserDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.code,
      diagnostic.message,
      diagnostic.span.start.offset,
      diagnostic.span.end.offset
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(diagnostic);
  }
  return unique;
}

function parseWithLegacy(code: string): {
  readonly track: TrackLike | null;
  readonly callbackErrors: readonly LegacyCallbackError[];
  readonly thrownMessage: string | null;
  readonly lastError: LegacyErrorMeta | null;
} {
  const callbackErrors: LegacyCallbackError[] = [];
  const parser = new LegacyParser(
    (message: string, meta?: LegacyErrorMeta) => {
      callbackErrors.push({
        message,
        meta: meta ?? null
      });
    },
    { silentErrors: true }
  ) as LegacyParserLike;

  let track: TrackLike | null = null;
  let thrownMessage: string | null = null;

  try {
    track = parser.parse(code);
  } catch (error: unknown) {
    thrownMessage = normalizeParserErrorMessage(error);
  }

  return {
    track,
    callbackErrors,
    thrownMessage,
    lastError: parser.lastError ?? null
  };
}

function findLargestValidPrefixTrack(code: string): TrackLike | null {
  const lines = code.split("\n");
  let bestTrack: TrackLike | null = null;
  let prefix = "";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    prefix = i === 0 ? line : `${prefix}\n${line}`;
    const parsed = parseWithLegacy(prefix);
    if (parsed.track !== null) {
      bestTrack = parsed.track;
    }
  }

  return bestTrack;
}

function collectDiagnostics(code: string, legacy: ReturnType<typeof parseWithLegacy>): readonly ParserDiagnostic[] {
  const staticDiagnostics = scanLineDiagnostics(code);
  const callbackDiagnostics = legacy.callbackErrors.map((entry) =>
    buildLegacyDiagnostic(code, entry.message, entry.meta, [])
  );

  if (callbackDiagnostics.length > 0) {
    return dedupeDiagnostics([...callbackDiagnostics, ...staticDiagnostics]);
  }

  if (legacy.lastError !== null) {
    return dedupeDiagnostics([
      buildLegacyDiagnostic(
        code,
        legacy.thrownMessage ?? legacy.lastError.message ?? "Unknown parser error",
        legacy.lastError,
        []
      ),
      ...staticDiagnostics
    ]);
  }

  if (legacy.thrownMessage !== null) {
    return dedupeDiagnostics([
      {
        code: "FUMEN000",
        severity: "error",
        message: legacy.thrownMessage,
        span: spanAt(buildSourceIndex(code), 0, Math.min(1, code.length))
      },
      ...staticDiagnostics
    ]);
  }

  return dedupeDiagnostics(staticDiagnostics);
}

// A chord whose root reads but whose rest doesn't ("Fzz", "Cmaj9#13b") still draws: the parser
// keeps it verbatim as text (Chord.is_valid_chord = false). That's rarely what was meant, so it's a
// warning at the chord. Quoted text and N.C. have no root and are never reported.
function collectUnreadableChords(node: unknown, names: Set<string>): void {
  if (typeof node !== "object" || node === null) {
    return;
  }
  const record = node as Record<string, unknown>;
  const name = record["chord_name_str"];
  if (record["is_valid_chord"] === false && record["is_no_chord"] !== true
    && typeof record["note_base"] === "string" && record["note_base"].length > 0
    && typeof name === "string" && name.length > 0) {
    names.add(name);
  }
  const children = record["childNodes"];
  if (Array.isArray(children)) {
    for (const child of children) {
      collectUnreadableChords(child, names);
    }
  }
}

const CHORD_PART_KINDS: ReadonlySet<string> = new Set(["chord-quality", "chord-bass"]);

function unreadableChordDiagnostics(code: string, track: TrackLike | null): readonly ParserDiagnostic[] {
  if (track === null) {
    return [];
  }
  const names = new Set<string>();
  collectUnreadableChords(track, names);
  if (names.size === 0) {
    return [];
  }
  // Where each one is: a chord root and the quality and bass right after it, as the editor colours them.
  const tokens = tokenizeFumen(code);
  const sourceIndex = buildSourceIndex(code);
  const diagnostics: ParserDiagnostic[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const root = tokens[i];
    if (root === undefined || root.kind !== "chord-root") {
      continue;
    }
    let end = root.span.end.offset;
    let next = tokens[i + 1];
    while (next !== undefined && CHORD_PART_KINDS.has(next.kind) && next.span.start.offset === end) {
      end = next.span.end.offset;
      i += 1;
      next = tokens[i + 1];
    }
    const text = code.slice(root.span.start.offset, end);
    if (names.has(text)) {
      diagnostics.push({
        code: "FUMEN020",
        severity: "warning",
        message: `Unreadable chord "${text}" is drawn as text`,
        span: spanAt(sourceIndex, root.span.start.offset, end)
      });
    }
  }
  return diagnostics;
}

function shouldEmitDiagnostics(options: ParseOptions): boolean {
  return options.emitDiagnostics !== false;
}

function resolveParseMode(options: ParseOptions): ParseMode {
  return options.mode ?? "tolerant";
}

export function parseWithDiagnostics(code: string, options: ParseOptions = {}): ParseResult {
  const normalizedCode = normalizeCode(code);
  const mode = resolveParseMode(options);
  const legacy = parseWithLegacy(normalizedCode);
  const diagnostics = shouldEmitDiagnostics(options)
    ? [...collectDiagnostics(normalizedCode, legacy), ...unreadableChordDiagnostics(normalizedCode, legacy.track)]
    : [];
  const hasError = diagnostics.some((diagnostic) => diagnostic.severity === "error");

  const strictTrack = legacy.track;
  const ast = strictTrack ?? (mode === "tolerant" ? findLargestValidPrefixTrack(normalizedCode) : null);

  const shouldIncludeTokens = options.includeTokens === true;
  const tokens: readonly SyntaxToken[] = shouldIncludeTokens ? tokenizeFumen(normalizedCode) : [];

  const baseResult: ParseResult = {
    ok: strictTrack !== null && !hasError,
    ast,
    track: strictTrack,
    diagnostics
  };

  if (shouldIncludeTokens) {
    return {
      ...baseResult,
      tokens
    };
  }

  return baseResult;
}

export function parseFumen(code: string, options: ParseOptions = {}): ParseResult {
  return parseWithDiagnostics(code, options);
}

export const parserDiagnosticSource = DIAGNOSTIC_SOURCE;

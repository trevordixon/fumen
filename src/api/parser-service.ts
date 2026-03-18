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

function firstUnescapedQuoteIndex(line: string, quote: string): number | null {
  let openIndex: number | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === undefined) {
      break;
    }
    if (ch !== quote) {
      continue;
    }
    const prev = i > 0 ? line[i - 1] : "";
    if (prev === "\\") {
      continue;
    }
    if (openIndex === null) {
      openIndex = i;
    } else {
      openIndex = null;
    }
  }
  return openIndex;
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

    const quoteChecks: readonly string[] = ["\"", "'", "`"];
    for (const quote of quoteChecks) {
      const startQuote = firstUnescapedQuoteIndex(line, quote);
      if (startQuote !== null) {
        const absoluteStart = (sourceIndex.lineStartOffsets[lineIndex] ?? 0) + startQuote;
        diagnostics.push({
          code: "FUMEN012",
          severity: "error",
          message: `Unterminated ${quote} string literal`,
          span: spanAt(sourceIndex, absoluteStart, absoluteStart + 1)
        });
        break;
      }
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
  const diagnostics = shouldEmitDiagnostics(options) ? collectDiagnostics(normalizedCode, legacy) : [];
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

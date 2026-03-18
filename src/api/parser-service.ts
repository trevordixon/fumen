import { Parser as LegacyParser } from "../parser/parser";
import type { ParseOptions, ParseResult, ParserDiagnostic } from "./types";
import { buildSourceIndex, spanAt } from "../utils/source-map";

const UNKNOWN_PARSER_ERROR = "PARSER_UNKNOWN";

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

function buildDiagnostic(
  code: string,
  parseErrorMessage: string,
  parserCallbackMessage: string | null
): ParserDiagnostic {
  const sourceIndex = buildSourceIndex(code);
  const effectiveMessage = parserCallbackMessage ?? parseErrorMessage;
  const lineFromMessage = extractLineFromMessage(effectiveMessage);

  if (lineFromMessage !== null && lineFromMessage <= sourceIndex.lineStartOffsets.length) {
    const lineStart = sourceIndex.lineStartOffsets[lineFromMessage - 1] ?? 0;
    const lineEnd =
      sourceIndex.lineStartOffsets[lineFromMessage] ?? sourceIndex.code.length;
    return {
      code: UNKNOWN_PARSER_ERROR,
      severity: "error",
      message: effectiveMessage,
      span: spanAt(sourceIndex, lineStart, lineEnd)
    };
  }

  return {
    code: UNKNOWN_PARSER_ERROR,
    severity: "error",
    message: effectiveMessage,
    span: spanAt(sourceIndex, 0, Math.min(code.length, 1))
  };
}

export function parseFumen(code: string, options: ParseOptions = {}): ParseResult {
  const parserMessages: string[] = [];
  const legacyParser = new LegacyParser((msg: string) => {
    parserMessages.push(msg);
  });

  let track: ParseResult["track"] = null;
  try {
    track = legacyParser.parse(code) as ParseResult["track"];
  } catch (error: unknown) {
    const parseErrorMessage = normalizeParserErrorMessage(error);
    const callbackMessage = parserMessages[0] ?? null;
    const diagnostics = options.emitDiagnostics === false
      ? []
      : [buildDiagnostic(code, parseErrorMessage, callbackMessage)];
    return {
      ok: false,
      track: null,
      diagnostics
    };
  }

  if (track === null) {
    const callbackMessage = parserMessages[0] ?? "Parser returned empty track";
    const diagnostics = options.emitDiagnostics === false
      ? []
      : [buildDiagnostic(code, callbackMessage, callbackMessage)];
    return {
      ok: false,
      track: null,
      diagnostics
    };
  }

  return {
    ok: true,
    track,
    diagnostics: []
  };
}

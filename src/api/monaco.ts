import { parseWithDiagnostics, parserDiagnosticSource } from "./parser-service";
import type {
  MonacoMarkerDataLike,
  MonacoNamespaceLike,
  ParseOptions,
  ParserDiagnostic
} from "./types";

const MONACO_LANGUAGE_ID = "fumen";

interface MonarchTokenizerState {
  readonly root: readonly (readonly [RegExp | string, string])[];
}

interface MonarchLanguage {
  readonly tokenizer: MonarchTokenizerState;
}

const fumenMonarchLanguage: MonarchLanguage = {
  tokenizer: {
    root: [
      [/^\s*\/\/.*$/, "comment"],
      [/^\s*#.*$/, "comment"],
      [/^\s*\[[^\]]*\]/, "section"],
      [/%[A-Za-z_][A-Za-z0-9_]*/, "directive"],
      [/=|@|:/, "operator"],
      [/\|\|:|:\|\|:|:\|\||\|\|\.|\|\||\||\.\/\|\/\.|\.\//, "barline"],
      [/\b[rR](?::\d+(?:\.?\d+)?(?:\.)?)?\b/, "rest"],
      [/[A-G](?:b|#)?/, "chord-root"],
      [/\/[A-G](?:b|#)?/, "chord-bass"],
      [/:\d+(?:\.?\d+)?(?:\.)?/, "duration"],
      [/~|\.|,/, "operator"],
      [/"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|`[^`\\]*(?:\\.[^`\\]*)*`/, "string"],
      [/\d+(?:\/\d+)?/, "number"],
      [/[A-Za-z_][\w+\-#()]*/, "text"]
    ]
  }
};

const fumenLanguageConfiguration = {
  comments: {
    lineComment: "//"
  },
  brackets: [
    ["[", "]"],
    ["(", ")"]
  ],
  autoClosingPairs: [
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: "\"", close: "\"" },
    { open: "'", close: "'" },
    { open: "`", close: "`" }
  ]
} as const;

function severityToMonacoLevel(severity: ParserDiagnostic["severity"]): number {
  if (severity === "error") {
    return 8;
  }
  if (severity === "warning") {
    return 4;
  }
  return 2;
}

function normalizeMarkerRange(diagnostic: ParserDiagnostic): MonacoMarkerDataLike {
  const startLineNumber = diagnostic.span.start.line;
  const startColumn = diagnostic.span.start.column;

  let endLineNumber = diagnostic.span.end.line;
  let endColumn = diagnostic.span.end.column;

  if (endLineNumber < startLineNumber) {
    endLineNumber = startLineNumber;
  }

  if (endLineNumber === startLineNumber && endColumn <= startColumn) {
    endColumn = startColumn + 1;
  }

  return {
    startLineNumber,
    startColumn,
    endLineNumber,
    endColumn,
    severity: severityToMonacoLevel(diagnostic.severity),
    message: diagnostic.message,
    code: diagnostic.code,
    source: parserDiagnosticSource
  };
}

export function toMonacoMarkers(diagnostics: readonly ParserDiagnostic[]): readonly MonacoMarkerDataLike[] {
  return diagnostics.map(normalizeMarkerRange);
}

export function registerFumenLanguage(monaco: MonacoNamespaceLike): string {
  monaco.languages.register({ id: MONACO_LANGUAGE_ID });
  monaco.languages.setMonarchTokensProvider(MONACO_LANGUAGE_ID, fumenMonarchLanguage);
  monaco.languages.setLanguageConfiguration(MONACO_LANGUAGE_ID, fumenLanguageConfiguration);
  return MONACO_LANGUAGE_ID;
}

export function analyzeAndUpdateMonacoModel(
  monaco: MonacoNamespaceLike,
  model: { readonly uri: unknown; getValue(): string },
  options: ParseOptions = {}
): ReturnType<typeof parseWithDiagnostics> {
  const result = parseWithDiagnostics(model.getValue(), {
    ...options,
    emitDiagnostics: true,
    includeTokens: true
  });
  monaco.editor.setModelMarkers(model, parserDiagnosticSource, toMonacoMarkers(result.diagnostics));
  return result;
}

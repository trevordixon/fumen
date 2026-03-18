export interface Position {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

export interface SourceSpan {
  readonly start: Position;
  readonly end: Position;
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface ParserDiagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly span: SourceSpan;
}

export type TrackLike = Record<string, unknown>;

export interface ParseResult {
  readonly ok: boolean;
  readonly track: TrackLike | null;
  readonly diagnostics: readonly ParserDiagnostic[];
}

export interface ParseOptions {
  readonly fileName?: string;
  readonly emitDiagnostics?: boolean;
}

export interface RenderTargetProvider {
  (): HTMLCanvasElement | Promise<HTMLCanvasElement>;
}

export type RenderTarget = HTMLCanvasElement | RenderTargetProvider;

export interface RendererOptions {
  readonly defaultParams?: Record<string, unknown>;
}

export interface RenderResult {
  readonly ok: boolean;
}

export interface RendererFacade {
  render(track: TrackLike, params?: Record<string, unknown>): Promise<RenderResult>;
  getElementsByPosition(
    canvas: HTMLCanvasElement,
    coord: { x: number; y: number }
  ): Array<{ element: unknown; bb: { get(): { x: number; y: number; w: number; h: number } } }>;
}

export type SyntaxTokenKind =
  | "section"
  | "directive"
  | "chord"
  | "barline"
  | "comment"
  | "lyric"
  | "text"
  | "unknown";

export interface SyntaxToken {
  readonly kind: SyntaxTokenKind;
  readonly span: SourceSpan;
  readonly lexeme: string;
}

export interface SyntaxTokenProvider {
  tokenize(code: string): readonly SyntaxToken[];
}

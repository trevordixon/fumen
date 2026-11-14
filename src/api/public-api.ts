import { parseFumen, parseWithDiagnostics } from "./parser-service";
import { createRenderer, DefaultRendererCompat } from "./renderer-service";
import type {
  RenderResult,
  ParseOptions,
  ParseResult,
  RendererFacade,
  RendererOptions,
  RenderTarget,
  SyntaxToken,
  TrackLike
} from "./types";
import { Parser as LegacyParser } from "../parser/parser";
import { tokenizeFumen } from "./tokenizer";
import { SvgCanvas, type SvgCanvasOptions, type SvgDrawing } from "../renderer/svg_canvas";
import { PETALUMA_SCRIPT_WOFF2_DATAURL, PETALUMA_TEXT_WOFF2_DATAURL } from "../renderer/petaluma_text_fonts";

export function parse(code: string, options: ParseOptions = {}): ParseResult {
  return parseFumen(code, options);
}

export { parseWithDiagnostics };

export function tokenize(code: string): readonly SyntaxToken[] {
  return tokenizeFumen(code);
}

export function createFumenRenderer(
  target: RenderTarget,
  options: RendererOptions = {}
): RendererFacade {
  return createRenderer(target, options);
}

export class ParserCompat {
  private readonly parser: LegacyParser;

  constructor(errorMsgCallback?: ((msg: string) => void) | null) {
    this.parser = new LegacyParser(errorMsgCallback ?? null);
  }

  parse(code: string): TrackLike | null {
    return this.parser.parse(code) as TrackLike | null;
  }

  parseWithDiagnostics(code: string, options: ParseOptions = {}): ParseResult {
    return parseWithDiagnostics(code, options);
  }

  tokenize(code: string): readonly SyntaxToken[] {
    return tokenizeFumen(code);
  }
}

export { DefaultRendererCompat };

/**
 * Renders a parsed track as SVG, one document per page, by drawing on SvgCanvas pages instead of
 * HTML canvases. `params` are the usual render parameters.
 */
export async function renderToSvg(
  track: TrackLike,
  params: Record<string, unknown> = {},
  options: SvgCanvasOptions = {}
): Promise<string[]> {
  const { pages } = await renderToSvgCanvases(track, params, options);
  return pages.map((page) => page.toSVG());
}

/** A page as drawing commands, with the measure rows drawn on it. */
export interface RenderedDrawing extends SvgDrawing {
  /** Measure rows on this page (as RenderResult's pages say; 0 when the renderer didn't say). */
  readonly rows: number;
}

/**
 * Renders a parsed track as drawing commands, one drawing per page, for a host that draws them
 * itself (an app drawing with Core Graphics or Android's Canvas, with no web view).
 */
export async function renderToDrawings(
  track: TrackLike,
  params: Record<string, unknown> = {},
  options: SvgCanvasOptions = {}
): Promise<RenderedDrawing[]> {
  const { pages, result } = await renderToSvgCanvases(track, params, options);
  return pages.map((page, i) => ({ ...page.toDrawing(), rows: result.pages?.[i]?.rows ?? 0 }));
}

async function renderToSvgCanvases(
  track: TrackLike,
  params: Record<string, unknown>,
  options: SvgCanvasOptions
): Promise<{ pages: SvgCanvas[]; result: RenderResult }> {
  const pages: SvgCanvas[] = [];
  const renderer = new DefaultRendererCompat(() => {
    const page = new SvgCanvas(options);
    pages.push(page);
    return page;
  }, params);
  const result = await renderer.render(track, params);
  return { pages, result };
}

/** A text font fumen carries with it: its CSS family name and the font file as a data URL. */
export interface EmbeddedTextFont {
  readonly family: string;
  readonly dataURL: string;
}

/**
 * The text fonts fumen draws with and carries itself (the Petaluma text fonts). A browser loads
 * them as it renders; a host that measures and draws text itself loads these.
 */
export function embeddedTextFonts(): EmbeddedTextFont[] {
  return [
    { family: "Petaluma Text", dataURL: PETALUMA_TEXT_WOFF2_DATAURL },
    { family: "Petaluma Script", dataURL: PETALUMA_SCRIPT_WOFF2_DATAURL }
  ];
}

import { parseFumen, parseWithDiagnostics } from "./parser-service";
import { createRenderer, DefaultRendererCompat } from "./renderer-service";
import type {
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

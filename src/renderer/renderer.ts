import { Renderer as LegacyRenderer } from "./renderer_legacy";

interface Coord {
  x: number;
  y: number;
}

interface HitBox {
  get(): { x: number; y: number; w: number; h: number };
}

interface HitEntry {
  element: unknown;
  bb: HitBox;
}

interface ClassifiedElements {
  header: unknown[];
  body: unknown[];
  footer: unknown[];
  measure_wide: unknown[];
}

export class Renderer extends LegacyRenderer {
  override render(): void {
    super.render();
  }

  override getElementsByPosition(
    paper: HTMLCanvasElement,
    coord: Coord
  ): HitEntry[] {
    return super.getElementsByPosition(paper, coord);
  }

  override getMusicGlyph(glyphname: string): unknown {
    return super.getMusicGlyph(glyphname);
  }

  override classifyElements(measure: unknown): ClassifiedElements {
    return super.classifyElements(measure);
  }
}

import { DefaultRenderer as LegacyDefaultRenderer } from "../renderer/default_renderer";
import type {
  RenderedPage,
  RenderResult,
  RendererFacade,
  RendererOptions,
  RenderTarget,
  TrackLike
} from "./types";

function mergeParams(
  base: Record<string, unknown> | undefined,
  override: Record<string, unknown> | undefined
): Record<string, unknown> {
  return {
    ...(base ?? {}),
    ...(override ?? {})
  };
}

class LegacyBackedRendererFacade implements RendererFacade {
  private readonly renderer: LegacyDefaultRenderer;
  private readonly defaultParams: Record<string, unknown>;

  constructor(target: RenderTarget, options: RendererOptions = {}) {
    this.defaultParams = { ...(options.defaultParams ?? {}) };
    this.renderer = new LegacyDefaultRenderer(target, this.defaultParams);
  }

  async render(
    track: TrackLike,
    params?: Record<string, unknown>
  ): Promise<RenderResult> {
    const result: unknown = await this.renderer.render(track, mergeParams(this.defaultParams, params));
    const pages = renderedPages(result);
    return pages !== undefined ? { ok: true, pages } : { ok: true };
  }

  getElementsByPosition(
    canvas: HTMLCanvasElement,
    coord: { x: number; y: number }
  ): Array<{ element: unknown; bb: { get(): { x: number; y: number; w: number; h: number } } }> {
    return this.renderer.getElementsByPosition(canvas, coord);
  }
}

function renderedPages(result: unknown): RenderedPage[] | undefined {
  if (typeof result !== "object" || result === null || !("pages" in result)) return undefined;
  const pages = result.pages;
  if (!Array.isArray(pages)) return undefined;
  return pages.map((page: unknown) => {
    const rows = typeof page === "object" && page !== null && "rows" in page ? page.rows : 0;
    return { rows: typeof rows === "number" ? rows : 0 };
  });
}

export function createRenderer(
  target: RenderTarget,
  options: RendererOptions = {}
): RendererFacade {
  return new LegacyBackedRendererFacade(target, options);
}

export class DefaultRendererCompat {
  private readonly facade: LegacyBackedRendererFacade;

  constructor(target: RenderTarget, params: Record<string, unknown> = {}) {
    this.facade = new LegacyBackedRendererFacade(target, {
      defaultParams: params
    });
  }

  async render(track: TrackLike, params: Record<string, unknown> = {}): Promise<RenderResult> {
    return this.facade.render(track, params);
  }

  getElementsByPosition(
    canvas: HTMLCanvasElement,
    coord: { x: number; y: number }
  ): Array<{ element: unknown; bb: { get(): { x: number; y: number; w: number; h: number } } }> {
    return this.facade.getElementsByPosition(canvas, coord);
  }
}

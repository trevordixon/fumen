import { DefaultRenderer as LegacyDefaultRenderer } from "../renderer/default_renderer";
import type {
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
    await this.renderer.render(track, mergeParams(this.defaultParams, params));
    return { ok: true };
  }

  getElementsByPosition(
    canvas: HTMLCanvasElement,
    coord: { x: number; y: number }
  ): Array<{ element: unknown; bb: { get(): { x: number; y: number; w: number; h: number } } }> {
    return this.renderer.getElementsByPosition(canvas, coord);
  }
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

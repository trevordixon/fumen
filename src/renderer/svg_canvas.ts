/**
 * An SVG stand-in for an HTML canvas.
 *
 * The renderer draws through the Canvas 2D API. `SvgCanvas` looks enough like an
 * HTMLCanvasElement for the renderer to draw on it unchanged: its 2D context records every
 * drawing call as a list of commands instead of painting pixels, and `toSVG()` writes those
 * commands out as an SVG document.
 *
 * Only measuring text needs a real text engine. That goes through a `TextMeasurer`; the default
 * one measures with an offscreen canvas, so in a browser nothing has to be supplied.
 */

/** A 2D affine transform, in the order the Canvas API uses: [a, b, c, d, e, f]. */
type Matrix = readonly [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}

function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2];
  if (det === 0) return IDENTITY;
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function isIdentity(m: Matrix): boolean {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
}

/** Measures text the way a canvas would. Supply one where there is no canvas (a bare JS engine). */
export interface TextMeasurer {
  /** Advance width of `text` in `font` (a CSS font shorthand), in CSS pixels. */
  measureText(font: string, text: string): SvgTextMetrics;
  /**
   * How far the alphabetic baseline sits below the line `baseline` (a canvas textBaseline value)
   * names, for `font`. SVG text is placed by its alphabetic baseline.
   */
  alphabeticOffset(font: string, baseline: string): number;
}

export interface SvgTextMetrics {
  readonly width: number;
  readonly actualBoundingBoxLeft?: number;
  readonly actualBoundingBoxRight?: number;
  readonly actualBoundingBoxAscent?: number;
  readonly actualBoundingBoxDescent?: number;
}

/** Measures with an offscreen canvas. Works anywhere a canvas does. */
export class CanvasTextMeasurer implements TextMeasurer {
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  private readonly offsets = new Map<string, number>();

  private context(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
    if (this.ctx !== null) return this.ctx;
    let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
    const doc: Document | undefined = globalThis.document;
    if (doc !== undefined) {
      ctx = doc.createElement("canvas").getContext("2d");
    } else if (typeof OffscreenCanvas !== "undefined") {
      ctx = new OffscreenCanvas(1, 1).getContext("2d");
    }
    if (ctx === null) {
      throw new Error("SvgCanvas: no canvas to measure text with; pass a TextMeasurer.");
    }
    this.ctx = ctx;
    return ctx;
  }

  measureText(font: string, text: string): SvgTextMetrics {
    const ctx = this.context();
    ctx.font = font;
    ctx.textBaseline = "alphabetic";
    return ctx.measureText(text);
  }

  alphabeticOffset(font: string, baseline: string): number {
    const key = font + "|" + baseline;
    const cached = this.offsets.get(key);
    if (cached !== undefined) return cached;
    // Both ascents are measured up from their own baseline line to the same glyph top, so their
    // difference is the gap between the two lines.
    const ctx = this.context();
    const probe = "Hgjy|";
    ctx.font = font;
    ctx.textBaseline = "alphabetic";
    const fromAlphabetic = ctx.measureText(probe).actualBoundingBoxAscent;
    ctx.textBaseline = canvasBaseline(baseline);
    const fromBaseline = ctx.measureText(probe).actualBoundingBoxAscent;
    const offset = fromAlphabetic - fromBaseline;
    this.offsets.set(key, offset);
    return offset;
  }
}

function canvasBaseline(value: string): CanvasTextBaseline {
  switch (value) {
    case "top":
    case "hanging":
    case "middle":
    case "alphabetic":
    case "ideographic":
    case "bottom":
      return value;
    default:
      return "alphabetic";
  }
}

/** Something drawImage can take: an image with a URL and a size. */
interface ImageLike {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  /** A music font glyph's name (its SMuFL code point, as "uniE0A3"), when it is one. */
  readonly fumenGlyph?: unknown;
}

function isImageLike(value: unknown): value is ImageLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "src" in value &&
    typeof value.src === "string" &&
    "width" in value &&
    typeof value.width === "number" &&
    "height" in value &&
    typeof value.height === "number"
  );
}

interface PaintStyle {
  readonly fill?: string;
  readonly stroke?: string;
  readonly lineWidth?: number;
  readonly lineCap?: string;
  readonly lineJoin?: string;
  readonly miterLimit?: number;
  readonly dash?: readonly number[];
  readonly dashOffset?: number;
  readonly alpha?: number;
}

/** A drawing command. Coordinates are in the user space `m` maps to the canvas. */
export type SvgCommand =
  | { readonly op: "path"; readonly d: string; readonly m: Matrix; readonly style: PaintStyle }
  | {
      readonly op: "text";
      readonly text: string;
      readonly x: number;
      readonly y: number;
      readonly m: Matrix;
      readonly font: string;
      readonly anchor: "start" | "middle" | "end";
      readonly fill: string;
      readonly alpha?: number;
      readonly textLength?: number;
    }
  | {
      readonly op: "image";
      readonly src: string;
      /** The music font glyph this image is, as "uniE0A3", so a native host can draw it from the font. */
      readonly glyph?: string;
      readonly naturalWidth: number;
      readonly naturalHeight: number;
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly m: Matrix;
      readonly alpha?: number;
    }
  | { readonly op: "clip"; readonly d: string; readonly m: Matrix }
  | { readonly op: "endClip" };

interface State {
  m: Matrix;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  miterLimit: number;
  dash: number[];
  dashOffset: number;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  /** Clips opened since the matching save(); restore() closes them. */
  clips: number;
}

function defaultState(): State {
  return {
    m: IDENTITY,
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    miterLimit: 10,
    dash: [],
    dashOffset: 0,
    globalAlpha: 1,
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    clips: 0
  };
}

/** One path segment, with points already in canvas (device) coordinates. */
type Segment =
  | { readonly k: "M" | "L"; readonly p: readonly [number, number] }
  | { readonly k: "C"; readonly p: readonly [number, number, number, number, number, number] }
  | { readonly k: "Z" };

function colorString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/** The subset of CanvasRenderingContext2D the renderer uses, recorded instead of painted. */
export class SvgContext2D {
  readonly canvas: SvgCanvas;
  private state: State = defaultState();
  private stack: State[] = [];
  private segments: Segment[] = [];

  constructor(canvas: SvgCanvas) {
    this.canvas = canvas;
  }

  /** Called when the canvas is resized: a real canvas forgets its state and contents then. */
  reset(): void {
    this.state = defaultState();
    this.stack = [];
    this.segments = [];
  }

  // State

  save(): void {
    this.stack.push(this.state);
    this.state = { ...this.state, dash: this.state.dash.slice(), clips: 0 };
  }

  restore(): void {
    const previous = this.stack.pop();
    if (previous === undefined) return;
    for (let i = 0; i < this.state.clips; ++i) this.canvas.record({ op: "endClip" });
    this.state = previous;
  }

  get fillStyle(): string { return this.state.fillStyle; }
  set fillStyle(v: unknown) { this.state.fillStyle = colorString(v, this.state.fillStyle); }
  get strokeStyle(): string { return this.state.strokeStyle; }
  set strokeStyle(v: unknown) { this.state.strokeStyle = colorString(v, this.state.strokeStyle); }
  get lineWidth(): number { return this.state.lineWidth; }
  set lineWidth(v: number) { if (Number.isFinite(v) && v > 0) this.state.lineWidth = v; }
  get lineCap(): string { return this.state.lineCap; }
  set lineCap(v: string) { this.state.lineCap = v; }
  get lineJoin(): string { return this.state.lineJoin; }
  set lineJoin(v: string) { this.state.lineJoin = v; }
  get miterLimit(): number { return this.state.miterLimit; }
  set miterLimit(v: number) { if (Number.isFinite(v) && v > 0) this.state.miterLimit = v; }
  get lineDashOffset(): number { return this.state.dashOffset; }
  set lineDashOffset(v: number) { if (Number.isFinite(v)) this.state.dashOffset = v; }
  get globalAlpha(): number { return this.state.globalAlpha; }
  set globalAlpha(v: number) { if (Number.isFinite(v) && v >= 0 && v <= 1) this.state.globalAlpha = v; }
  get font(): string { return this.state.font; }
  set font(v: string) { this.state.font = v; }
  get textAlign(): string { return this.state.textAlign; }
  set textAlign(v: string) { this.state.textAlign = v; }
  get textBaseline(): string { return this.state.textBaseline; }
  set textBaseline(v: string) { this.state.textBaseline = v; }

  setLineDash(segments: readonly number[]): void {
    if (segments.some((s) => !Number.isFinite(s) || s < 0)) return;
    this.state.dash = segments.length % 2 === 0 ? segments.slice() : segments.concat(segments);
  }

  getLineDash(): number[] {
    return this.state.dash.slice();
  }

  // Transforms

  setTransform(a: number | DOMMatrix2DInit = 1, b = 0, c = 0, d = 1, e = 0, f = 0): void {
    if (typeof a === "object") {
      this.state.m = [a.a ?? 1, a.b ?? 0, a.c ?? 0, a.d ?? 1, a.e ?? 0, a.f ?? 0];
    } else {
      this.state.m = [a, b, c, d, e, f];
    }
  }

  resetTransform(): void {
    this.state.m = IDENTITY;
  }

  getTransform(): { a: number; b: number; c: number; d: number; e: number; f: number } {
    const [a, b, c, d, e, f] = this.state.m;
    return { a, b, c, d, e, f };
  }

  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.state.m = multiply(this.state.m, [a, b, c, d, e, f]);
  }

  scale(x: number, y: number): void {
    this.transform(x, 0, 0, y, 0, 0);
  }

  translate(x: number, y: number): void {
    this.transform(1, 0, 0, 1, x, y);
  }

  rotate(angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.transform(cos, sin, -sin, cos, 0, 0);
  }

  // Paths. Points are stored in canvas coordinates, as a real canvas does, so a transform that
  // changes partway through a path affects only the points added after it.

  beginPath(): void {
    this.segments = [];
  }

  moveTo(x: number, y: number): void {
    this.segments.push({ k: "M", p: apply(this.state.m, x, y) });
  }

  lineTo(x: number, y: number): void {
    if (this.segments.length === 0) this.moveTo(x, y);
    this.segments.push({ k: "L", p: apply(this.state.m, x, y) });
  }

  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    if (this.segments.length === 0) this.moveTo(c1x, c1y);
    const m = this.state.m;
    this.segments.push({ k: "C", p: [...apply(m, c1x, c1y), ...apply(m, c2x, c2y), ...apply(m, x, y)] });
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    const last = this.lastPoint();
    if (last === null) {
      this.moveTo(cx, cy);
    }
    const inv = invert(this.state.m);
    const [px, py] = last !== null ? apply(inv, last[0], last[1]) : [cx, cy];
    this.bezierCurveTo(
      px + (2 / 3) * (cx - px), py + (2 / 3) * (cy - py),
      x + (2 / 3) * (cx - x), y + (2 / 3) * (cy - y),
      x, y
    );
  }

  closePath(): void {
    if (this.segments.length > 0) this.segments.push({ k: "Z" });
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
    this.moveTo(x, y);
  }

  arc(cx: number, cy: number, r: number, start: number, end: number, ccw = false): void {
    this.ellipse(cx, cy, r, r, 0, start, end, ccw);
  }

  ellipse(
    cx: number, cy: number, rx: number, ry: number, rotation: number,
    start: number, end: number, ccw = false
  ): void {
    // Canvas arc sweep rules: a sweep of a full turn or more draws the whole ellipse.
    const tau = Math.PI * 2;
    let sweep = end - start;
    if (!ccw && sweep >= tau) sweep = tau;
    else if (ccw && -sweep >= tau) sweep = -tau;
    else if (!ccw) sweep = ((sweep % tau) + tau) % tau;
    else sweep = -((((start - end) % tau) + tau) % tau);

    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const point = (t: number): [number, number] => {
      const x = rx * Math.cos(t);
      const y = ry * Math.sin(t);
      return [cx + x * cos - y * sin, cy + x * sin + y * cos];
    };
    const derivative = (t: number): [number, number] => {
      const x = -rx * Math.sin(t);
      const y = ry * Math.cos(t);
      return [x * cos - y * sin, x * sin + y * cos];
    };

    const [sx, sy] = point(start);
    if (this.segments.length === 0) this.moveTo(sx, sy);
    else this.lineTo(sx, sy);

    // Cubic Béziers of at most a quarter turn each.
    const pieces = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
    const step = sweep / pieces;
    const k = (4 / 3) * Math.tan(step / 4);
    let t0 = start;
    for (let i = 0; i < pieces; ++i) {
      const t1 = t0 + step;
      const p0 = point(t0);
      const p1 = point(t1);
      const d0 = derivative(t0);
      const d1 = derivative(t1);
      this.bezierCurveTo(
        p0[0] + k * d0[0], p0[1] + k * d0[1],
        p1[0] - k * d1[0], p1[1] - k * d1[1],
        p1[0], p1[1]
      );
      t0 = t1;
    }
  }

  fill(): void {
    this.paint({ fill: this.state.fillStyle });
  }

  stroke(): void {
    this.paint({ stroke: this.state.strokeStyle });
  }

  clip(): void {
    const d = this.pathData();
    if (d === "") return;
    this.canvas.record({ op: "clip", d, m: this.state.m });
    this.state.clips += 1;
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const saved = this.segments;
    this.segments = [];
    this.rect(x, y, w, h);
    this.fill();
    this.segments = saved;
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    const saved = this.segments;
    this.segments = [];
    this.rect(x, y, w, h);
    this.stroke();
    this.segments = saved;
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    // Clearing the whole canvas starts it over. A partial clear would need to cut a hole in
    // what's already drawn; the renderer never does one on a page.
    const corners = [apply(this.state.m, x, y), apply(this.state.m, x + w, y + h)];
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    if (
      Math.min(...xs) <= 0 && Math.min(...ys) <= 0 &&
      Math.max(...xs) >= this.canvas.width && Math.max(...ys) >= this.canvas.height
    ) {
      this.canvas.clear();
    }
  }

  // Text

  measureText(text: unknown): SvgTextMetrics {
    return this.canvas.measurer.measureText(this.state.font, String(text));
  }

  fillText(value: unknown, x: number, y: number, maxWidth?: number): void {
    // Like a canvas, draw whatever it's given as a string (the renderer passes numbers too).
    const text = String(value);
    const s = this.state;
    const anchor = s.textAlign === "center" ? "middle"
      : (s.textAlign === "right" || s.textAlign === "end") ? "end"
      : "start";
    const baselineY = y + this.canvas.measurer.alphabeticOffset(s.font, s.textBaseline);
    let textLength: number | undefined;
    if (maxWidth !== undefined && Number.isFinite(maxWidth)) {
      const width = this.measureText(text).width;
      if (width > maxWidth) textLength = Math.max(0, maxWidth);
    }
    this.canvas.record({
      op: "text",
      text,
      x,
      y: baselineY,
      m: s.m,
      font: s.font,
      anchor,
      fill: s.fillStyle,
      ...(s.globalAlpha !== 1 ? { alpha: s.globalAlpha } : {}),
      ...(textLength !== undefined ? { textLength } : {})
    });
  }

  // Images

  drawImage(image: unknown, x: number, y: number, w?: number, h?: number): void {
    if (!isImageLike(image)) return;
    this.canvas.record({
      op: "image",
      src: image.src,
      ...(typeof image.fumenGlyph === "string" ? { glyph: image.fumenGlyph } : {}),
      naturalWidth: image.width,
      naturalHeight: image.height,
      x,
      y,
      w: w ?? image.width,
      h: h ?? image.height,
      m: this.state.m,
      ...(this.state.globalAlpha !== 1 ? { alpha: this.state.globalAlpha } : {})
    });
  }

  // Internals

  private lastPoint(): readonly [number, number] | null {
    for (let i = this.segments.length - 1; i >= 0; --i) {
      const seg = this.segments[i];
      if (seg === undefined || seg.k === "Z") continue;
      if (seg.k === "C") return [seg.p[4], seg.p[5]];
      return seg.p;
    }
    return null;
  }

  /** The current path in the current user space, so it can be drawn under the current transform. */
  private pathData(): string {
    const inv = invert(this.state.m);
    const out: string[] = [];
    for (const seg of this.segments) {
      if (seg.k === "Z") {
        out.push("Z");
      } else if (seg.k === "C") {
        const a = apply(inv, seg.p[0], seg.p[1]);
        const b = apply(inv, seg.p[2], seg.p[3]);
        const c = apply(inv, seg.p[4], seg.p[5]);
        out.push("C" + [...a, ...b, ...c].map(num).join(" "));
      } else {
        const p = apply(inv, seg.p[0], seg.p[1]);
        out.push(seg.k + num(p[0]) + " " + num(p[1]));
      }
    }
    return out.join("");
  }

  private paint(kind: { fill: string } | { stroke: string }): void {
    const d = this.pathData();
    if (d === "") return;
    const s = this.state;
    let style: PaintStyle;
    if ("fill" in kind) {
      style = { fill: kind.fill, ...(s.globalAlpha !== 1 ? { alpha: s.globalAlpha } : {}) };
    } else {
      style = {
        stroke: kind.stroke,
        lineWidth: s.lineWidth,
        lineCap: s.lineCap,
        lineJoin: s.lineJoin,
        miterLimit: s.miterLimit,
        ...(s.dash.length > 0 ? { dash: s.dash.slice(), dashOffset: s.dashOffset } : {}),
        ...(s.globalAlpha !== 1 ? { alpha: s.globalAlpha } : {})
      };
    }
    this.canvas.record({ op: "path", d, m: s.m, style });
  }
}

/** A page as data: see SvgCanvas.toDrawing. */
export interface SvgDrawing {
  readonly width: number;
  readonly height: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly commands: readonly SvgCommand[];
}

export interface SvgCanvasOptions {
  /** Measures text. Defaults to the one setTextMeasurer installed, else an offscreen canvas. */
  readonly measurer?: TextMeasurer;
}

let sharedMeasurer: CanvasTextMeasurer | null = null;
let hostMeasurer: TextMeasurer | null = null;

/**
 * Makes fumen measure all text with `measurer` instead of a browser canvas. A host without a DOM
 * (JavaScriptCore, QuickJS) must call this before rendering; pass null to go back to the canvas.
 */
export function setTextMeasurer(measurer: TextMeasurer | null): void {
  hostMeasurer = measurer;
  measurerGeneration += 1;
}

let measurerGeneration = 0;

/** Changes whenever setTextMeasurer is called, so measurements cached under the old one are dropped. */
export function textMeasurerGeneration(): number {
  return measurerGeneration;
}

/** The measurer a host installed, if any. */
export function hostTextMeasurer(): TextMeasurer | null {
  return hostMeasurer;
}

/** A drawing surface the renderer can use in place of an HTMLCanvasElement. */
export class SvgCanvas {
  readonly measurer: TextMeasurer;
  /** The renderer writes `style.width`/`style.height`; they become the SVG's size. */
  readonly style: { width?: string; height?: string } = {};
  /** Set by the renderer (setupHiDPICanvas). */
  ratio?: number;
  zoom?: number;
  id?: string;

  private w = 300;
  private h = 150;
  private ctx: SvgContext2D | null = null;
  private commands: SvgCommand[] = [];

  constructor(options: SvgCanvasOptions = {}) {
    this.measurer = options.measurer ?? hostMeasurer ?? (sharedMeasurer ??= new CanvasTextMeasurer());
  }

  get width(): number { return this.w; }
  set width(v: number) { this.w = Math.max(0, Math.floor(v)); this.resize(); }
  get height(): number { return this.h; }
  set height(v: number) { this.h = Math.max(0, Math.floor(v)); this.resize(); }

  getContext(type: string): SvgContext2D | null {
    if (type !== "2d") return null;
    this.ctx ??= new SvgContext2D(this);
    return this.ctx;
  }

  /** @internal */
  record(command: SvgCommand): void {
    this.commands.push(command);
  }

  /** @internal */
  clear(): void {
    this.commands = [];
  }

  /** What was drawn, in order. */
  getCommands(): readonly SvgCommand[] {
    return this.commands;
  }

  /** The drawing as a standalone SVG document. */
  toSVG(): string {
    return serialize(this);
  }

  /**
   * The drawing as plain data, for a host to draw natively. `width`/`height` are the page's size
   * in CSS pixels; commands are in canvas pixels (`pixelWidth` by `pixelHeight`), with each
   * command's own transform.
   */
  toDrawing(): SvgDrawing {
    return {
      width: pixels(this.style.width, this.w),
      height: pixels(this.style.height, this.h),
      pixelWidth: this.w,
      pixelHeight: this.h,
      commands: this.commands.slice()
    };
  }

  private resize(): void {
    this.commands = [];
    this.ctx?.reset();
  }
}

// Serializing

function num(v: number): string {
  if (!Number.isFinite(v)) return "0";
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function transformAttr(m: Matrix): string {
  return isIdentity(m) ? "" : ` transform="matrix(${m.map(num).join(" ")})"`;
}

function pixels(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? NaN : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function paintAttrs(style: PaintStyle): string {
  let out = "";
  if (style.fill !== undefined) {
    out += ` fill="${escapeXml(style.fill)}"`;
  } else {
    out += " fill=\"none\"";
  }
  if (style.stroke !== undefined) {
    out += ` stroke="${escapeXml(style.stroke)}" stroke-width="${num(style.lineWidth ?? 1)}"`;
    if (style.lineCap !== undefined && style.lineCap !== "butt") out += ` stroke-linecap="${style.lineCap}"`;
    if (style.lineJoin !== undefined && style.lineJoin !== "miter") out += ` stroke-linejoin="${style.lineJoin}"`;
    if (style.miterLimit !== undefined && style.miterLimit !== 4) out += ` stroke-miterlimit="${num(style.miterLimit)}"`;
    if (style.dash !== undefined && style.dash.length > 0) {
      out += ` stroke-dasharray="${style.dash.map(num).join(" ")}"`;
      if (style.dashOffset !== undefined && style.dashOffset !== 0) out += ` stroke-dashoffset="${num(style.dashOffset)}"`;
    }
  }
  if (style.alpha !== undefined) out += ` opacity="${num(style.alpha)}"`;
  return out;
}

function serialize(canvas: SvgCanvas): string {
  const width = pixels(canvas.style.width, canvas.width);
  const height = pixels(canvas.style.height, canvas.height);
  const defs: string[] = [];
  const body: string[] = [];
  const images = new Map<string, string>();
  let clipCount = 0;
  let openClips = 0;

  for (const c of canvas.getCommands()) {
    switch (c.op) {
      case "path":
        body.push(`<path d="${c.d}"${paintAttrs(c.style)}${transformAttr(c.m)}/>`);
        break;
      case "text": {
        let attrs = ` x="${num(c.x)}" y="${num(c.y)}"`;
        if (c.anchor !== "start") attrs += ` text-anchor="${c.anchor}"`;
        if (c.textLength !== undefined) {
          attrs += ` textLength="${num(c.textLength)}" lengthAdjust="spacingAndGlyphs"`;
        }
        if (c.alpha !== undefined) attrs += ` opacity="${num(c.alpha)}"`;
        body.push(
          `<text${attrs} fill="${escapeXml(c.fill)}" style="font:${escapeXml(c.font)}"` +
          `${transformAttr(c.m)}>${escapeXml(c.text)}</text>`
        );
        break;
      }
      case "image": {
        let id = images.get(c.src);
        if (id === undefined) {
          id = "i" + images.size;
          images.set(c.src, id);
          defs.push(
            `<image id="${id}" width="${num(c.naturalWidth)}" height="${num(c.naturalHeight)}"` +
            ` preserveAspectRatio="none" href="${escapeXml(c.src)}"/>`
          );
        }
        const sx = c.naturalWidth > 0 ? c.w / c.naturalWidth : 1;
        const sy = c.naturalHeight > 0 ? c.h / c.naturalHeight : 1;
        const placed = multiply(c.m, [sx, 0, 0, sy, c.x, c.y]);
        const opacity = c.alpha !== undefined ? ` opacity="${num(c.alpha)}"` : "";
        body.push(`<use href="#${id}"${opacity}${transformAttr(placed)}/>`);
        break;
      }
      case "clip": {
        const id = "c" + clipCount++;
        defs.push(`<clipPath id="${id}"><path d="${c.d}"${transformAttr(c.m)}/></clipPath>`);
        body.push(`<g clip-path="url(#${id})">`);
        openClips += 1;
        break;
      }
      case "endClip":
        if (openClips > 0) {
          body.push("</g>");
          openClips -= 1;
        }
        break;
    }
  }
  while (openClips-- > 0) body.push("</g>");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}" height="${num(height)}"` +
    ` viewBox="0 0 ${canvas.width} ${canvas.height}" style="white-space:pre">` +
    (defs.length > 0 ? `<defs>${defs.join("")}</defs>` : "") +
    body.join("") +
    "</svg>"
  );
}

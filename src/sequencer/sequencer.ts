import * as common from "../common/common";
import { Renderer } from "../renderer/renderer";

interface MeasureContext {
  rgi: number;
  bi: number;
  mi: number;
}

interface SequenceProperty {
  t: number;
  duration: number;
}

interface SequencerParam {
  auto_scroll: boolean;
}

interface RenderIndicator {
  attr(attrs: Record<string, unknown>): RenderIndicator;
  remove(): void;
}

interface RenderPaper {
  rect(x: number, y: number, w: number, h: number): RenderIndicator;
  canvas: {
    offsetTop: number;
  };
}

interface MeasureRenderProp {
  sx: number;
  ex: number;
  y: number;
  paper: RenderPaper;
}

interface MeasureLike {
  renderprop: MeasureRenderProp;
  findFirstOf(cond: (element: unknown) => boolean): unknown | null;
}

interface RehearsalGroupLike {
  blocks: MeasureLike[][];
}

interface TrackLike {
  reharsal_groups: RehearsalGroupLike[];
}

interface LoopState {
  p: MeasureContext;
  cnt: number;
}

interface PointState {
  p: MeasureContext;
}

interface ValidatedPointState extends PointState {
  valid: boolean;
}

function cloneContext(ctx: MeasureContext): MeasureContext {
  return common.deepcopy(ctx);
}

function ctxLt(c0: MeasureContext, c1: MeasureContext): boolean {
  if (c0.rgi < c1.rgi) return true;
  if (c0.rgi > c1.rgi) return false;
  return c0.mi < c1.mi;
}

function ctxEq(c0: MeasureContext, c1: MeasureContext): boolean {
  return c0.rgi === c1.rgi && c0.mi === c1.mi;
}

function ctxLte(c0: MeasureContext, c1: MeasureContext): boolean {
  return ctxLt(c0, c1) || ctxEq(c0, c1);
}

function findElement(
  measure: MeasureLike,
  condition: (element: unknown) => boolean
): unknown | null {
  return measure.findFirstOf(condition);
}

function getRehearsalGroup(track: TrackLike, rgi: number): RehearsalGroupLike {
  const group = track.reharsal_groups[rgi];
  if (group === undefined) {
    throw new Error("Invalid rehearsal-group index");
  }
  return group;
}

function getBlock(track: TrackLike, rgi: number, bi: number): MeasureLike[] {
  const block = getRehearsalGroup(track, rgi).blocks[bi];
  if (block === undefined) {
    throw new Error("Invalid block index");
  }
  return block;
}

function getMeasure(track: TrackLike, c: MeasureContext): MeasureLike {
  const measure = getBlock(track, c.rgi, c.bi)[c.mi];
  if (measure === undefined) {
    throw new Error("Invalid measure index");
  }
  return measure;
}

export class Sequencer {
  private readonly param: SequencerParam;
  private readonly cbPlay: (() => void) | null;
  private readonly cbStop: (() => void) | null;
  private readonly structureRenderer: Renderer;

  private readonly sequence: Array<[SequenceProperty, MeasureLike]>;
  private timerId: ReturnType<typeof setInterval> | null;
  private timerStart: number;
  private tempoBpm: number;
  private currentMeasureIndex: number;
  private lastIndicator: RenderIndicator | null;

  constructor(
    track: TrackLike,
    cbPlay?: (() => void) | null,
    cbStop?: (() => void) | null,
    param: Partial<SequencerParam> = {}
  ) {
    this.param = {
      auto_scroll: param.auto_scroll === true
    };

    this.cbPlay = cbPlay ?? null;
    this.cbStop = cbStop ?? null;
    this.structureRenderer = new Renderer();

    this.sequence = [];
    this.timerId = null;
    this.timerStart = 0;
    this.tempoBpm = 120;
    this.currentMeasureIndex = 0;
    this.lastIndicator = null;

    this.analyzeStructure(track);
  }

  autoScroll(onoff: boolean): void {
    this.param.auto_scroll = onoff;
  }

  play(tempo: number): void {
    if (this.timerId !== null) {
      return;
    }

    this.timerStart = Date.now();
    this.tempoBpm = tempo;
    this.currentMeasureIndex = 0;

    this.timerId = setInterval(() => {
      this.onClock();
    }, 100);

    this.onClock();
    if (this.cbPlay !== null) {
      this.cbPlay();
    }
  }

  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    if (this.lastIndicator !== null) {
      this.lastIndicator.remove();
      this.lastIndicator = null;
    }

    if (this.cbStop !== null) {
      this.cbStop();
    }
  }

  private analyzeStructure(track: TrackLike): void {
    const ctx: MeasureContext = { rgi: 0, bi: 0, mi: -1 };
    const at = (c: MeasureContext): MeasureLike => getMeasure(track, c);
    const next = (c: MeasureContext): MeasureLike | null => {
      while (c.rgi < track.reharsal_groups.length) {
        c.mi += 1;
        if (c.mi >= getBlock(track, c.rgi, c.bi).length) {
          c.mi = 0;
          c.bi += 1;
          if (c.bi >= getRehearsalGroup(track, c.rgi).blocks.length) {
            c.bi = 0;
            c.rgi += 1;
            if (c.rgi >= track.reharsal_groups.length) {
              return null;
            }
          }
        }
        return getMeasure(track, c);
      }
      return null;
    };

    let currentTimeMark = new common.Time(4, 4);
    let currentTime = 0;

    let measure = next(ctx);
    const startMeasure = measure;
    const startCtx = cloneContext(ctx);
    let currentLoop: LoopState | null = null;
    const segnos = new Map<string, PointState>();
    const toCodas = new Map<string, ValidatedPointState>();
    let fine: ValidatedPointState | null = null;

    const maxLoop = 1000;
    let loopCount = 0;

    while (measure !== null) {
      if (loopCount > maxLoop) {
        throw new Error("Analyzing error: infinite loop detected.");
      }
      loopCount += 1;

      let nextNeeded = true;
      const elements = this.structureRenderer.classifyElements(measure);

      let jumpLoopIndicator = false;
      for (const element of elements.measure_wide) {
        if (element instanceof common.LoopIndicator) {
          if (currentLoop === null) {
            throw new Error("Invalid loop indicator detected");
          }
          const loopCountValue = currentLoop.cnt;
          if ((element.intindicators ?? []).indexOf(loopCountValue) >= 0) {
            break;
          }
          while ((measure = next(ctx)) !== null) {
            const hit = findElement(measure, (candidate: unknown) => {
              return (
                candidate instanceof common.LoopIndicator &&
                (candidate.intindicators ?? []).indexOf(loopCountValue) >= 0
              );
            });
            if (hit !== null) {
              jumpLoopIndicator = true;
              break;
            }
          }
          break;
        }
      }
      if (jumpLoopIndicator) {
        continue;
      }

      let longRestLength: number | null = null;
      for (const element of elements.measure_wide) {
        if (element instanceof common.LongRest) {
          longRestLength = Number.parseInt(element.longrestlen, 10);
        }
      }

      for (const element of elements.header) {
        if (element instanceof common.LoopBeginMark || element instanceof common.LoopBothMark) {
          if (currentLoop !== null && ctxEq(currentLoop.p, ctx)) {
            currentLoop = { p: currentLoop.p, cnt: currentLoop.cnt + 1 };
          } else {
            currentLoop = { p: cloneContext(ctx), cnt: 1 };
          }
        } else if (element instanceof common.Segno) {
          const segnoKey = String(element.number ?? "");
          if (!segnos.has(segnoKey)) {
            segnos.set(segnoKey, { p: cloneContext(ctx) });
          }
        } else if (element instanceof common.Time) {
          currentTimeMark = element;
        }
      }

      if (measure === null) {
        throw new Error("Active measure unexpectedly null");
      }
      const repeatCount = longRestLength ?? 1;
      const activeMeasure = measure;
      for (let i = 0; i < repeatCount; i += 1) {
        const seqProp: SequenceProperty = {
          t: currentTime,
          duration: currentTimeMark.numer / currentTimeMark.denom
        };
        this.sequence.push([seqProp, activeMeasure]);
        currentTime += seqProp.duration;
      }

      let validFineDetected = false;
      for (const element of elements.footer) {
        if (element instanceof common.LoopEndMark || element instanceof common.LoopBothMark) {
          if (currentLoop !== null && currentLoop.cnt < element.times) {
            measure = at(currentLoop.p);
            Object.assign(ctx, cloneContext(currentLoop.p));
            nextNeeded = false;
            break;
          }
          currentLoop = null;
        } else if (element instanceof common.DalSegno) {
          const segnoKey = String(element.number ?? "");
          const segnoPoint = segnos.get(segnoKey);
          if (segnoPoint === undefined) {
            throw new Error("Segno not found");
          }

          for (const toCodaPoint of toCodas.values()) {
            if (ctxLt(toCodaPoint.p, ctx) && ctxLte(segnoPoint.p, toCodaPoint.p)) {
              toCodaPoint.valid = true;
            }
          }
          if (fine !== null && ctxLt(fine.p, ctx) && ctxLte(startCtx, fine.p)) {
            fine.valid = true;
          }

          measure = at(segnoPoint.p);
          Object.assign(ctx, cloneContext(segnoPoint.p));
          nextNeeded = false;
          currentLoop = null;
          break;
        } else if (element instanceof common.DaCapo) {
          for (const toCodaPoint of toCodas.values()) {
            if (ctxLt(toCodaPoint.p, ctx) && ctxLte(startCtx, toCodaPoint.p)) {
              toCodaPoint.valid = true;
            }
          }
          if (fine !== null && ctxLt(fine.p, ctx) && ctxLte(startCtx, fine.p)) {
            fine.valid = true;
          }

          if (startMeasure === null) {
            throw new Error("Start measure not found");
          }

          measure = startMeasure;
          Object.assign(ctx, cloneContext(startCtx));
          nextNeeded = false;
          currentLoop = null;
          break;
        } else if (element instanceof common.ToCoda) {
          const codaKey = String(element.number ?? "");
          const toCodaPoint = toCodas.get(codaKey);
          if (toCodaPoint !== undefined && toCodaPoint.valid) {
            nextNeeded = false;
            while ((measure = next(ctx)) !== null) {
              const codaHit = findElement(measure, (candidate: unknown) => {
                return candidate instanceof common.Coda && candidate.number === element.number;
              });
              if (codaHit !== null) {
                break;
              }
            }
            break;
          }
          toCodas.set(codaKey, { valid: false, p: cloneContext(ctx) });
        } else if (element instanceof common.Fine) {
          if (fine === null) {
            fine = { valid: false, p: cloneContext(ctx) };
          } else if (fine.valid) {
            validFineDetected = true;
          }
        }
      }

      if (validFineDetected) {
        break;
      }

      if (nextNeeded) {
        measure = next(ctx);
      }
    }
  }

  private onClock(): void {
    const now = Date.now();
    const elapsedMs = now - this.timerStart;
    const measureLengthMs = (1.0 / this.tempoBpm) * 60 * 1000 * 4;

    while (this.currentMeasureIndex < this.sequence.length) {
      const seqEntry = this.sequence[this.currentMeasureIndex];
      if (seqEntry === undefined) {
        break;
      }
      const [seqProp] = seqEntry;
      const startMs = seqProp.t * measureLengthMs;
      const endMs = (seqProp.t + seqProp.duration) * measureLengthMs;
      if (elapsedMs >= startMs && elapsedMs < endMs) {
        break;
      }
      this.currentMeasureIndex += 1;
    }

    if (this.currentMeasureIndex >= this.sequence.length) {
      this.stop();
      return;
    }

    const currentEntry = this.sequence[this.currentMeasureIndex];
    if (currentEntry === undefined) {
      this.stop();
      return;
    }
    const [, measure] = currentEntry;
    const sx = measure.renderprop.sx;
    const ex = measure.renderprop.ex;
    const y = measure.renderprop.y;

    if (this.lastIndicator !== null) {
      this.lastIndicator.remove();
      this.lastIndicator = null;
    }

    this.lastIndicator = measure.renderprop.paper
      .rect(sx, y, ex - sx, 30)
      .attr({ fill: "red", "fill-opacity": 0.3, stroke: 0 });

    if (this.param.auto_scroll) {
      const scrollY = measure.renderprop.paper.canvas.offsetTop + y - window.innerHeight / 2;
      window.scroll(0, scrollY);
    }
  }
}

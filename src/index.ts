
export {
  parse,
  parseWithDiagnostics,
  tokenize,
  createFumenRenderer,
  ParserCompat as Parser,
  DefaultRendererCompat as DefaultRenderer
} from "./api/public-api";
export {
  toMonacoMarkers,
  registerFumenLanguage,
  analyzeAndUpdateMonacoModel
} from "./api/monaco";

export type {
  ParseMode,
  ParseOptions,
  ParseResult,
  ParserDiagnostic,
  ParserDiagnosticRelatedInfo,
  Position,
  SourceSpan,
  SyntaxToken,
  SyntaxTokenKind,
  MonacoMarkerDataLike,
  MonacoNamespaceLike,
  RendererFacade,
  RendererOptions,
  RenderResult,
  RenderTarget
} from "./api/types";

export { setupHiDPICanvas } from "./renderer/graphic";

// Debug
export { getCharProfile } from "./renderer/graphic";
export { canvasTextWithBox } from "./renderer/graphic";
export { canvasText } from "./renderer/graphic";
export { getFontSizeFromHeight } from "./renderer/graphic";

// Export component classes
export {
  RehearsalGroup,
  Block,
  Measure,
  Title,
  SubTitle,
  Artist,
  Chord,
  Rest,
  LongRest,
  Comment,
  Lyric,
  Space,
  MeasureBoundary,
  MeasureBoundaryMark,
  LoopBeginMark,
  LoopEndMark,
  LoopBothMark,
  MeasureBoundaryFinMark,
  MeasureBoundaryDblSimile,
  LoopIndicator,
  Time,
  Coda,
  Segno,
  ToCoda,
  DalSegno,
  DaCapo,
  Fine,
  Simile,
  Variable,
  GenericRow
} from "./common/common";

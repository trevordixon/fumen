
type FontConf = Record<string, string>;

interface TextProfile {
  defaultTextFontConfs: FontConf[] | null;
  defaultTextSizeScale: number;
  titleFont: FontConf[] | null;
  subtitleFont: FontConf[] | null;
  artistFont: FontConf[] | null;
  annotationFont: FontConf[] | null;
  repeatMarkFont: FontConf[] | null;
  paramOverrides: Record<string, number> | null;
}

interface ChordProfile {
  fontSizeScale: number;
  charWidthScale: number;
  mainCharWidth: number;
  spaceCharWidth: number;
  useTextAccidentals: boolean;
  accidentalTextScaleRoot: number;
  accidentalTextScaleTension: number;
  accidentalTextScaleOnBass: number;
  rootAccWidth: number;
  tensionAccWidth: number;
  onBassAccWidth: number;
}

interface RhythmProfile {
  noteAccidentalYOffset: Record<number, number>;
  noteAccidentalHeightScale: number;
  ledgerLineLeftOffset: number;
  ledgerLineRightOffset: number;
  flagBarLengthDeltaStep: number;
  flagWidthScale: number;
  timeSigScale: number;
  timeSigLeftMargin: number;
  timeSigCenterYOffset: number;
}

interface RestProfile {
  stackXShift: number;
  stackYShiftIn5Lines: number;
}

export interface MusicFontProfile {
  text: TextProfile;
  chord: ChordProfile;
  rhythm: RhythmProfile;
  rest: RestProfile;
}

const BRAVURA_PROFILE: MusicFontProfile = {
  text: {
    defaultTextFontConfs: null,
    defaultTextSizeScale: 1.0,
    titleFont: null,
    subtitleFont: null,
    artistFont: null,
    annotationFont: null,
    repeatMarkFont: null,
    paramOverrides: null
  },
  chord: {
    fontSizeScale: 1.0,
    charWidthScale: 0.7,
    mainCharWidth: 0.7,
    spaceCharWidth: 0.3,
    useTextAccidentals: false,
    accidentalTextScaleRoot: 0.56,
    accidentalTextScaleTension: 0.5,
    accidentalTextScaleOnBass: 0.45,
    rootAccWidth: 0.25,
    tensionAccWidth: 0.2,
    onBassAccWidth: 0.2
  },
  rhythm: {
    noteAccidentalYOffset: { 11: -0.5, 1: 0.0, 0: 0.0 },
    noteAccidentalHeightScale: 2.5,
    ledgerLineLeftOffset: -3,
    ledgerLineRightOffset: 12,
    flagBarLengthDeltaStep: 5,
    flagWidthScale: 1.1,
    timeSigScale: 1.0,
    timeSigLeftMargin: 2,
    timeSigCenterYOffset: 0
  },
  rest: {
    stackXShift: 2,
    stackYShiftIn5Lines: -1
  }
};

const PETALUMA_PROFILE: MusicFontProfile = {
  ...BRAVURA_PROFILE,
  text: {
    defaultTextFontConfs: [
      { "font-family": "'Petaluma Script'" },
      { "font-family": "'PetalumaScript'" },
      { "font-family": "'Petaluma Text'" },
      { "font-family": "'PetalumaText'" },
      { "font-family": "'Arial'" }
    ],
    defaultTextSizeScale: 1.02,
    titleFont: [
      { "font-family": "'Petaluma Script'" },
      { "font-family": "'PetalumaScript'" },
      { "font-family": "'Times New Roman'", "font-style": "italic", "font-weight": "bold" }
    ],
    subtitleFont: [
      { "font-family": "'Petaluma Script'" },
      { "font-family": "'PetalumaScript'" },
      { "font-family": "'Petaluma Text'" },
      { "font-family": "'PetalumaText'" },
      { "font-family": "'Arial'", "font-weight": "600" }
    ],
    artistFont: [
      { "font-family": "'Petaluma Script'" },
      { "font-family": "'PetalumaScript'" },
      { "font-family": "'Petaluma Text'" },
      { "font-family": "'PetalumaText'" },
      { "font-family": "'Arial'", "font-weight": "600" }
    ],
    annotationFont: [
      { "font-family": "'Petaluma Script'" },
      { "font-family": "'PetalumaScript'" },
      { "font-family": "'Petaluma Text'" },
      { "font-family": "'PetalumaText'" },
      { "font-family": "'Arial'" }
    ],
    repeatMarkFont: [
      { "font-family": "'Petaluma Script'" },
      { "font-family": "'PetalumaScript'" },
      { "font-family": "'Petaluma Text'" },
      { "font-family": "'PetalumaText'" },
      { "font-family": "'Arial'", "font-weight": "bold" }
    ],
    paramOverrides: {
      title_font_size: 16,
      subtitle_font_size: 11,
      artist_font_size: 13,
      reharsal_mark_font_size: 12
    }
  },
  chord: {
    fontSizeScale: 0.96,
    charWidthScale: 0.71,
    mainCharWidth: 0.71,
    spaceCharWidth: 0.25,
    useTextAccidentals: true,
    accidentalTextScaleRoot: 0.6,
    accidentalTextScaleTension: 0.52,
    accidentalTextScaleOnBass: 0.48,
    rootAccWidth: 0.42,
    tensionAccWidth: 0.36,
    onBassAccWidth: 0.36
  },
  rhythm: {
    ...BRAVURA_PROFILE.rhythm,
    timeSigScale: 1.38,
    timeSigLeftMargin: 1,
    timeSigCenterYOffset: -1
  }
};

const PROFILE_TABLE: Record<string, MusicFontProfile> = {
  bravura: BRAVURA_PROFILE,
  petaluma: PETALUMA_PROFILE
};

export function getMusicFontProfile(type: string): MusicFontProfile {
  const key = Object.prototype.hasOwnProperty.call(PROFILE_TABLE, type) ? type : "bravura";
  return JSON.parse(JSON.stringify(PROFILE_TABLE[key])) as MusicFontProfile;
}

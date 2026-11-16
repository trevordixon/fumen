const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function sampleCode() {
  return `%TITLE="Smoke"\n| C | F | G | C |`;
}

function invalidCode() {
  return `%TITLE="Prelude"\n| C | F |\n%TITLE "Broken"\n[Verse 1\n| C:4 'oops |\n%PARAM {"row_margin": 8}`;
}

function rowAlignCode() {
  return `[A]\n| C |\n<>| D |\n>| E |`;
}

async function run() {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    const first = args[0];
    if (typeof first === "string" && first.includes("@babel/polyfill is loaded more than once")) {
      return;
    }
    originalWarn(...args);
  };

  if (!("self" in globalThis)) {
    globalThis.self = globalThis;
  }

  const umd = require("../dist/fumen.js");
  assert.equal(typeof umd.Parser, "function", "UMD Parser export is missing");
  assert.equal(typeof umd.DefaultRenderer, "function", "UMD DefaultRenderer export is missing");

  const legacyParser = new umd.Parser();
  const legacyTrack = legacyParser.parse(sampleCode());
  assert.ok(legacyTrack, "Legacy parser failed to parse sample code");

  const alignTrack = legacyParser.parse(rowAlignCode());
  assert.ok(alignTrack, "Legacy parser failed to parse row alignment sample");
  const alignMeasures = alignTrack.childNodes[0].childNodes[0].childNodes;
  assert.equal(alignMeasures[0].align, "default", "Bare rows should parse as default alignment");
  assert.equal(alignMeasures[1].align, "expand", "<> rows should parse as explicit expand alignment");
  assert.equal(alignMeasures[2].align, "right", "> rows should parse as explicit right alignment");
  assert.equal(alignTrack.exportCode().includes("<>| D |"), true, "Round-trip export should preserve <> align marker");

  const esmPath = pathToFileURL(path.resolve(__dirname, "../dist/esm/index.mjs")).href;
  const esm = await import(esmPath);

  assert.equal(typeof esm.parse, "function", "ESM parse() export is missing");
  assert.equal(typeof esm.parseWithDiagnostics, "function", "ESM parseWithDiagnostics() export is missing");
  assert.equal(typeof esm.tokenize, "function", "ESM tokenize() export is missing");
  assert.equal(typeof esm.createFumenRenderer, "function", "ESM createFumenRenderer() export is missing");
  assert.equal(typeof esm.Parser, "function", "ESM Parser compatibility export is missing");
  assert.equal(typeof esm.DefaultRenderer, "function", "ESM DefaultRenderer compatibility export is missing");
  assert.equal(typeof esm.toMonacoMarkers, "function", "ESM toMonacoMarkers() export is missing");
  assert.equal(typeof esm.registerFumenLanguage, "function", "ESM registerFumenLanguage() export is missing");
  assert.equal(
    typeof esm.analyzeAndUpdateMonacoModel,
    "function",
    "ESM analyzeAndUpdateMonacoModel() export is missing"
  );

  const parseResult = esm.parse(sampleCode());
  assert.equal(parseResult.ok, true, "ESM parse() returned non-ok result");
  assert.ok(parseResult.track, "ESM parse() did not return a track");
  assert.ok(parseResult.ast, "ESM parse() did not return ast");
  assert.equal(parseResult.diagnostics.length, 0, "Valid parse emitted diagnostics");

  // Regression: a double-quoted "at chord level" text annotation (docs/text.md) must
  // round-trip losslessly through parse -> exportCode, even when the text happens to
  // start with a chord-root letter (A-G). Chord.init()'s validity regex used to accept a
  // *partial* match (e.g. "Bridge" -> root "B" + an incidental "with rest" `r`) as a
  // fully valid chord, silently discarding the unmatched remainder ("idge") with no
  // parse error -- i.e. `parse('| "Bridge" C |').track.exportCode()` produced '| B C |'.
  const quotedTextRegressionCases = ["Bridge", "Break", "Bass", "Crescendo", "Flow"];
  for (const word of quotedTextRegressionCases) {
    const source = `| "${word}" C |`;
    const result = esm.parse(source);
    assert.equal(result.ok, true, `Expected ${JSON.stringify(source)} to parse ok`);
    const exported = result.track.exportCode();
    assert.ok(
      exported.includes(`"${word}"`),
      `Expected double-quoted text "${word}" to round-trip losslessly, got: ${JSON.stringify(exported)}`
    );
  }

  // Regression: quoted text must be able to contain its own delimiter. The tokenizer now
  // understands \" \' \` and \\ inside quoted strings, and Comment/Lyric/quoted-Chord
  // export escapes them, so text like "Don't stop" or 'Say "hi"' round-trips instead of
  // terminating the string early (which previously made the whole chart unparseable).
  const escapeRoundTripCases = [
    { source: `| "Don't stop" C |`, text: "Don't stop" },
    { source: `| 'Say "hi"' C |`, text: 'Say "hi"' },
    { source: `| 'He said "don\\'t"' C |`, text: 'He said "don\'t"' },
    { source: `| "It\\"s here" C |`, text: 'It"s here' },
    { source: '| `don\\`t` C |', text: 'don`t' },
    { source: `| 'back\\\\slash' C |`, text: 'back\\slash' },
  ];
  for (const { source, text } of escapeRoundTripCases) {
    const result = esm.parse(source);
    assert.equal(result.ok, true, `Expected ${JSON.stringify(source)} to parse ok`);
    const exported = result.track.exportCode();
    const reparsed = esm.parse(exported);
    assert.equal(reparsed.ok, true, `Expected re-export of ${JSON.stringify(source)} to re-parse, got ${JSON.stringify(exported)}`);
    assert.equal(
      reparsed.track.exportCode(),
      exported,
      `Expected ${JSON.stringify(source)} to reach a stable export, got ${JSON.stringify(exported)}`
    );
    // The text itself must survive verbatim in the exported code (escaped form).
    const expectedFragments = [
      `"${text.split('\\').join('\\\\').split('"').join('\\"')}"`,
      `'${text.split('\\').join('\\\\').split("'").join("\\'")}'`,
      '`' + text.split('\\').join('\\\\').split('`').join('\\`') + '`',
    ];
    assert.ok(
      expectedFragments.some((fragment) => exported.includes(fragment)),
      `Expected exported code to carry ${JSON.stringify(text)} escaped, got: ${JSON.stringify(exported)}`
    );
  }

  // Same for %VARIABLE values: a title containing a double quote must survive export.
  const titleWithQuotes = esm.parse(`%TITLE="Say \\"Hello\\""\n| C |`);
  assert.equal(titleWithQuotes.ok, true, "Expected a title containing escaped quotes to parse");
  const titleExport = titleWithQuotes.track.exportCode();
  assert.ok(
    titleExport.includes('%TITLE="Say \\"Hello\\""'),
    `Expected the title to export re-escaped, got: ${JSON.stringify(titleExport)}`
  );
  assert.equal(
    esm.parseWithDiagnostics(titleExport, { mode: "strict" }).ok,
    true,
    "Expected the re-exported title to strict-parse"
  );

  // Regression: a syncopation mark (`<:8`) plants an invisible shadow chord in the previous
  // measure; Measure.exportCode() used to emit it as an empty token, so `| Dm7 G7 |` came
  // back as `| Dm7 G7  |` after any re-export. Exports must be whitespace-stable.
  const syncSource = "| Dm7 G7 | CM7:2 <:8 F7:2 |";
  const syncExport = esm.parse(syncSource).track.exportCode();
  assert.ok(!/ {2}/.test(syncExport), `Expected no double spaces in re-export, got ${JSON.stringify(syncExport)}`);
  assert.ok(syncExport.includes("| Dm7 G7 |"), `Expected the untouched measure to round-trip, got ${JSON.stringify(syncExport)}`);
  assert.equal(esm.parse(syncExport).track.exportCode(), syncExport, "Export must be idempotent");

  const parserCompat = new esm.Parser();
  const compatTrack = parserCompat.parse(sampleCode());
  assert.ok(compatTrack, "Parser compatibility shim did not parse sample code");

  const diagnosticsResult = parserCompat.parseWithDiagnostics(sampleCode());
  assert.equal(diagnosticsResult.ok, true, "Expected diagnostics parse to succeed on valid input");
  assert.equal(diagnosticsResult.diagnostics.length, 0, "Expected no diagnostics for valid input");

  const tolerant = esm.parseWithDiagnostics(invalidCode(), { mode: "tolerant", includeTokens: true });
  assert.equal(tolerant.ok, false, "Expected tolerant parse to report non-ok for invalid code");
  assert.ok(tolerant.ast, "Expected tolerant parse to return a best-effort partial ast");
  assert.ok(tolerant.diagnostics.length >= 2, "Expected multiple diagnostics in tolerant mode");
  assert.ok(Array.isArray(tolerant.tokens), "Expected tokens in tolerant parse with includeTokens");
  assert.ok(tolerant.tokens.length > 0, "Expected non-empty token list");

  const strict = esm.parseWithDiagnostics(invalidCode(), { mode: "strict" });
  assert.equal(strict.ok, false, "Expected strict parse to fail invalid code");
  assert.equal(strict.ast, null, "Expected strict parse to not return partial ast");
  assert.ok(strict.diagnostics.length >= 1, "Expected strict diagnostics");

  const tokenKinds = new Set(esm.tokenize(`%TITLE="X"\n[Intro]\n| Cb:4 r:2. |`).map((token) => token.kind));
  assert.ok(tokenKinds.has("directive"), "Expected directive token");
  assert.ok(tokenKinds.has("section"), "Expected section token");
  assert.ok(tokenKinds.has("barline"), "Expected barline token");
  assert.ok(tokenKinds.has("chord-root"), "Expected chord-root token");
  assert.ok(tokenKinds.has("duration"), "Expected duration token");
  assert.ok(tokenKinds.has("rest"), "Expected rest token");

  const markers = esm.toMonacoMarkers(tolerant.diagnostics);
  assert.ok(markers.length > 0, "Expected Monaco markers to be generated");
  const firstMarker = markers[0];
  assert.ok(firstMarker.startLineNumber >= 1, "Marker line must be 1-based");
  assert.ok(firstMarker.startColumn >= 1, "Marker column must be 1-based");
  assert.ok(
    firstMarker.endLineNumber > firstMarker.startLineNumber ||
      firstMarker.endColumn > firstMarker.startColumn,
    "Marker range should be non-empty"
  );
  assert.equal(firstMarker.source, "fumen", "Expected marker source to be fumen");

  const registrations = [];
  const monarchProviders = [];
  const languageConfigs = [];
  const markerWrites = [];
  const monacoStub = {
    languages: {
      register(definition) {
        registrations.push(definition);
      },
      setMonarchTokensProvider(languageId, provider) {
        monarchProviders.push({ languageId, provider });
      },
      setLanguageConfiguration(languageId, config) {
        languageConfigs.push({ languageId, config });
      }
    },
    editor: {
      setModelMarkers(model, owner, modelMarkers) {
        markerWrites.push({ model, owner, modelMarkers });
      }
    }
  };

  const languageId = esm.registerFumenLanguage(monacoStub);
  assert.equal(languageId, "fumen", "Expected Monaco language id");
  assert.equal(registrations.length, 1, "Expected one language registration");
  assert.equal(monarchProviders.length, 1, "Expected one Monarch provider registration");
  assert.equal(languageConfigs.length, 1, "Expected one language configuration registration");

  const modelStub = {
    uri: "inmemory://model.fumen",
    getValue() {
      return invalidCode();
    }
  };
  const analyzed = esm.analyzeAndUpdateMonacoModel(monacoStub, modelStub, { mode: "tolerant" });
  assert.equal(analyzed.ok, false, "Expected analyzed invalid model to be non-ok");
  assert.ok(analyzed.diagnostics.length > 0, "Expected analyzed diagnostics");
  assert.equal(markerWrites.length, 1, "Expected marker write from analyze helper");

  // Transposed spellings read like a lead sheet: no Cb/Fb/E#/B# outside the keys that use them.
  const Chord = umd.Chord;
  assert.equal(Chord.getTranpsoedNote(1, "AUTO", "C", "B", "b"), "B", "Bb up a half step in C is B, not Cb");
  assert.equal(Chord.getTranpsoedNote(1, "AUTO", "C", "E", "b"), "E", "Eb up a half step is E, not Fb");
  assert.equal(Chord.getTranpsoedNote(6, "AUTO", "C", "F", ""), "Cb", "F in C moved to Gb is Cb (IV of Gb)");
  assert.equal(Chord.getTranpsoedNote(2, "AUTO", "C", "G", ""), "A", "plain notes stay plain");

  // The key a chart moves into is one that exists: never D#, G# or A# major.
  const key = (k, t, h) => Chord.getTransposedKeyFromOffset(k, t, h);
  assert.equal(key("G", 1, "AUTO"), "Ab", "G up a half step is Ab, not G# (8 sharps)");
  assert.equal(key("C", 3, "SHARP"), "Eb", "Sharps can't make D# major");
  assert.equal(key("Am", 3, "SHARP"), "Cm", "Am up 3 is Cm, its chords in Eb");
  assert.equal(key("Em", 1, "AUTO"), "Fm");
  assert.deepEqual([key("C", 1, "FLAT"), key("C", 1, "SHARP"), key("C", 1, "AUTO")], ["Db", "C#", "Db"]);
  assert.deepEqual([key("C", 6, "AUTO"), key("G", 11, "AUTO")], ["Gb", "F#"], "F#/Gb: the original key's side");
  assert.deepEqual([key("Dm", 1, "FLAT"), key("Dm", 1, "SHARP")], ["Ebm", "D#m"]);
  assert.deepEqual([key("C#", 0, "AUTO"), key("C#", 0, "FLAT")], ["C#", "Db"]);
  // Keys written loosely still work.
  assert.deepEqual([key("B\u266D", 0, "AUTO"), key("Em7", 0, "AUTO"), key("Bbmaj7", 2, "AUTO"), key("Gbm", 0, "AUTO")], ["Bb", "Em", "C", "F#m"]);
  // Chords keep the writer's spelling when nothing moves; in a moved chart they're spelled in its key.
  assert.equal(Chord.getTranpsoedNote(0, "AUTO", "D", "E", "#"), "E#", "C#7/E# in D keeps its E#");
  assert.equal(Chord.getTranpsoedNote(0, "FLAT", "Gb", "C", "b"), "Cb", "Cb7 in Gb, with flats, stays Cb7");
  assert.equal(Chord.getTranpsoedNote(0, "FLAT", "D", "F", "#"), "F#", "F#m in D stays F#m with flats");
  assert.equal(Chord.getTranpsoedNote(1, "AUTO", "G", "D", ""), "Eb", "G up a half step: its V is Eb");
  assert.equal(Chord.getTranpsoedNote(0, "FLAT", "Abm", "D", "b"), "Db", "Abm, not moved, keeps its flats");
  assert.equal(Chord.getTranpsoedNote(0, "AUTO", "Gb", "F", "b"), "Fb", "a written Fb stays");


  console.warn = originalWarn;
  console.log("API smoke tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

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

  // A chord it can't read draws as text: still ok, with a warning at the chord. Quoted text and
  // N.C. aren't chords and get none.
  const unreadable = esm.parseWithDiagnostics(`| C Fzz:4 :4 :2 | "Solos" | N.C. |\n| Cmaj9#13b |`, { mode: "strict" });
  assert.equal(unreadable.ok, true, "Expected an unreadable chord to still draw");
  assert.deepEqual(
    unreadable.diagnostics.map((d) => [d.code, d.severity, d.span.start.line, d.span.start.column, d.span.end.column]),
    [["FUMEN020", "warning", 1, 5, 8], ["FUMEN020", "warning", 2, 3, 12]],
    "Expected a warning at each unreadable chord"
  );
  assert.match(unreadable.diagnostics[0].message, /"Fzz"/);

  // Mistakes the parser used to fail on silently (it crashed on what it didn't handle): each is
  // named, on its line.
  const named = (code) => esm.parseWithDiagnostics(code, { mode: "strict" }).diagnostics.map((d) => [d.code, d.span.start.line]);
  assert.deepEqual(named(`[Out]\n| C | F |\n| G | C |.`), [["FUMEN013", 3]], "Expected a stray '.' (|. for ||.) to be named");
  assert.deepEqual(named(`| <:8 C:1 | D |`), [["FUMEN014", 1]], "Expected a push in the first bar to be named");
  assert.deepEqual(named(`| C |\n| <:8 G7 | D |`), [], "Expected a push before a chord without a length to be fine");
  assert.deepEqual(named(`| C <:8 F | G |`), [], "Expected a push in the middle of the first bar to be fine");
  assert.equal(esm.parseWithDiagnostics(`| C ./. | .//. | D ||.`, { mode: "strict" }).ok, true, "Expected similes to still parse");

  // Written lengths that don't fill the bar: a warning on the bar's line. Plain bars, pushes
  // (which borrow from the bar before) and time changes are counted right.
  const rhythm = esm.parseWithDiagnostics(`| C | Dm7:2 G7:2 | <:8 CM7:1 |\n| (6/8) C:4. :4. | C:2. D:8 | F7:4. F7:8 r:2 |`, { mode: "strict" });
  assert.equal(rhythm.ok, true, "Expected a short bar to still draw");
  assert.deepEqual(
    rhythm.diagnostics.map((d) => [d.code, d.severity, d.span.start.line, d.message]),
    [
      ["FUMEN021", "warning", 2, "Bar 5 has 7 beats of rhythm in 6/8"],
      ["FUMEN021", "warning", 2, "Bar 6 has 8 beats of rhythm in 6/8"]
    ],
    "Expected a warning at each bar whose rhythm doesn't fill it"
  );

  // The bar before a push is written full (the push borrows from it) or leaving room for the
  // push, which is how it's drawn: neither is a mistake. Short by anything else still is.
  const pushes = (code) => esm.parseWithDiagnostics(code, { mode: "strict" }).diagnostics.map((d) => d.message);
  assert.deepEqual(pushes(`| C:2. r:4 | <:8 F:1 | C:2. r:8 | <:8 F:2.~ :8 | <:8 G:1 |`), [], "Expected a bar that leaves room for the push after it to pass");
  assert.deepEqual(pushes(`| C:2. r:8 | F:1 | C:2 r:8 | <:8 F:1 | C:2. C:8. | <:16 F:1 |`), ["Bar 1 has 3.5 beats of rhythm in 4/4", "Bar 3 has 2.5 beats of rhythm in 4/4"], "Expected room left with no push after it, or the wrong amount of room, to be warned about");

  // A push takes its length from what is played just before it, and the bars it touches are
  // drawn with all their beats, however they were written. `drawn` is each bar as its notes:
  // chord:length, a tie as ~, the pushed note in [brackets].
  const WHOLE = 2 * 3 * 5 * 7 * 9 * 11 * 13 * 64;
  const drawn = (code) => {
    const bars = [];
    const visit = (node) => {
      if (node.constructor.name.replace(/^_/, "") !== "Measure") {
        (node.childNodes || []).forEach(visit);
        return;
      }
      const notes = [];
      let total = 0;
      for (const e of node.childNodes) {
        const kind = e.constructor.name.replace(/^_/, "");
        if (kind === "Simile") notes.push("./.");
        if (kind !== "Chord" && kind !== "Rest") continue;
        const li = e.note_group_list && e.note_group_list[0].lengthIndicator;
        const name = kind === "Rest" ? "r" : (e.chord_name_str || "");
        const text = name + (li ? `:${li.base}${".".repeat(li.numdot)}${li.has_tie ? "~" : ""}` : "");
        notes.push(e.isSyncopationShadowChord ? `[${text}]` : text);
        total += li ? li.length : 0;
      }
      bars.push(notes.join(" ") + (total ? ` = ${total * 4 / WHOLE}` : ""));
    };
    visit(esm.parse(code).track);
    return bars;
  };
  // The bar before a push, written every way: one chord, a full bar, two chords, commas.
  assert.deepEqual(drawn(`| G | F | <:8 G:1 | F:1 | <:8 G:1 |`), ["G", "F:2.~ :8 [G:8~] = 4", "G:1 = 4", "F:2.~ :8 [G:8~] = 4", "G:1 = 4"]);
  assert.deepEqual(drawn(`| F Am | <:8 G:1 | F , , Am | <:8 G:1 | F:2 Am:2 | <:8 G:1 |`).filter((_, i) => i % 2 === 0), ["F:2 Am:4. [G:8~] = 4", "F:2. Am:8 [G:8~] = 4", "F:2 Am:4. [G:8~] = 4"]);
  // Room already left for the push: nothing changes.
  assert.deepEqual(drawn(`| F:2. r:8 | <:8 G:1 | F:2.~ :8 | <:8 G:1 |`).filter((_, i) => i % 2 === 0), ["F:2. r:8 [G:8~] = 4", "F:2.~ :8 [G:8~] = 4"]);
  // Other lengths of push, a rest before it, and a tie that carries on.
  assert.deepEqual(drawn(`| F | <:16 G:1 | F | <:4 G:1 | r:1 | <:8 G:1 | C:1~ | :1 | <:8 F:1 |`).filter((_, i) => (i % 2 === 0 && i < 8) || i === 7), ["F:2.~ :8. [G:16~] = 4", "F:2. [G:4~] = 4", "r:2. r:8 [G:8~] = 4", "C:1~ = 4", ":2.~ :8 [F:8~] = 4"]);
  // One push after another, and a pushed chord with no length of its own.
  assert.deepEqual(drawn(`| C | <:8 F:1 | <:8 G:1 | <:8 Am Dm | G |`), ["C:2.~ :8 [F:8~] = 4", "F:2.~ :8 [G:8~] = 4", "G:2.~ :8 [Am:8~] = 4", "Am:2 Dm:2 = 4", "G"]);
  // Other time signatures.
  assert.deepEqual(drawn(`| (3/4) C | <:8 F:2. | (2/4) C | (4/4) <:8 F:1 |`).filter((_, i) => i % 2 === 0), ["C:2~ :8 [F:8~] = 3", "C:4. [F:8~] = 2"]);
  // In the middle of a bar: with lengths, without, and with room left.
  assert.deepEqual(drawn(`| C:2 <:8 F:2 | C <:8 F | C:4. <:8 F:2 | r:2 <:8 F:2 | C , , <:8 F |`), ["C:4. [F:8~] F:2 = 4", "C:4. [F:8~] F:2 = 4", "C:4. [F:8~] F:2 = 4", "r:4. [F:8~] F:2 = 4", "C:2~ :8 [F:8~] F:4 = 4"]);
  assert.deepEqual(drawn(`| C | C:2 <:8 F:2 |`)[0], "C", "Expected a push in the middle of a bar to leave the bar before alone");
  // A bar that is ./. is drawn as the bar it repeats, pushed; one with no push stays a sign.
  assert.deepEqual(drawn(`| F Am | ./. | ./. | <:8 G:1 |`), ["F Am", "./.", "F:2 Am:4. [G:8~] = 4", "G:1 = 4"]);
  assert.deepEqual(drawn(`| C:4. F:8~ :2 | ./. | <:8 G:1 |`)[1], "C:4. F:8~ :4. [G:8~] = 4");
  // What can't be worked out is left as written: three chords in 4/4, a tuplet to shorten.
  assert.deepEqual(drawn(`| C F G | <:8 Am:1 | C:2 :4_3 :4_3 :4_3 | <:8 F:1 |`).filter((_, i) => i % 2 === 0), ["C F G [Am:8~] = 0.5", "C:2 :4 :4 :4 [F:8~] = 4.5"]);
  // None of it is written back: the source round-trips, and the written lengths are what the
  // bar-length warning counts.
  for (const source of [`| G | F | <:8 G:1 | F:1 | <:8 G:1 |`, `| C | ./. | <:8 F:1 | r:1 | <:8 G | C , , <:8 F |`, `| C:2 <:8 F:2 | C <:8 F | C:1~ | :1 | <:8 F:1 |`]) {
    const out = esm.parse(`[A]\n${source}`).track.exportCode();
    assert.equal(out.replace(/\s+/g, " ").trim(), `[A] ${source}`, "Expected pushes to be written back as they were");
    assert.equal(esm.parse(out).track.exportCode(), out, "Expected the export to be stable");
  }
  assert.deepEqual(pushes(`| F:1 | <:8 G:1 | C:2 <:8 F:2 | C:4. <:8 F:2 | C | ./. | <:8 F:1 |`), [], "Expected full bars and bars with room left to pass, in the middle of a bar too");
  assert.deepEqual(pushes(`| C:2 <:8 F:4 | G |`), ["Bar 1 has 3 beats of rhythm in 4/4"], "Expected a short bar with a push inside it to be warned about");

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

  // Chords move by the same number of letters as the key, so the intervals between them read as
  // written: a fourth stays a fourth (G to C is Gb to Cb or F# to B, never Gb to B).
  const Chord = umd.Chord;
  const moved = (list, t, h, k) => list.map((c) => Chord.transposeSymbol(c, t, h, k)).join(" ");
  assert.equal(moved(["G", "C"], -1, "FLAT", "G"), "Gb Cb");
  assert.equal(moved(["G", "C"], -1, "SHARP", "G"), "F# B");
  assert.equal(moved(["G", "C"], -1, "AUTO", "D"), "Gb Cb", "in Db too: Cb is its flat seventh");
  assert.equal(moved(["Bb", "Eb"], 1, "FLAT", "C"), "Cb Fb");
  assert.equal(moved(["F#", "B"], -1, "AUTO", "C"), "E# A#");
  assert.equal(moved(["Bb/Ab"], 8, "AUTO", "Bb"), "Gb/Fb", "a slash bass keeps its interval too");
  // Only a double flat or sharp steps to its plain neighbour: Db to D, not Db to Ebb.
  assert.equal(moved(["C", "Db"], 1, "FLAT", "C"), "Db D");
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

  // Chord symbols and key names for whatever sits beside a chart: the chart's own spelling.
  assert.equal(Chord.transposeSymbol("Bb7/F", 2, "AUTO", "Bb"), "C7/G");
  assert.equal(Chord.transposeSymbol("F#m7b5", -1, "AUTO", "C"), "E#m7b5");
  assert.equal(Chord.transposeSymbol("Ab/C", 1, "AUTO", "Ab"), "A/C#", "a slash chord keeps its shape");
  assert.equal(Chord.transposeSymbol("Cmaj7", "Db", "AUTO", "C"), "Dbmaj7", "to a named key; the quality as written");
  assert.equal(Chord.transposeSymbol("B\u266D7", 0, "AUTO", "F"), "B\u266D7");
  assert.equal(Chord.transposeSymbol("B\u266D7", 2, "AUTO", "F"), "C7");
  assert.equal(Chord.transposeSymbol("E\u266Dm", 2, "AUTO", "Gb"), "Fm");
  assert.equal(Chord.transposeSymbol("/G", 2, "AUTO", "C"), "/A");
  assert.equal(Chord.transposeSymbol("N.C.", 2, "AUTO", "C"), "N.C.", "not a chord: as it was");
  assert.equal(Chord.transposeSymbol("^text", 2, "AUTO", "C"), "^text");
  assert.deepEqual([Chord.transposeKey("Am", 3, "SHARP"), Chord.transposeKey("G", 1), Chord.transposeKey("H", 1), Chord.transposeKey("", 1)], ["Cm", "Ab", null, null]);

  // Text written before a rest belongs to the rest: kept, written back, and drawn above it.
  {
    const track = new umd.Parser().parse("| Am | 'break'@ r:1 |\n| 'stop'@ r:2 C:2 |");
    const rests = [];
    const walk = (n) => { if (n.getElementName && n.getElementName() === "Rest") rests.push(n); (n.childNodes || []).forEach(walk); };
    walk(track);
    assert.deepEqual(rests.map((r) => r.exceptinal_comment && r.exceptinal_comment.comment), ["break", "stop"]);
    assert.deepEqual(rests.map((r) => r.exportCode()), ["'break'@ r:1", "'stop'@ r:2"]);
    assert.equal(rests[0].clone().exportCode(), "'break'@ r:1");
    const plain = new umd.Parser().parse("| r:1 | 'x'@ C |");
    const plainRests = []; const walk2 = (n) => { if (n.getElementName && n.getElementName() === "Rest") plainRests.push(n); (n.childNodes || []).forEach(walk2); };
    walk2(plain);
    assert.equal(plainRests[0].exportCode(), "r:1");
  }

  // A jump direction at the end of a bar is drawn in the row above the chords, with or without
  // a staff. In a bar with written rhythm it was drawn in the chord row, on top of a chord late
  // in the bar.
  {
    esm.setTextMeasurer({
      measureText: (font, text) => {
        const px = parseFloat((font.match(/([\d.]+)px/) || [0, 10])[1]);
        return { width: text.length * px * 0.6, actualBoundingBoxAscent: px * 0.7, actualBoundingBoxDescent: px * 0.2 };
      },
      alphabeticOffset: () => 0
    });
    const gapAboveChords = async (code, mark) => {
      const [page] = await esm.renderToDrawings(esm.parse(code).track);
      const texts = page.commands.filter((c) => c.op === "text");
      const direction = texts.find((c) => c.text === mark);
      const chord = texts.find((c) => c.text === "B");
      assert.ok(direction && chord, `Expected ${mark} and the chord B to be drawn for ${code}`);
      return { gap: chord.y - direction.y, chordSize: parseFloat(chord.font) };
    };
    const withStaff = await gapAboveChords("| C | Dm7b5:2. <:8 Ab:8 Bb:8 <D.S. al Coda> ||", "D.S. al Coda");
    const chordsOnly = await gapAboveChords("| C | Dm7b5 Ab Bb <D.S. al Coda> ||", "D.S. al Coda");
    assert.equal(withStaff.gap, chordsOnly.gap, "A direction sits as far above the chords with a staff as without");
    assert.ok(withStaff.gap >= withStaff.chordSize / 2, "A direction in a staff row is drawn above the chord row, not in it");
    const fine = await gapAboveChords("| C | F:2. A:8 B:8 <Fine> ||", "Fine");
    assert.equal(fine.gap, chordsOnly.gap, "Fine sits above the chords in a staff row too");

    // %SHOW_STAFF="RHYTHM": a bar's written rhythm is drawn in the bar, without a staff, and its
    // chord names go above. The row keeps a plain row's barlines and is shorter than a staff row.
    const drawn = async (code) => {
      const [page] = await esm.renderToDrawings(esm.parse(code).track, { paper_height: 0 });
      return page;
    };
    const lines = (page, vertical) => page.commands
      .filter((c) => c.op === "path" && typeof c.d === "string" && c.style && c.style.stroke)
      .map((c) => c.d.match(/^M\s*([\d.]+)[ ,]([\d.]+)\s*L\s*([\d.]+)[ ,]([\d.]+)$/))
      .filter((m) => m && (vertical ? m[1] === m[3] : m[2] === m[4]))
      .map((m) => ({ x: +m[1], y: +m[2], length: Math.abs(vertical ? m[4] - m[2] : m[3] - m[1]) }));
    const chordY = (page, name) => page.commands.find((c) => c.op === "text" && c.text === name).y;
    const rhythm = "| C | F | G | D:4. A:8~ :2 ||";
    const staffPage = await drawn(rhythm);
    const rhythmPage = await drawn(`%SHOW_STAFF="RHYTHM"\n${rhythm}`);
    const plainPage = await drawn("| C | F | G | D A ||");
    assert.ok(rhythmPage.height < staffPage.height, "A RHYTHM row is shorter than a staff row");
    assert.ok(rhythmPage.height > plainPage.height, "A RHYTHM row is taller than a plain row");
    assert.equal(
      Math.max(...lines(rhythmPage, true).slice(0, 3).map((l) => l.length)),
      Math.max(...lines(plainPage, true).slice(0, 3).map((l) => l.length)),
      "Barlines on a RHYTHM row are as tall as on a plain row"
    );
    assert.equal(lines(rhythmPage, false).filter((l) => l.length > 100).length, 0, "RHYTHM draws no staff lines");
    assert.ok(lines(staffPage, false).filter((l) => l.length > 100).length >= 5, "The automatic style still draws its staff");
    assert.ok(chordY(rhythmPage, "D") < chordY(rhythmPage, "C"), "Chord names of a bar with rhythm sit above those of a plain bar");
    const similePage = await drawn(`%SHOW_STAFF="RHYTHM"\n| C | F ./. | G | D ||`);
    assert.ok(chordY(similePage, "F") < chordY(similePage, "C"), "A chord in a bar with a simile mark is lifted too");
    assert.deepEqual(
      (await drawn(`%SHOW_STAFF="RHYTHM"\n| C | F | G | D A ||`)).commands,
      plainPage.commands,
      "A row without written rhythm or a simile mark draws as a plain row under RHYTHM"
    );
    esm.setTextMeasurer(null);
  }

  console.warn = originalWarn;
  console.log("API smoke tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

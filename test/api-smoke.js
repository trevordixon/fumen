const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function sampleCode() {
  return `%TITLE="Smoke"\n| C | F | G | C |`;
}

function invalidCode() {
  return `%TITLE="Prelude"\n| C | F |\n%TITLE "Broken"\n[Verse 1\n| C:4 'oops |\n%PARAM {"row_margin": 8}`;
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

  console.warn = originalWarn;
  console.log("API smoke tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

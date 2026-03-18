const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function sampleCode() {
  return `%TITLE="Smoke"\n| C | F | G | C |`;
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
  assert.equal(typeof esm.createFumenRenderer, "function", "ESM createFumenRenderer() export is missing");
  assert.equal(typeof esm.Parser, "function", "ESM Parser compatibility export is missing");
  assert.equal(typeof esm.DefaultRenderer, "function", "ESM DefaultRenderer compatibility export is missing");

  const parseResult = esm.parse(sampleCode());
  assert.equal(parseResult.ok, true, "ESM parse() returned non-ok result");
  assert.ok(parseResult.track, "ESM parse() did not return a track");

  const parserCompat = new esm.Parser();
  const compatTrack = parserCompat.parse(sampleCode());
  assert.ok(compatTrack, "Parser compatibility shim did not parse sample code");

  const diagnosticsResult = parserCompat.parseWithDiagnostics(sampleCode());
  assert.equal(diagnosticsResult.ok, true, "Expected diagnostics parse to succeed on valid input");
  assert.equal(diagnosticsResult.diagnostics.length, 0, "Expected no diagnostics for valid input");

  console.warn = originalWarn;
  console.log("API smoke tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

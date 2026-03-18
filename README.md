# Fumen

Fumen is a lightweight markup language and rendering engine designed to generate chord charts and rhythm charts from simple, easy-to-write text. Fumen supports various types of components commonly used in popular music chord and rhythm charts, such as chord symbols, rhythm slashes, rest marks, repeat marks, rehearsal marks, comments, and lyrics. Fumen is **specialized for creating quick chord and rhythm charts** that are often used in popular music contexts. It is different from other sheet music rendering software and is designed to be simple and intuitive to use. 

## Quick start

* HTML

Just import fumen.js. No other depending modules !
```html
    <script type="text/javascript" src="fumen.js"></script>
```

You can also use the released version in jsdeliver CDN

```html
    <script type="text/javascript" src="https://cdn.jsdelivr.net/gh/hbjpn/fumen@1.3.3/dist/fumen.js"></script>
```

Minified version :

```html
    <script type="text/javascript" src="https://cdn.jsdelivr.net/gh/hbjpn/fumen@1.3.3/dist/fumen.min.js"></script>
```


* Javascript

Reneder a code for canvas element of which id is "canvas".

```javascript

// Make a parser object. 
var p = new Fumen.Parser();

// Parse fumen markdown texts
var track = p.parse(code);

// Target canvas element
var canvas = document.getElementById("canvas");

// Maker a renderer object.
var renderer = new Fumen.DefaultRenderer(canvas);

// Render it !
renderer.render(track);
```

* ESM (new API surface)

```javascript
import { parse, createFumenRenderer } from "fumen";

const parsed = parse(code);
if (!parsed.ok) {
  console.error(parsed.diagnostics);
} else {
  const renderer = createFumenRenderer(document.getElementById("canvas"));
  await renderer.render(parsed.track, { music_font: "petaluma" });
}
```

Legacy runtime classes remain available for compatibility:

```javascript
import { Parser, DefaultRenderer } from "fumen";
// Same behavior as Fumen.Parser / Fumen.DefaultRenderer in UMD.
```

## Music Fonts

You can switch music glyphs to bundled Petaluma:

```javascript
var renderer = new Fumen.DefaultRenderer(canvas);
renderer.render(track, {
    music_font: "petaluma"
});
```

You can also use your own pack:

```javascript
var renderer = new Fumen.DefaultRenderer(canvas);
renderer.render(track, {
    music_font: "custom",
    music_font_data: myMusicFontPack // JSON object keyed by glyph names like "uniE0A2"
});
```

Custom packs must include the required glyph keys:
`uni266D`, `uni266E`, `uni266F`, `uniE045`, `uniE046`, `uniE047`, `uniE048`, `uniE050`, `uniE062`, `uniE080`, `uniE081`, `uniE082`, `uniE083`, `uniE084`, `uniE085`, `uniE086`, `uniE087`, `uniE088`, `uniE089`, `uniE0A2`, `uniE0A3`, `uniE0A4`, `uniE4E5`, `uniE4E6`, `uniE4F4`, `uniE4F5`, `flag_f1`, `flag_i1`, `flag_f2`, `flag_i2`, `flag_f3`, `flag_i3`, `flag_f4`, `flag_i4`.

Useful render params:

- `music_font`: `"bravura"` (default), `"petaluma"`, `"custom"`
- `music_font_data`: required glyph pack object when `music_font: "custom"`
- `minor_chord_style`: `"minus"` (default) or `"m"`
- `chord_font_scale`: extra multiplier for chord symbol sizing
- `section_margin_top`: extra vertical space before rows starting a rehearsal section

## Documentation
https://hbjpn.github.io/fumen/

## License
MIT

Fonts are under SIL Open Font License found in OFL.txt.

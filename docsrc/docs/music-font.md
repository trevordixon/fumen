# Custom Music Font Workflow (Petaluma Example)

Fumen supports custom music glyph packs at render time:

```javascript
renderer.render(track, {
    music_font: "custom",
    music_font_data: customPack
});
```

Bundled Petaluma is also available:

```javascript
renderer.render(track, {
    music_font: "petaluma"
});
```

## 1. Prepare the source font

Use a SMuFL-compatible font file, for example Petaluma (`.otf` or `.woff`).

## 2. Extract required glyphs with `src/font-make.html`

1. Build and open the tool page (`src/font-make.html`).
2. Click `Open` and load your font's SVG font source.
3. Select these glyph names:
   - `uni266D`, `uni266E`, `uni266F`
   - `uniE045`, `uniE046`, `uniE047`, `uniE048`, `uniE050`, `uniE062`
   - `uniE080`, `uniE081`, `uniE082`, `uniE083`, `uniE084`, `uniE085`, `uniE086`, `uniE087`, `uniE088`, `uniE089`
   - `uniE0A2`, `uniE0A3`, `uniE0A4`
   - `uniE4E5`, `uniE4E6`, `uniE4F4`, `uniE4F5`
   - `flag_f1`, `flag_i1`, `flag_f2`, `flag_i2`, `flag_f3`, `flag_i3`, `flag_f4`, `flag_i4`
4. Click `Generate SVG set` and copy the JSON output.

The generated object entries should look like:

```json
{
  "uniE0A2": {
    "dataURL": "data:image/svg+xml;base64,...",
    "bbox": { "x": 0, "y": 0, "width": 422, "height": 250 },
    "origName": "uniE0A2",
    "origFont": "Petaluma"
  }
}
```

## 3. Pass the pack to renderer

```javascript
const renderer = new Fumen.DefaultRenderer(canvas);
renderer.render(track, {
    music_font: "custom",
    music_font_data: petalumaPack
});
```

If any required glyph is missing, renderer throws an explicit error with the missing keys.

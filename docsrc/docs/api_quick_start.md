# Quick Start
```javascript
    var code = ... ;
    var canvas = document.getElementById("canvas");

    var parser = new Fumen.Parser();
    var renderer = new Fumen.DefaultRenderer(canvas);

    var track = parser.parse(code);
    renderer.render(track);
```

## Use A Custom Music Font Pack

```javascript
    // myMusicFontPack is a JSON object with required glyph entries
    // such as uniE0A2, uniE0A3, uniE0A4, uniE047, uniE048, etc.
    renderer.render(track, {
        music_font: "custom",
        music_font_data: myMusicFontPack
    });
```

## Use Bundled Petaluma

```javascript
    renderer.render(track, {
        music_font: "petaluma"
    });
```

## Chord and Section Styling Options

```javascript
    renderer.render(track, {
        chord_font_scale: 0.9,
        minor_chord_style: "m",   // "minus" or "m"
        section_margin_top: 16
    });
```

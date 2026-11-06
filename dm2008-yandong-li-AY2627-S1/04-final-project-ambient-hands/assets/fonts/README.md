# Local font sources

- `Helvetica.ttf`: exact copy of `D:\fonts\helvetica-255\Helvetica.ttf`.
- `Helvetica-Light.woff`: web-compatible copy of `D:\fonts\helvetica-255\helvetica-light-587ebe5a59211.ttf`.

The source Light TTF has incomplete glyph-name data and was rejected by the browser. Its `post` table was rebuilt as format 3 and the font was saved as WOFF with FontTools.

The v2 webfont also removes legacy TrueType hinting: per-glyph instructions and the `fpgm`, `prep`, and `cvt ` tables. At 16 CSS pixels and device-pixel ratio 1.5, the original instructions produced weak, broken-looking strokes in the control panel. A same-size, same-color browser comparison isolated the improvement to removing hinting; changing the `gasp` grayscale flag alone did not visibly fix it. The original `gasp` settings are retained.

All 227 mapped glyph outlines, advance widths, character mappings, weight metadata and units-per-em were verified unchanged. No emboldening or stroke expansion is applied. Neither source font in `D:\fonts\helvetica-255` was modified. CSS uses `?v=2` so browsers reload the repaired webfont instead of keeping the old cached copy.

The two CSS families are `Helvetica` and `Helvetica Light`. No external font service is used.

# SchoolLove symbolic campus art

Built-in imagegen, generated 2026-09-10 for the user-approved Game Visual V1.
Not photographs or representations of any named school. No people, school logo,
text, numeric growth or individual activity is encoded in the images.

| Final file | Dimensions | Bytes | Alpha |
|---|---:|---:|---|
| memory-seed.webp | 1000 × 667 | 190572 | yes |
| growing-campus.webp | 1000 × 667 | 188926 | yes |

Source PNGs were 1536 × 1024. Sharp resized to 1000 pixels wide and encoded WebP
quality 88, preserving alpha. Next Image serves responsive derivatives. No PNG
source or rejected checkerboard image is shipped. Combined source payload 379498
bytes; users normally receive a smaller responsive derivative.

Growing-campus generation prompt:

Use case: stylized-concept. Asset type: transparent website hero illustration for
SchoolLove growth game UI. A polished original floating nostalgic Korean school
campus island for a 19+ alumni community; no real school identity. A warm ivory and
coral two-storey campus building with simple blue roof, leafy trees, grass, paths,
a tiny flag, flowers and soft floating clouds. No people. Clean readable silhouette
and generous transparent space around it, suitable beside DOM text and cards.
Premium pastel 3D-like digital illustration with painterly miniature-island depth,
sophisticated and friendly. Sky blue, periwinkle, lavender, peach pink, warm green,
deep navy accents. Golden after-school light, optimistic nostalgic. Genuine
transparent background; generic fictional school; no text, logo, badges, numbers,
watermark, UI, photo-realism, real-school crests or people.

Memory-seed generation prompt:

Use case: stylized-concept. Asset type: original transparent web game campus
illustration, MEMORY_SEED stage. Reference only for style/color/perspective.
Earlier, simpler stage of the same warm generic Korean-school floating island:
modest small single-storey ivory and peach school, muted blue roof, gentle central
gable, simple windows and welcoming entrance; two sparse green trees, quiet tidy
lawn, restrained planting, small path, floating grassy rock base and peach-white
clouds. Charming, cared-for and polished. Match pastel 3D/painterly rendering,
nostalgic warmth, textured grass/rock, soft golden upper-left sunlight and elevated
three-quarter front perspective. Landscape 1536 × 1024, complete centered island,
clear transparent margins, no cropping, much simpler density. Actual alpha; no
opaque backdrop or checkerboard. No text, letters, logos, numbers, signs, flags,
people, silhouettes or real-school likeness.

The first seed output contained a baked checkerboard. Its final targeted edit:
"Use case: background-extraction. EDIT TARGET supplied island image. Preserve
exactly the building, two trees, island, path, flowers and clouds. Remove ALL gray
checkerboard background. Deliver genuinely transparent PNG with actual alpha
channel. Do not render a pattern representing transparency. No background color.
No added text or symbols. Only repair background, keep all foreground artwork
unchanged. Output standalone game asset."

A separate two-storey reunion candidate failed the alpha gate after correction
and was excluded. FIRST_REUNION deliberately reuses the seed artwork with larger
scale, warmer glow and additional accents; it is not advertised as a third asset.

## 2026-09-10 follow-up: Game Visual Polish V1 (PARTIAL)

The paragraphs above describe PR112, not the follow-up candidate. The original
two WebP files are unchanged. The user subsequently required the original cute
boy/girl duo, **not three adult alumni**. No discarded adult character is shipped.

| Added file | Dimensions | Bytes | Purpose |
|---|---:|---:|---|
| school-friends-v1.webp | 480 × 400 | 47440 | Fixed decorative boy/girl duo |
| first-reunion-v1.webp | 1000 × 667 | 148452 | Small school, benches and gathering circle |
| lively-school-v1.webp | 1000 × 667 | 167344 | Larger campus, formal garden and gazebo |
| growing-campus-v2.avif | 1000 × 667 | 62666 | Same existing campus, lighter Home LCP source |

All have actual alpha. White/pastel/navy composites and pixel-alpha statistics
are retained in `.local/game-visual-polish/`. The first three were generated and
background-extracted with the built-in image tool, then resized/encoded with
installed Sharp. School WebP quality82/alphaQuality100/effort6; duo quality82.
AVIF is a deterministic re-encoding of unchanged growing-campus.webp using Sharp
quality50/effort6/chroma4:2:0. A typed picture source uses AVIF where supported;
responsive Next WebP remains the fallback. No CDN setting or package changed.

Generation/edit brief summaries (not verbatim transcript):

- Duo: use the first mockup's cute boy and girl, compact proportions, happy
  expressions, school-style clothing and backpacks; exactly two full-body
  characters, no third adult; same soft miniature painterly/3D rendering and
  warm upper-left lighting; no text/logo; actual transparent surround. Targeted
  extraction: preserve both figures and remove every baked checkerboard pixel.
- First reunion: preserve the small school's style/camera; add curved flower
  paths, benches and a visible circular gathering area. Same floating island,
  3:2 framing, no people/text/logo. Extract background only; real alpha required.
- Lively school: preserve the larger school's style/camera; add a formal radial
  garden and a gazebo. Same floating island and 3:2 framing, no people/text/logo.
  Extract background only; real alpha required.
- Bright memory: requested a substantial entry arch, balustrade and lantern
  structures on the lively layout. Repeated outputs retained opaque checkerboard
  pixels or changed the framing; **none is shipped**.

Accepted local generation IDs: duo `exec-ba7193a8-a25b-41cb-b12b-df18352ebe7e`,
reunion `exec-8d4c2d41-3bd9-483f-ba17-6ee2ca46e0eb`, lively
`exec-a1f21d79-3ac6-43b3-a258-966ecc637510` (PNG sources retained locally).
Sources were 1374×1145 for duo and 1536×1024 for schools.

There are currently **four distinct campus forms across five stage IDs**.
BRIGHT_MEMORY reuses lively-school-v1 pending an approved real-alpha arch asset.
Neither glow nor scale is counted as a fifth form. This blocks Ready/canonical
merge; the candidate is for feature Preview review only.

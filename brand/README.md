# Brand assets — Game On Portugal

The community's identity, vendored into the repo (M8.1). Before this, there was
**no logo file anywhere in the tree** — the old static site's `index.html`
referenced an `assets/img/logo.png` that did not exist (that directory,
`webpage/`, was deleted on 2026-08-21) — and every design document quoted hex
values nobody could check against the actual artwork.

## Sources

Both files are the guild's own assets, pulled from the Discord API on
**2026-08-20** for guild `818108848492773377`:

| File | Origin | Size |
| ---- | ------ | ---- |
| `guild-icon-1024.png` | guild `icon` (`b5d2486a…`) | 836×836 RGBA |
| `logo-lockup-2048.png` | guild `discovery_splash` (`5e6f2c11…`) | 2048×1572 RGB |

`guild-icon-1024.png` is the mark alone: a white flaming gamepad-skull with
four coloured face buttons. `logo-lockup-2048.png` is the full lockup — mark,
the heavy brush "GAME ON / PORTUGAL" wordmark, and the four platform glyphs.

The guild has **no banner** (`banner: null`), so there is no wide hero asset;
the lockup is the closest thing and is what the OG card is built from.

> These are the *source* files. Do not edit them in place — derive from them,
> the way `portal/web/public/` does, so re-deriving is always possible.

## Palette — measured, not quoted

Every hex below was sampled from `guild-icon-1024.png` itself, not copied from
a design document. All four face-button colours are **exact** matches for the
values `docs/plans/00-overview.md` and `03-portal.md` already used, so those
documents are confirmed correct rather than merely assumed.

| Colour | Hex | Role | Share of icon |
| ------ | --- | ---- | ------------- |
| Background | `#060302` | near-black surface | 64.8% |
| Foreground | `#FFFFFF` | the mark, all body text | 23.2% |
| Blue | `#4199E7` | PlayStation / `wanted` listings | 500 px |
| Red | `#EA3223` | Xbox | 498 px |
| Mint | `#8AFBCC` | Nintendo / `sell` listings | 397 px |
| Yellow | `#FFFD54` | PC | 345 px |

The lockup's background is `#070302` — one unit off the icon's `#060302`, and
close enough that the two composite without a visible seam once the CDN's
1–2 px light resize border is cropped off (see the note in the derivation
below).

**Accessibility.** These accents are for fills, borders and icons — *not* text
on the dark background. `#EA3223` on `#060302` is roughly 4.1:1, which fails AA
for body text; `#FFFD54` and `#8AFBCC` pass comfortably but are inconsistent as
a set. Keep text white or near-white and the question never arises.

## Derived assets

Generated into `portal/web/public/`:

| File | From | Notes |
| ---- | ---- | ----- |
| `favicon-32.png` | icon | tab icon |
| `favicon-192.png` | icon | Android home screen |
| `favicon-512.png` | icon | PWA / maskable |
| `apple-touch-icon.png` | icon | 180×180, iOS home screen |
| `og-image.png` | lockup | 1200×630 social card |

Two things the derivation does deliberately:

- **Composites onto `#060302` instead of keeping alpha.** The mark is white
  line-art on transparency. Anything that renders it against a light surface —
  a browser tab in light mode, an iOS home screen — would otherwise show white
  on white and appear blank.
- **Crops the icon to the mark's bounding box first.** The guild icon is padded
  for Discord's circular crop; the mark is 611×765 inside an 836×836 frame. At
  32 px that padding costs about a third of the linear resolution and the flame
  detail stops reading at all. The mark is tall and narrow, so a square tile
  still carries some horizontal padding — that is the artwork's proportions,
  not a mistake.

The OG card fits rather than crops: the lockup is roughly 4:3 and a centre-crop
to 1.91:1 would cut the wordmark off.

## Still open

**A vector trace of the mark has not been done.** This is detailed line-art —
flame, concentric gamepad rings, D-pad, skull teeth — and hand-authoring an SVG
path set for it would produce something that merely resembles the brand. That
is worse than an honest raster: a wrong logo is more damaging than a slightly
soft one.

What is needed is the original vector artwork from whoever designed it, or a
pass through a real tracing tool. Until then the PNGs above are the brand, and
they are correct.

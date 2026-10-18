# TeX Live runtime subset

LightningTeX includes a **5,597-file runtime subset** of the TeXlyre `assets-v1.4.0` TeX Live 2026 snapshot. It is not a complete TeX Live installation. The upstream snapshot already omits package documentation and many source files; LightningTeX additionally removes other engines' formats and resources, METAFONT sources, optional AFM metrics, and build logs. Retained package and font contents are unchanged; filename databases are regenerated and the tree is repacked in 16 KiB LZ4 blocks.

The original collection notices are reproduced in [TeX-Live-LICENSE.txt](TeX-Live-LICENSE.txt) and [CTAN-LICENSE.txt](CTAN-LICENSE.txt). There is no single license for all TeX Live components. Copyright and license notices inside retained files remain in the data image. Report problems with this subset to [LightningTeX](https://github.com/CodeBoy2006/LightningTeX/issues), rather than treating it as an upstream-supported installation.

## Macro sources and complete works

| Component | License and accompanying notice | Complete upstream work / source |
| --- | --- | --- |
| LaTeX2e base, format 2025-11-01 patch 0 | [LPPL 1.3c](LPPL-1.3c.txt), [LaTeX legal notice](LaTeX-LEGAL.txt) | [LaTeX2e release-2025-11-01](https://github.com/latex3/latex2e/tree/release-2025-11-01), including `base/manifest.txt`, `.dtx` and `.ins` files |
| luaotfload 3.29 (2024-12-03), including its ConTeXt-derived font loader | [Upstream COPYING with GPLv2-only clarification](Luaotfload-COPYING.txt) | [luaotfload source](https://github.com/latex3/luaotfload), [complete CTAN package](https://ctan.org/tex-archive/macros/luatex/generic/luaotfload) |
| Other LaTeX packages, including amsmath, graphics, tools and fontspec | Their retained file headers specify the applicable terms; [LPPL 1.3c](LPPL-1.3c.txt) is included for LPPL components | [LaTeX required packages](https://ctan.org/tex-archive/macros/latex/required), [fontspec](https://ctan.org/pkg/fontspec) |

Obtain the full TeX Live distribution through the [official TeX Live download instructions](https://tug.org/texlive/acquire.html); [historic releases](https://tug.org/historic/) provide older distributions. Individual complete macro and font works are available through [CTAN](https://ctan.org/). Use the package versions recorded in the retained file headers when reconstructing this snapshot, rather than silently substituting a newer package.

The exact runtime input and the local extraction/pruning recipe are listed in `engine/build/README.md` inside `source.zip`; [SOURCES.md](../SOURCES.md) explains how to obtain that archive. The TeX Live C/C++ engine source archive is separate from these macro and font source works.

## Bundled outline fonts

| Font files / family | Copyright and license | Complete work / source |
| --- | --- | --- |
| Latin Modern (`fonts/{opentype,type1}/public/lm`) | B. Jackowski and J. M. Nowacki, on behalf of TeX users groups; the bundled `lmroman10-regular.otf` records Copyright 2003, 2009 and version 2.004. [GUST Font License](GUST-FONT-LICENSE.txt), based on LPPL 1.3c | [Latin Modern](https://ctan.org/tex-archive/fonts/lm) |
| AMSFonts, including AMS-distributed Computer Modern Type 1 | American Mathematical Society; [OFL 1.1 with copyright and reserved font names](AMS-OFL-1.1.txt) | [AMSFonts](https://ctan.org/tex-archive/fonts/amsfonts) |
| URW Standard Symbols L and Dingbats (`usyr`, `uzdr`, version 001.005) | Copyright URW Software, Copyright 1997 by URW. [GPLv2](GPL-2.0.txt) and the [font-embedding exception retained in both PFB files](URW-FONT-NOTICE.txt) | [Legacy URW Base35](https://ctan.org/tex-archive/fonts/urw/base35), not the newer Artifex font collection |
| Redacted Regular (`fonts/truetype/public/luacensor`) | Copyright 2013 The Redacted Project Authors; [OFL 1.1](Redacted-OFL-1.1.txt) | [Redacted font source](https://github.com/christiannaths/redacted-font) |
| Philokalia Regular | Copyright 2006–2007 Apostolos Syropoulos and Ioannis Gamvetas; [OFL text extracted from the bundled font's name table](Philokalia-OFL-1.1.txt). The LaTeX support package has separate LPPL terms | [Philokalia](https://ctan.org/tex-archive/fonts/philokalia) |
| Ralph Smith's Formal Script (`rsfs`) | [Original permission and rename condition](RSFS-README.txt); [Type 1 conversion notice](RSFS-TYPE1.txt) | [RSFS, including METAFONT sources](https://ctan.org/tex-archive/fonts/rsfs) |
| pdfTeX space fonts (`pdftexspace`, `dummy-space`) | Retained source/font notices: `pdftexspace.ps` declares public domain (Han The Thanh and Karl Berry, 2023); `dummy-space.pfb` retains Han The Thanh's 2010 copyright | [pdfTeX source and support files](https://ctan.org/tex-archive/systems/pdftex) |

Computer Modern METAFONT-derived metrics are distinct from the AMS Type 1 outlines. Knuth's original source files require renaming if modified; the complete originals are at [CTAN Computer Modern](https://ctan.org/tex-archive/fonts/cm). This subset does not modify those metrics and omits METAFONT sources. TeX Gyre outline fonts are not present in this runtime image.

## Origin of the license copies

- Inter: the pinned Google Fonts OFL source linked in `THIRD-PARTY-NOTICES.md`.
- LPPL: <https://www.latex-project.org/lppl.txt>; LaTeX legal notice: `base/legal.txt` in release-2025-11-01.
- Luaotfload: upstream `COPYING`; GPLv2: legacy URW Base35 `COPYING`.
- GUST: `fonts/lm/doc/fonts/lm/GUST-FONT-LICENSE.TXT` on CTAN; AMS: `fonts/amsfonts/doc/OFL.txt`.
- Redacted: Google Fonts `ofl/redacted/OFL.txt`; Philokalia and URW embedding notices: the bundled font files themselves.
- RSFS: CTAN `fonts/rsfs/README` and `fonts/rsfs/type1/README`.

# Offline Test Fixtures

This directory contains TeX Live 2026 files used by the Node regression suites (`tests/worker-harness.cjs` and `tests/bibliography.mjs`) so that all automated tests run deterministically offline. These files are used only during testing and are excluded from production builds.

## Contents

- **`tex-packages.json.gz`**: Gzip-compressed JSON array of `[cacheFilename, base64Bytes]` pairs containing nine unmodified `microtype` and `booktabs` files from TeX Live 2026 (including the Lua module `51_microtype` and format `26` TeX input files). `tests/worker-harness.cjs` registers these entries via `kpse_remote_register`.
  - License: LaTeX Project Public License (LPPL). Upstream sources: <https://ctan.org/pkg/microtype> and <https://ctan.org/pkg/booktabs>.
- **`plain.bst`**: Unmodified copy of BibTeX's standard `plain` bibliography style (by Howard Trickey and Oren Patashnik, Kpathsea format `7/plain.bst`), used by `npm run test:bibliography`.

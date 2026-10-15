# Offline TeX package fixture

`tex-packages.json.gz` is a gzip-compressed JSON array of `[BusyTeX cache filename, base64 bytes]` pairs. It contains nine unmodified microtype/booktabs files fetched from `https://texlive2026.texlyre.org` on 2026-10-12, including the Lua module stored as `51_microtype`. Other filenames start with format `26`.

These are the files used by the runtime and incremental regression documents with the shipped basic dataset. The Node worker harness registers them through BusyTeX's existing remote-file API because Node has no browser XMLHttpRequest. Tests therefore stay offline without requiring the recommended collection. The fixture is outside `public` and is not shipped to browsers. Actual browser cold-download and cache-reuse checks are recorded in the root `QA.md`.

Original license and copyright headers are retained inside the files. Microtype and booktabs use the LaTeX Project Public License; upstream sources and complete distributions are available at <https://ctan.org/pkg/microtype> and <https://ctan.org/pkg/booktabs>.

`plain.bst` is an unmodified copy of BibTeX's standard `plain` style (Howard Trickey and Oren Patashnik; unlimited copying of the unmodified file is permitted, see its header), fetched from the same endpoint as `7/plain.bst`. The bibliography regression passes it as a project file, because the offline Node harness has no remote lookup.

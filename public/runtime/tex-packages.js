/* shortcut: only full jobs persist downloads; add a fetch hook if live-only files need persistence. */
self.registerBundledFontMisses = function (engine) {
  const fs = engine.FS, names = new Set(), misses = [];
  function visit(path) {
    for (const name of fs.readdir(path)) {
      if (name === '.' || name === '..') continue;
      const file = path + '/' + name;
      if (fs.isDir(fs.stat(file).mode)) visit(file);
      else names.add(name);
    }
  }
  visit('/texlive/texmf-dist/fonts');
  // Skip optional companion probes for the fonts supplied by bundled packages.
  // Kpathsea formats: TFM 3, OFM 20, OVF 23, VF 33, other text 39.
  for (const name of names) {
    const stem = name.replace(/\.(tfm|otf|ttf)$/i, '');
    const formats = /\.tfm$/i.test(name) ? [[20,'.ofm'],[23,'.ovf'],[33,'.vf']]
      : /\.(otf|ttf)$/i.test(name) ? [[3,'.tfm'],[20,'.ofm'],[39,'']] : [];
    for (const [format,suffix] of formats) if (!names.has(stem + suffix)) {
      misses.push(format + '/' + stem);
      if (suffix) misses.push(format + '/' + stem + suffix);
    }
  }
  engine.kpse_remote_register_misses(misses);
};
self.restoreTexPackages = async function (engine, warn) {
  engine.saveTexPackages = async () => {};
  if (!self.caches || !/^https?:/.test(self.location.href)) return;
  const endpoint = engine.ENV.TEXLIVE_REMOTE_ENDPOINT;
  if (!endpoint) return;
  const directory = '/tmp/texlive_remote', saved = new Set();
  const valid = name => /^\d+_[a-zA-Z0-9._-]+$/.test(name);
  const key = name => new URL('texlive-cache/' + name, self.location.href).href;
  let cache;
  try {
    cache = await caches.open('lightningtex-texlive-2026-assets-v1.4.0:' + endpoint);
    engine.FS.mkdirTree(directory);
    for (const request of await cache.keys()) {
      const name = new URL(request.url).pathname.split('/').pop();
      if (!valid(name) || request.url !== key(name)) continue;
      const response = await cache.match(request);
      if (!response?.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length) continue;
      engine.FS.writeFile(directory + '/' + name, bytes);
      saved.add(name);
    }
  } catch (error) {
    warn('Warning: TeX package cache unavailable: ' + error.message);
    return;
  }
  engine.saveTexPackages = async () => {
    try {
      for (const name of engine.FS.readdir(directory)) {
        if (!valid(name) || saved.has(name)) continue;
        await cache.put(key(name), new Response(engine.FS.readFile(directory + '/' + name)));
        saved.add(name);
      }
    } catch (error) {
      warn('Warning: TeX package cache write failed: ' + error.message);
    }
  };
};

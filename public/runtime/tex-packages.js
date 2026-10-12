/* shortcut: only full jobs persist downloads; add a fetch hook if live-only files need persistence. */
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

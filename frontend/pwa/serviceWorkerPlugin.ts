import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { Plugin } from 'vite';

/** Files of `public/` that belong to the app shell (the rest is fetched on demand). */
const PUBLIC_SHELL = /^(favicon\.svg|manifest\.json|icons\/.+\.png)$/;

function publicFiles(dir: string, root = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? publicFiles(join(dir, entry.name), root)
      : [relative(root, join(dir, entry.name)).replaceAll('\\', '/')],
  );
}

/**
 * Emits `sw.js` for the production build: the template from `pwa/sw.template.js` with the list
 * of the build's own files (hashed bundles, the shell page, icons) and a version derived from
 * that list — so every deploy ships a different worker and the browser picks it up.
 * There is no worker in development.
 */
export function serviceWorker(): Plugin {
  let publicDir = '';
  return {
    name: 'mayak-service-worker',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter(
        (file) => !file.endsWith('.map') && file !== 'index.html',
      );
      const shell = publicFiles(publicDir).filter((file) => PUBLIC_SHELL.test(file));
      const files = ['/', ...[...built, ...shell].sort().map((file) => `/${file}`)];
      const version = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 12);
      const template = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace('__VERSION__', version)
          .replace('__PRECACHE__', JSON.stringify(files, null, 2)),
      });
    },
  };
}

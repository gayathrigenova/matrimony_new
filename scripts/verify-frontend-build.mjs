import { statSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = resolve(projectRoot, 'dist');
const html = readFileSync(resolve(distDirectory, 'index.html'), 'utf8');
const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(([, reference]) => reference)
  .filter((reference) => /\.(?:js|css)(?:[?#]|$)/i.test(reference));

if (!references.some((reference) => /\.js(?:[?#]|$)/i.test(reference))) {
  throw new Error('dist/index.html does not reference a JavaScript bundle');
}

if (!references.some((reference) => /\.css(?:[?#]|$)/i.test(reference))) {
  throw new Error('dist/index.html does not reference a CSS bundle');
}

for (const reference of references) {
  if (!reference.startsWith('/assets/')) {
    throw new Error(`Unexpected frontend asset URL: ${reference}`);
  }

  const assetPath = resolve(distDirectory, `.${reference.split(/[?#]/, 1)[0]}`);
  const relativePath = relative(distDirectory, assetPath);
  if (relativePath.startsWith(`..${sep}`) || relativePath === '..') {
    throw new Error(`Asset URL resolves outside dist/: ${reference}`);
  }

  if (!statSync(assetPath).isFile()) {
    throw new Error(`Asset URL does not point to a file: ${reference}`);
  }

  console.log(`${reference} -> exists`);
}

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Exact files authorized by the user to contain original image references.
const referenceFiles = new Set([
  'docs/LOCAL-REFERENCES.md',
  'preview/references/images.json',
  'preview/references/index.html',
]);
const references = JSON.parse(await readFile('preview/references/images.json', 'utf8'));
const originalImages = new Set();
for (const subject of references.subjects) {
  for (const url of [subject.previewUrl, subject.previewWithNameUrl,
    ...subject.images.flatMap(image => [image.url, image.urlWithName])].filter(Boolean)) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'files.reela.com'
      || !parsed.pathname.startsWith('/reflix/image/') || parsed.search || parsed.hash
      || parsed.username || parsed.password) throw new Error('Unexpected image reference');
    originalImages.add(url);
  }
}
const credentialPattern = new RegExp([
  'AK'+'IA[0-9A-Z]{16}', 'AS'+'IA[0-9A-Z]{16}', 'gh'+'[pousr]_[A-Za-z0-9]{30,}',
  '-----BEGIN '+'(?:RSA |EC |OPENSSH )?PRIVATE KEY-----', 'p_'+'[0-9]{15,}',
].join('|'));
async function walk(path) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(item.name)) continue;
    const file = join(path, item.name);
    if (item.isDirectory()) { await walk(file); continue; }
    if (item.name.startsWith('.env')) throw new Error('Environment file: '+file);
    if (/\.(?:jpg|png|wav)$/.test(file)) continue;
    const text = await readFile(file, 'utf8');
    if (credentialPattern.test(text)) throw new Error('Public content check failed: '+file);
    const urls = text.match(/https:\/\/files\.reela\.com[^\s"<>)]*/g) || [];
    if (urls.some(url => !referenceFiles.has(file) || !originalImages.has(url))) {
      throw new Error('Unauthorized image reference: '+file);
    }
    if (!referenceFiles.has(file) && /files\.reela\.com/.test(text)
      && file !== 'scripts/check-public.mjs') throw new Error('Unexpected production host: '+file);
  }
}
await walk('.');
console.log(`Public content check passed; ${originalImages.size} authorized image URLs`);

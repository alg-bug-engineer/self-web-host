import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SOURCE_URL, DEFAULT_INPUT, verifySourceBytes } from './source.mjs';

export async function download({ localSource, destination = DEFAULT_INPUT, fetcher = fetch } = {}) {
  let bytes;
  if (localSource) {
    bytes = await readFile(localSource);
  } else {
    const response = await fetcher(SOURCE_URL, { signal: AbortSignal.timeout(60_000), redirect: 'error' });
    if (!response.ok) throw new Error(`Source download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  verifySourceBytes(bytes); // Never write a mismatched download, including HTTP-200 HTML errors.
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.download`;
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  return destination;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === '--from')) {
    throw new Error('Usage: node download.mjs [--from /path/to/pinned/source.json]');
  }
  console.log(await download({ localSource: args[1] }));
}

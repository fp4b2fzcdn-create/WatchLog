import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const svg = await readFile('public/watchlog.svg', 'utf8');
await mkdir('build', { recursive: true });
await writeFile(
  'build/icon.png',
  new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng(),
);
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } }).render().asPng();
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
await writeFile('build/icon.ico', Buffer.concat([header, png]));
console.log('Generated original WatchLog PNG and Windows icon from the vector master.');

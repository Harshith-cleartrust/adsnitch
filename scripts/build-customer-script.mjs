import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import esbuild from 'esbuild'

const root = process.cwd()
const sourcePath = path.join(root, 'src/customer/a.js')
const outPath = path.join(root, 'public/a.min.js')
const source = fs.readFileSync(sourcePath)

const result = await esbuild.transform(source, {
  minify: true,
  legalComments: 'none',
  target: 'es2018',
})

const banner = '/* AdSnitch script version: 0.3.1 */\n'
const minified = banner + result.code
fs.writeFileSync(outPath, minified)

const gzip = zlib.gzipSync(minified)
console.log(
  JSON.stringify(
    {
      readable_bytes: source.length,
      minified_bytes: Buffer.byteLength(minified),
      gzip_bytes: gzip.length,
    },
    null,
    2,
  ),
)

if (minified.includes('localhost')) {
  console.error('Production script must not contain localhost')
  process.exit(1)
}

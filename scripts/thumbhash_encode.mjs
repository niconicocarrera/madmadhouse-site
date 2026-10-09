/**
 * ThumbHash encoder, called by build_derivatives.py.
 *
 * Exists as a Node script rather than Python because ThumbHash has no
 * dependable Python package, and the reference JS implementation is already
 * installed in web/node_modules for the client side to decode with. Using the
 * same library on both ends removes a whole class of "the hash encodes but does
 * not decode" bug.
 *
 * Input (argv):  <raw-rgba-file> <width> <height>
 * Output (stdout): the base64 ThumbHash string
 *
 * The raw file is straight RGBA bytes, width*height*4, already downscaled by
 * Pillow to at most 100x100 (ThumbHash's documented input ceiling).
 */
import { readFileSync } from "node:fs";
import { rgbaToThumbHash } from "../web/node_modules/thumbhash/thumbhash.js";

const [file, w, h] = process.argv.slice(2);
if (!file || !w || !h) {
  console.error("usage: thumbhash_encode.mjs <raw-rgba-file> <width> <height>");
  process.exit(2);
}
const width = Number(w);
const height = Number(h);
const rgba = new Uint8Array(readFileSync(file));
const expected = width * height * 4;
if (rgba.length !== expected) {
  console.error(`raw buffer is ${rgba.length} bytes, expected ${expected} for ${width}x${height} RGBA`);
  process.exit(3);
}
const hash = rgbaToThumbHash(width, height, rgba);
process.stdout.write(Buffer.from(hash).toString("base64"));


import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexHtmlPath = path.join(__dirname, 'client/dist/index.html');
const html = fs.readFileSync(indexHtmlPath, 'utf8');

const HASHED_ENTRY_SCRIPT_PATTERN =
    /<script\b[^>]*\bsrc=("|')[^"'>]*assets\/index-(?!latest(?:\.|$))[\w.-]+\.js(?:\?[^"'>]*)?\1[^>]*>\s*<\/script>\s*/gi;

console.log('Testing regex against index.html...');
const match = html.match(HASHED_ENTRY_SCRIPT_PATTERN);
if (match) {
    console.log('Match found:', match);
} else {
    console.log('No match found.');
}

const updated = html.replace(
    HASHED_ENTRY_SCRIPT_PATTERN,
    '<script type="module" crossorigin src="assets/index-latest.js"></script>'
);

if (updated !== html) {
    console.log('Replacement successful.');
} else {
    console.log('Replacement FAILED.');
}

// Build the single-file claude.ai artifact preview (same app, artifact database instead of Firebase, no photos).
const fs = require('fs'), path = require('path'), esbuild = require('esbuild');
const D = __dirname, OUT = '/home/claude/mealplan/es-kitchen.html', DATA = '/home/claude/mealplan/artifact_data';
const js = esbuild.buildSync({ entryPoints: [path.join(D, 'src/artifact_main.js')], bundle: true, minify: true, format: 'iife', write: false, target: ['es2019'] }).outputFiles[0].text;
const html = fs.readFileSync(path.join(D, 'public/index.html'), 'utf8');
const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>') + 8);
const fonts = (html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]+>/) || [''])[0];
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src="firebase-config.js">'));
const page = '<title>E&amp;S Kitchen</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<link rel="preconnect" href="https://fonts.googleapis.com">\n' + fonts + '\n' + style + '\n' + body + '<script>' + js.replace(/<\/script/gi, '<\\/script') + '</script>\n';
fs.writeFileSync(OUT, page);
const lib = JSON.parse(fs.readFileSync(path.join(D, 'public/data/library.json'), 'utf8'));
lib.recipes.forEach(r => delete r.photo); // the artifact sandbox can't load outside images
fs.mkdirSync(DATA + '/data', { recursive: true });
fs.writeFileSync(DATA + '/data/library.json', JSON.stringify(lib));
console.log('artifact', Math.round(page.length / 1024) + 'KB', 'library', Math.round(JSON.stringify(lib).length / 1024) + 'KB');

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const moduleRoots = (process.env.NODE_PATH || path.resolve("node_modules"))
  .split(path.delimiter)
  .filter(Boolean);
const { marked } = loadPackage("marked");
const { chromium } = loadPackage("playwright");

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error("Usage: node tools/md-to-pdf.mjs <input.md> <output.pdf>");
  process.exit(1);
}

const source = await fs.readFile(inputPath, "utf8");
marked.setOptions({
  gfm: true,
  breaks: false,
});

const mermaidBlocks = [];
const protectedSource = source.replace(/```mermaid\s*([\s\S]*?)```/g, (_match, code) => {
  const id = mermaidBlocks.push(code.trim()) - 1;
  return `<pre class="mermaid-block"><code>${escapeHtml(code.trim())}</code></pre>\n`;
});

const body = marked.parse(protectedSource);
const title = path.basename(inputPath, path.extname(inputPath));
const htmlPath = outputPath.replace(/\.pdf$/i, ".html");
const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 17mm 15mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", Arial, sans-serif;
      color: #1f2430;
      font-size: 10.2pt;
      line-height: 1.58;
      word-break: keep-all;
    }
    h1 {
      margin: 0 0 14px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e45a86;
      color: #151922;
      font-size: 22pt;
      line-height: 1.2;
    }
    h2 {
      break-after: avoid;
      margin: 22px 0 8px;
      padding-top: 4px;
      color: #b73564;
      font-size: 15.5pt;
      line-height: 1.25;
    }
    h3 {
      break-after: avoid;
      margin: 16px 0 6px;
      color: #2f3441;
      font-size: 12.5pt;
    }
    p { margin: 5px 0 8px; }
    ul, ol { margin: 6px 0 10px 20px; padding: 0; }
    li { margin: 2px 0; }
    code {
      font-family: Consolas, "Cascadia Mono", monospace;
      background: #fff3f7;
      color: #9a2f57;
      border-radius: 4px;
      padding: 1px 4px;
      font-size: 9pt;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: #fbfcfe;
      border: 1px solid #e6eaf0;
      border-radius: 8px;
      padding: 10px 12px;
      overflow: hidden;
      font-size: 8.5pt;
      line-height: 1.45;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 14px;
      break-inside: auto;
      font-size: 8.8pt;
    }
    tr { break-inside: avoid; break-after: auto; }
    th, td {
      border: 1px solid #e3e7ee;
      padding: 5px 7px;
      vertical-align: top;
    }
    th {
      background: #fff0f5;
      color: #8c254a;
      font-weight: 700;
    }
    blockquote {
      margin: 8px 0;
      padding: 8px 12px;
      border-left: 4px solid #e45a86;
      background: #fff7fa;
    }
    .mermaid-block {
      background: #f7f9fc;
      border: 1px dashed #d4dbe6;
    }
    .mermaid-block::before {
      content: "흐름도";
      display: block;
      margin-bottom: 6px;
      color: #b73564;
      font-weight: 700;
      font-family: "Malgun Gothic", Arial, sans-serif;
    }
    a { color: #b73564; text-decoration: none; }
  </style>
</head>
<body>
${body}
</body>
</html>`;

await fs.writeFile(htmlPath, html, "utf8");

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || undefined,
});
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.resolve(htmlPath)).href, { waitUntil: "load" });
  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `
      <div style="width:100%;font-size:8px;color:#9aa1ad;padding:0 15mm;text-align:right;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>
    `,
  });
} finally {
  await browser.close();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function loadPackage(packageName) {
  for (const root of moduleRoots) {
    try {
      return require(path.join(root, packageName));
    } catch (_error) {
      // Try the next configured module root.
    }
  }
  return require(packageName);
}

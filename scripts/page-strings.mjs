// Spec 0114 F-0114-E: every string a page's source can show, for
// `check-wording.py --source`.
//
//   node scripts/page-strings.mjs <file.ts|file.tsx>...
//
// Prints one JSON object per line: {"file", "line", "text", "where"}.
// Reads the source with the frontend's own TypeScript (frontend/
// node_modules, installed by `npm ci`), so comments are never read and
// JSX text, string literals and template literals (their fixed parts,
// with "${...}" for each hole) are each one string. "where" names what
// holds the string, so the checker can leave out what no player reads:
// "console.log", "new Error", an import, or a JSX attribute such as
// "className", "data-testid" or "href".

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(join(root, "frontend", "package.json"))("typescript");

/** What holds [node]: a call's name, a JSX attribute's name, or "". */
function holder(node) {
  for (let at = node.parent; at; at = at.parent) {
    if (ts.isJsxAttribute(at)) return `attr:${at.name.getText()}`;
    if (ts.isImportDeclaration(at) || ts.isExportDeclaration(at) || ts.isImportTypeNode?.(at)) return "import";
    if (ts.isLiteralTypeNode(at)) return "type";
    if (ts.isNewExpression(at)) return `new ${at.expression.getText()}`;
    if (ts.isCallExpression(at)) return at.expression.getText();
    if (ts.isElementAccessExpression(at) && at.argumentExpression === node) return "index";
    if (ts.isPropertyAssignment(at) && at.name === node) return "key";
    if (ts.isCaseClause(at) && at.expression === node) return "case";
    if (ts.isBinaryExpression(at) && /=/.test(at.operatorToken.getText()) && at.operatorToken.getText().length <= 3
        && at.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return "compare";
    if (ts.isStatement(at) || ts.isJsxElement(at) || ts.isJsxSelfClosingElement(at)) return "";
  }
  return "";
}

function strings(file) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out = [];
  const add = (node, value) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    out.push({ file: relative(root, file).split("\\").join("/"), line, text: value, where: holder(node) });
  };
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      add(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      add(node, node.head.text + node.templateSpans.map((s) => "${...}" + s.literal.text).join(""));
    } else if (ts.isJsxText(node)) {
      const words = node.getText(source).replace(/\s+/g, " ").trim();
      if (words) add(node, words);
    } else if (ts.isRegularExpressionLiteral(node)) {
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

for (const file of process.argv.slice(2)) {
  for (const s of strings(file)) process.stdout.write(JSON.stringify(s) + "\n");
}

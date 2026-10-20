// scripts/lib/chunking.cjs
// FR-SEM-01: Chunking engine — TypeScript Compiler API (exports TS) + header split (markdown).
// CJS-compatível (require('typescript') — typescript@5.9.3 em devDependencies).
// NÃO usa ts-morph (ESM-only quebraria require em .cjs).

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

/**
 * @typedef {Object} Chunk
 * @property {string} path
 * @property {string} exportName
 * @property {string} content
 * @property {number} startLine
 */

function makeChunk(filePath, exportName, content, startLine) {
  return { path: filePath, exportName, content, startLine };
}

function isExported(node) {
  return (
    node.modifiers != null &&
    node.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function isDefaultExport(node) {
  return (
    node.modifiers != null &&
    node.modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
  );
}

function exportNameOf(node) {
  if (node.name != null && node.name.text) {
    return node.name.text;
  }
  if (isDefaultExport(node)) {
    return "default";
  }
  return "(anônimo)";
}

/**
 * Chunkea um arquivo TypeScript por export, via TypeScript Compiler API.
 * Percorre a AST (ts.forEachChild) coletando declarações exportadas
 * (function, class, interface, type alias, enum, variable statement).
 * TETO V1 (P8): helpers internos não exportados NÃO geram chunk individual;
 * barrel files (re-exports) viram um chunk com o conteúdo do re-export.
 *
 * @param {string} filePath - Caminho do arquivo .ts
 * @returns {Chunk[]}
 */
function chunkFile(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const chunks = [];

  /**
   * Extrai o texto do nó incluindo JSDoc/trivia de comentário imediatamente
   * anteriores, preservando startLine do nó real.
   */
  function nodeTextWithDocs(node) {
    const full = sourceText;
    const start = node.pos === 0 ? 0 : node.pos;

    const lineCharStart = sourceFile.getLineAndCharacterOfPosition(node.pos);
    const startLine = lineCharStart.line + 1;
    return { text: full.substring(start, node.end), startLine };
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  function visit(node) {
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
      if (isExported(node)) {
        const { text, startLine } = nodeTextWithDocs(node);
        chunks.push(makeChunk(filePath, exportNameOf(node), text, startLine));
      }
    } else if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) {
      if (isExported(node)) {
        const { text, startLine } = nodeTextWithDocs(node);
        chunks.push(makeChunk(filePath, exportNameOf(node), text, startLine));
      }
    } else if (ts.isVariableStatement(node)) {
      if (isExported(node)) {
        const { text, startLine } = nodeTextWithDocs(node);
        const names = node.declarationList.declarations
          .map((d) => (d.name && d.name.text ? d.name.text : "(anônimo)"))
          .join(", ");
        chunks.push(makeChunk(filePath, names, text, startLine));
      }
    } else if (ts.isExportAssignment(node)) {
      // export default <expression> — conteúdo em chunk único ("default")
      const { text, startLine } = nodeTextWithDocs(node);
      chunks.push(makeChunk(filePath, "default", text, startLine));
    } else if (ts.isExportDeclaration(node)) {
      // Re-exports de módulos (barrel): export * from, export { a } from
      const { text, startLine } = nodeTextWithDocs(node);
      const exported = node.exportClause;
      let names = "*";
      if (exported && exported.elements) {
        names = exported.elements.map((el) => el.name.text).join(", ");
      }
      chunks.push(makeChunk(filePath, names, text, startLine));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return chunks;
}

/**
 * Chunkea um arquivo markdown por header (## e ###).
 * Cada seção vira um chunk com exportName = título da seção.
 *
 * @param {string} filePath - Caminho do arquivo .md
 * @returns {Chunk[]}
 */
function chunkMarkdown(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const lines = sourceText.split(/\r?\n/);
  const chunks = [];

  let currentTitle = null;
  let currentStartLine = null;
  let currentLines = [];

  function flush() {
    if (currentTitle == null) {
      return;
    }
    let content = currentLines.join("\n").trim();
    if (content.length > 0) {
      chunks.push(
        makeChunk(filePath, currentTitle, content, currentStartLine),
      );
    }
  }

  lines.forEach((line, idx) => {
    // `##`/`###` são seções em qualquer .md; `#<digitos>` (ex.: #0..#15 do
    // AI-PROJECT-MANIFEST) também são seções — sem isso o manifest era
    // chunkado em 1 bloco de 551 chars (corpo integral descartado).
    const headerMatch = line.match(/^(#{2,3}|#\d+)\s+(.*)$/);
    if (headerMatch) {
      flush();
      currentTitle = headerMatch[2].trim();
      currentStartLine = idx + 1;
      currentLines = [line];
    } else {
      if (currentTitle != null) {
        currentLines.push(line);
      }
    }
  });

  flush();

  if (chunks.length === 0) {
    const titleMatch = sourceText.match(/^\s*#\s+(.*)$/m);
    const firstLine = titleMatch ? sourceText.split(/\r?\n/).findIndex((l) => l.match(/^\s*#\s+/)) + 1 : 1;
    const trimmed = sourceText.trim();
    if (trimmed.length > 0) {
      chunks.push(
        makeChunk(filePath, titleMatch ? titleMatch[1].trim() : path.basename(filePath), trimmed, firstLine),
      );
    }
  }

  return chunks;
}

module.exports = { chunkFile, chunkMarkdown };
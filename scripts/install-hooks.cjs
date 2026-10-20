#!/usr/bin/env node
// scripts/install-hooks.cjs — instala o hook de pre-push (git hooks não são versionados).
// Uso: node scripts/install-hooks.cjs  (ou: npm run hooks:install)
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const HOOK_DIR = path.join(ROOT, ".git", "hooks");
const HOOK = path.join(HOOK_DIR, "pre-push");
const hookScript = `#!/bin/sh\nnode "${path.join(ROOT, "scripts", "pre-push.cjs")}"\n`;

if (!fs.existsSync(HOOK_DIR)) {
  process.stderr.write("[hooks] .git/hooks não encontrado — rode dentro do repositório.\n");
  process.exit(1);
}

fs.writeFileSync(HOOK, hookScript, { mode: 0o755 });
try { fs.chmodSync(HOOK, 0o755); } catch { /* windows: ignora */ }
process.stdout.write("[hooks] pre-push instalado em .git/hooks/pre-push\n");

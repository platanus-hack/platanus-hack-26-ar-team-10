'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ENV_CANDIDATES = ['.env', '.env.local', '.env.development', '.env.production'];

function findEnvFile(projectRoot) {
  for (const name of ENV_CANDIDATES) {
    const filePath = path.join(projectRoot, name);
    if (fs.existsSync(filePath)) {
      return { exists: true, name, path: filePath };
    }
  }

  return { exists: false, name: '.env', path: path.join(projectRoot, '.env') };
}

function gitignoreCoversEnv(projectRoot) {
  const filePath = path.join(projectRoot, '.gitignore');
  if (!fs.existsSync(filePath)) return false;

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return /^\s*\.env(?:\s|$)/m.test(content)
      || /^\s*\.env\.\*/m.test(content)
      || /^\s*\.env\*/m.test(content);
  } catch (_) {
    return false;
  }
}

function normalizeVarNames(varNames) {
  const names = Array.isArray(varNames) ? varNames : [];
  const cleaned = names
    .map((name) => String(name || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'))
    .filter((name) => /^[A-Z][A-Z0-9_]{1,63}$/.test(name));

  return cleaned.length > 0 ? [...new Set(cleaned)].slice(0, 5) : ['NOMBRE_DE_LA_KEY'];
}

function buildRemediationGuide(projectRoot, varNames) {
  const env = findEnvFile(projectRoot);
  const names = normalizeVarNames(varNames);
  const lines = [];

  if (env.exists) {
    lines.push(`Tu proyecto ya tiene ${env.name}.`);
    lines.push('Camino A: abrilo y pega la credencial ahi, no en el chat:');
    lines.push(`  ! open ${env.name}`);
    lines.push(`  ! code ${env.name}`);
    lines.push('Camino B: agregala desde la shell con un placeholder seguro:');
    for (const name of names) {
      lines.push(`  ! echo '${name}=PEGA_TU_VALOR_AQUI' >> ${env.name}`);
    }
  } else {
    lines.push('Tu proyecto todavia no tiene .env.');
    lines.push('Crealo y agrega la credencial desde la shell, no en el chat:');
    lines.push('  ! touch .env');
    for (const name of names) {
      lines.push(`  ! echo '${name}=PEGA_TU_VALOR_AQUI' >> .env`);
    }
  }

  if (!gitignoreCoversEnv(projectRoot)) {
    lines.push('Blinda .env contra commits accidentales:');
    lines.push("  ! grep -qxF '.env' .gitignore 2>/dev/null || echo '.env' >> .gitignore");
  }

  return lines.join('\n');
}

module.exports = {
  buildRemediationGuide,
  findEnvFile,
  gitignoreCoversEnv,
  normalizeVarNames,
};

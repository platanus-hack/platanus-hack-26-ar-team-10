'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Common .env locations a project might use, in priority order.
const ENV_CANDIDATES = ['.env', '.env.local', '.env.development', '.env.production'];

function findEnvFile(projectRoot) {
  for (const name of ENV_CANDIDATES) {
    const fp = path.join(projectRoot, name);
    if (fs.existsSync(fp)) {
      return { exists: true, name, path: fp };
    }
  }
  return { exists: false, name: '.env', path: path.join(projectRoot, '.env') };
}

function gitignoreCoversEnv(projectRoot) {
  const fp = path.join(projectRoot, '.gitignore');
  if (!fs.existsSync(fp)) return false;
  try {
    const content = fs.readFileSync(fp, 'utf8');
    return /^\s*\.env(\s|$)/m.test(content) || /^\s*\.env\.\*/m.test(content) || /^\s*\.env\*/m.test(content);
  } catch (_) {
    return false;
  }
}

// Given the credential variable names extracted from the prompt, build a
// guided remediation as PLAIN LINES (no nested fences). Each line is later
// wrapped with a "+ " prefix and shoved inside a single ```diff block, so it
// renders fully green without losing color when code samples appear.
// Values are NEVER echoed — only the variable name is used, with a placeholder.
function buildRemediationGuide(projectRoot, varNames) {
  const env = findEnvFile(projectRoot);
  const ignoreOk = gitignoreCoversEnv(projectRoot);
  const names = (varNames && varNames.length > 0) ? varNames : ['NOMBRE_DE_LA_KEY'];

  const lines = [];
  if (env.exists) {
    lines.push(`Tu proyecto YA tiene un .env en:`);
    lines.push(`  ${env.path}`);
    lines.push('');
    lines.push('Camino A — abrilo en tu editor y pegá la credencial allí');
    lines.push('(NO la pegues más en el chat):');
    lines.push(`    ! open ${env.name}      # macOS: editor por defecto`);
    lines.push(`    ! code ${env.name}      # VS Code / Cursor`);
    lines.push('');
    lines.push('Camino B — agregá la línea con un solo comando');
    lines.push('(el valor lo escribís vos directo al shell, no en el chat):');
    for (const n of names) {
      lines.push(`    ! echo '${n}=PEGÁ_TU_VALOR_AQUÍ' >> ${env.name}`);
    }
  } else {
    lines.push('Tu proyecto NO tiene un .env todavía. Creá uno así:');
    lines.push('    ! touch .env');
    for (const n of names) {
      lines.push(`    ! echo '${n}=PEGÁ_TU_VALOR_AQUÍ' >> .env`);
    }
  }

  if (!ignoreOk) {
    lines.push('');
    lines.push('Y blindá .env contra commits accidentales:');
    lines.push("    ! grep -qxF '.env' .gitignore 2>/dev/null || echo '.env' >> .gitignore");
  }

  return lines.join('\n');
}

module.exports = {
  findEnvFile,
  gitignoreCoversEnv,
  buildRemediationGuide,
};

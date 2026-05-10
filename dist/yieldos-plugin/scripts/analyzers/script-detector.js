'use strict';

const RISKY_LIFECYCLE = ['preinstall', 'install', 'postinstall', 'prepare', 'preuninstall', 'postuninstall'];

function detectScripts(packageJson) {
  if (!packageJson || typeof packageJson !== 'object') return { hasRiskyScripts: false, scripts: {} };
  const scripts = packageJson.scripts || {};
  const found = {};
  for (const lc of RISKY_LIFECYCLE) {
    if (scripts[lc]) found[lc] = scripts[lc];
  }
  return {
    hasRiskyScripts: Object.keys(found).length > 0,
    scripts: found,
  };
}

function tierForScripts(scripts) {
  if (!scripts || Object.keys(scripts).length === 0) return 'clean';
  // Any postinstall/preinstall is at minimum tier2 unless allowlisted by build-scripts-allowed.json
  return 'tier2';
}

module.exports = { detectScripts, tierForScripts, RISKY_LIFECYCLE };

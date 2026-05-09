'use strict';

function diffManifests(prev, next) {
  if (!prev) {
    return {
      newScripts: next.scripts || {},
      changedScripts: {},
      newDeps: { ...(next.dependencies || {}), ...(next.devDependencies || {}), ...(next.peerDependencies || {}) },
      changedDeps: {},
      newFiles: next.files || [],
      newBin: next.bin,
      sizeDelta: null,
    };
  }
  const newScripts = {};
  const changedScripts = {};
  const prevScripts = prev.scripts || {};
  const nextScripts = next.scripts || {};
  for (const k of Object.keys(nextScripts)) {
    if (!(k in prevScripts)) newScripts[k] = nextScripts[k];
    else if (prevScripts[k] !== nextScripts[k]) {
      changedScripts[k] = { from: prevScripts[k], to: nextScripts[k] };
    }
  }

  const newDeps = {};
  const changedDeps = {};
  const fields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
  for (const f of fields) {
    const a = prev[f] || {};
    const b = next[f] || {};
    for (const name of Object.keys(b)) {
      if (!(name in a)) newDeps[name] = b[name];
      else if (a[name] !== b[name]) changedDeps[name] = { from: a[name], to: b[name] };
    }
  }

  return { newScripts, changedScripts, newDeps, changedDeps, newFiles: [], newBin: null, sizeDelta: null };
}

function tierForDiff(diff) {
  if (Object.keys(diff.newScripts).length > 0) return 'tier2';
  if (Object.keys(diff.changedScripts).length > 0) return 'tier1';
  return 'clean';
}

module.exports = { diffManifests, tierForDiff };

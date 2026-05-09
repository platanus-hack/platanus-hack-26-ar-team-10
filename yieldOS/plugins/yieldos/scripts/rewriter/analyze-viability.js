'use strict';

function isInCategoryA(candidate, categories) {
  if (!categories || !categories.A_safe_to_rewrite) return false;
  const key = `${ecosystemPrefix(candidate)}:${candidate.name}`;
  return categories.A_safe_to_rewrite.includes(key);
}

function isInCategoryD(candidate, categories) {
  if (!categories || !categories.D_never_rewrite) return false;
  const key = `${ecosystemPrefix(candidate)}:${candidate.name}`;
  if (categories.D_never_rewrite.includes(key)) return true;
  return matchesCategoryDByKeywords(candidate, categories);
}

function matchesCategoryDByKeywords(candidate, categories) {
  const kw = categories.category_keywords_for_unlisted || {};
  const haystack = `${candidate.name} ${candidate.description || ''}`.toLowerCase();
  for (const cat of Object.keys(kw)) {
    if (cat === 'utility' || cat === 'misc') continue;
    if (kw[cat].some((k) => haystack.includes(k))) {
      return true;
    }
  }
  return false;
}

function ecosystemPrefix(candidate) {
  if (candidate.manager === 'npm' || candidate.manager === 'pnpm' || candidate.manager === 'yarn' || candidate.manager === 'bun') return 'npm';
  if (candidate.manager === 'pip' || candidate.manager === 'poetry' || candidate.manager === 'uv') return 'python';
  return candidate.manager || candidate.source || 'unknown';
}

function meetsCategoryAThresholds(metadata, thresholds) {
  if (!metadata) return false;
  const t = thresholds || {};
  const maxKb = t.category_a_max_unpacked_kb ?? 50;
  const maxFiles = t.category_a_max_files ?? 30;
  const maxDeps = t.category_a_max_direct_deps ?? 1;

  // Conservative: require POSITIVE evidence that the package is small enough.
  // Without confirmable size data, we do NOT auto-rewrite; the package goes
  // to large-lib analysis instead. This prevents false positives like
  // matplotlib/numpy/etc. (large libs whose registry metadata uses fields
  // we don't read) being mistakenly rewritten as if they were tiny utilities.
  const sizeKb = (metadata.dist && metadata.dist.unpackedSize) ? metadata.dist.unpackedSize / 1024 : null;
  if (sizeKb === null) return false;
  if (sizeKb > maxKb) return false;

  const fileCount = (metadata.dist && metadata.dist.fileCount) ? metadata.dist.fileCount : null;
  if (fileCount !== null && fileCount > maxFiles) return false;

  const deps = metadata.dependencies ? Object.keys(metadata.dependencies).length : 0;
  if (deps > maxDeps) return false;

  return true;
}

function evaluate(candidate, metadata, policy, thresholds) {
  if (isInCategoryD(candidate, policy.categories)) {
    return { decision: 'block-category-d', reason: 'package classified as category D (never rewrite)' };
  }
  if (isInCategoryA(candidate, policy.categories)) {
    return { decision: 'rewrite-category-a', reason: 'package explicitly in A_safe_to_rewrite' };
  }
  if (meetsCategoryAThresholds(metadata, thresholds)) {
    return { decision: 'rewrite-by-threshold', reason: 'package meets category A size/complexity thresholds' };
  }
  return { decision: 'large-lib-analysis', reason: 'package exceeds A thresholds, requires manifest analysis' };
}

module.exports = { evaluate, isInCategoryA, isInCategoryD, meetsCategoryAThresholds, ecosystemPrefix };

'use strict';

const analyze = require('./analyze-viability');
const inspect = require('./inspect-source');
const projectCtx = require('./read-project-context');
const generate = require('./generate-local');

module.exports = {
  evaluate: analyze.evaluate,
  isInCategoryA: analyze.isInCategoryA,
  isInCategoryD: analyze.isInCategoryD,
  meetsCategoryAThresholds: analyze.meetsCategoryAThresholds,
  describePackage: inspect.describePackage,
  gatherContext: projectCtx.gatherContext,
  writeScaffold: generate.writeScaffold,
  updateRewriteIndex: generate.updateIndex,
  userMessage: generate.userMessage,
};

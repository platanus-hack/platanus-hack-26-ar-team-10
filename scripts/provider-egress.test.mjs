import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDER_EGRESS_OPT_IN_ENV,
  assertProviderEgressAllowed,
  summarizeProviderEgress,
} from './provider-egress.mjs';

test('assertProviderEgressAllowed blocks provider calls by default', () => {
  assert.throws(
    () => assertProviderEgressAllowed({
      env: {},
      provider: 'anthropic',
      purpose: 'model-workflow-benchmark',
    }),
    /provider egress is disabled for anthropic:model-workflow-benchmark/
  );
});

test('assertProviderEgressAllowed allows explicit local opt in', () => {
  assert.doesNotThrow(() => assertProviderEgressAllowed({
    env: { [PROVIDER_EGRESS_OPT_IN_ENV]: '1' },
    provider: 'openai',
    purpose: 'model-workflow-benchmark',
  }));
});

test('summarizeProviderEgress records provider, purpose, and repository-content boundary', () => {
  assert.deepEqual(summarizeProviderEgress({
    provider: 'anthropic',
    purpose: 'model-workflow-benchmark',
    model: 'claude-sonnet-4-6',
    allowed: true,
    repoContentSent: true,
    rawModelOutputIncluded: false,
  }), {
    provider: 'anthropic',
    purpose: 'model-workflow-benchmark',
    model: 'claude-sonnet-4-6',
    opt_in_env: PROVIDER_EGRESS_OPT_IN_ENV,
    allowed: true,
    provider_request_sent: true,
    repo_content_sent: true,
    raw_model_output_included: false,
  });
});

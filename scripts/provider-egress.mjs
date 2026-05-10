export const PROVIDER_EGRESS_OPT_IN_ENV = 'YIELDOS_ALLOW_PROVIDER_EGRESS';

export function assertProviderEgressAllowed({
  env = process.env,
  provider = 'unknown-provider',
  purpose = 'unspecified-purpose',
} = {}) {
  if (env?.[PROVIDER_EGRESS_OPT_IN_ENV] === '1') return;
  throw new Error(
    `provider egress is disabled for ${provider}:${purpose}; ` +
    `set ${PROVIDER_EGRESS_OPT_IN_ENV}=1 only after confirming repository context may leave this machine`
  );
}

export function summarizeProviderEgress({
  provider = 'unknown-provider',
  purpose = 'unspecified-purpose',
  model = null,
  allowed = false,
  repoContentSent = true,
  providerRequestSent = repoContentSent,
  rawModelOutputIncluded = false,
} = {}) {
  return {
    provider,
    purpose,
    model,
    opt_in_env: PROVIDER_EGRESS_OPT_IN_ENV,
    allowed: Boolean(allowed),
    provider_request_sent: Boolean(providerRequestSent),
    repo_content_sent: Boolean(repoContentSent),
    raw_model_output_included: Boolean(rawModelOutputIncluded),
  };
}

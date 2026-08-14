# @minunotes/email-protection

Private, reusable email abuse protection for MinuNotes authentication flows.

The package separates the policy engine from framework, provider, and storage adapters. It supports:

- normalized and HMAC-keyed identities
- durable per-email and per-client rate limits
- windowed violations and temporary client bans
- disposable-domain checks
- cached mailbox verdicts
- AWS SESv2 Email Address Insights
- Better Auth pre-route protection
- off, observe, and enforce rollout modes

Provider failures are distinct from confirmed invalid addresses and do not poison cache or reputation state.

## Entry points

- `@minunotes/email-protection` — complete private API
- `@minunotes/email-protection/better-auth`
- `@minunotes/email-protection/ses`
- `@minunotes/email-protection/sqlite`

Consumers inject their store, verifier, clock, access policy, and trusted client-address resolver. The package stores only caller-provided HMAC identifiers, never raw email or IP values.

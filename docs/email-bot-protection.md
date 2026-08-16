# Email and Bot Protection

MinuNotes protects Better Auth email OTP requests before OTP creation and delivery with the private `@minunotes/email-protection` package.

## Request flow

1. Hono reads the client address from API Gateway request context.
2. The Better Auth adapter validates the email and optional login allowlist.
3. Durable per-email and per-client limits are consumed.
4. Active client reputation bans are checked.
5. Trusted bypass emails skip mailbox validation, not durable limits.
6. Disposable domains and cached verdicts are checked.
7. SESv2 Email Address Insights runs when needed.
8. Confirmed invalid results update cache and client violations; provider failures do not.

Raw email and client addresses are converted to keyed HMAC identifiers before storage. Logs contain only truncated HMAC identifiers and internal reason codes. OTP values are never logged.

## Modes

- `off`: access policy remains active; abuse and mailbox checks are disabled.
- `observe`: checks run and telemetry is emitted, but protection rejects are allowed.
- `enforce`: rejects and rate limits are returned to the client.

SST defaults local to `off`, development to `observe`, and production to `enforce`. Override with `EMAIL_PROTECTION_MODE`.

## Defaults

- Email requests: 3 per 10 minutes
- Client requests: 10 per 10 minutes
- Ban: 5 confirmed invalid attempts in 24 hours; lasts 24 hours
- PASS cache: 24 hours
- FAIL cache: 1 hour
- SES timeout: 2 seconds
- Provider errors: fail open after local access, disposable, cache, and rate checks

## Operations

### Rollout

1. Apply the Drizzle migration.
2. Deploy development in `observe` mode.
3. Monitor `[email-protection]` outcomes and SES provider errors.
4. Verify authorized OTP delivery and rejected disposable addresses.
5. Move development to `enforce`, then deploy production.

Observe mode executes the full protection pipeline and persists rate buckets, verdicts, violations, and bans; it only downgrades abuse decisions at the response boundary. Moving to `enforce` therefore activates state accumulated during observation. Before changing modes, either retain that state when observed traffic is representative or clear the three protection tables for a clean enforcement baseline. Never clear Better Auth user or verification tables as part of this reset.

### Rollback

Set `EMAIL_PROTECTION_MODE=observe` or `off` and redeploy. Keep the protection tables in place; schema removal should happen only in a later migration.

### Inspect state

Protection tables intentionally contain only HMAC keys:

```sql
SELECT COUNT(*) FROM email_protection_rate_limits WHERE expires_at > unixepoch('subsecond') * 1000;
SELECT COUNT(*) FROM email_protection_verdicts WHERE verdict = 'fail';
SELECT COUNT(*) FROM email_protection_client_reputation WHERE banned_until > unixepoch('subsecond') * 1000;
```

Use structured application logs for outcome and reason counts. A daily scheduled cleanup removes expired verdicts and rate buckets, expired bans, and unbanned reputation rows whose violation window has elapsed. Cleanup logs only aggregate deletion counts.

### Unban

Delete the selected HMAC-keyed reputation row. Never add raw email or IP columns for convenience.

### Verification

Run against a local or development API:

```bash
EMAIL_PROTECTION_TEST_BASE_URL=http://localhost:5173 pnpm email-protection:verify
```

The script refuses production unless `ENVIRONMENT=production` and `EMAIL_PROTECTION_ALLOW_PRODUCTION_TEST=true` are both explicitly set.

## AWS

The Lambda execution role grants `ses:GetEmailAddressInsights`, `ses:SendEmail`, and `ses:SendRawEmail`. The AWS SDK default credential chain is used; no application access-key environment variables are required.

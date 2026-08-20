# Collaboration and Integration Security

## Authorization boundary

Human collaboration and integration authorization are evaluated on every request.

- Human grants define the maximum shared role for a resource.
- Integrations additionally require their global capability, owned-folder rule, and shared-access selection.
- `specific` shared access uses only selected grants when calculating role, capability, and folder context.
- Private and agent-read-only folder policies remain independent owner-controlled restrictions.
- Direct-note grants do not expose containing-folder context.

Canvas note links are filtered through the same integration boundary. Hidden targets are removed from reads, and canvas mutations that could overwrite hidden links are denied.

## Revocation semantics

Grant deletion, role downgrade, integration revocation, and scope changes take effect on the next authorization check. They cannot retract:

- content already downloaded by a recipient;
- data already stored in a browser or private HTTP cache;
- a request already accepted and in flight;
- a signed upload URL issued before revocation.

Authenticated attachment responses use private caching and may remain in a browser cache for up to one hour. Public-link revocation and collaboration-grant revocation are independent because they are separate sharing channels.

## Signed attachment uploads

Signed upload URLs expire after five minutes and are restricted to one generated object key and declared content type. Revocation does not invalidate an already issued storage signature, but attachment completion rechecks note edit access and validates the actual object size and raster signature before marking it ready.

Objects uploaded after access is revoked cannot be completed or read through MinuNotes. Monitor pending attachment growth and run orphan cleanup according to the attachment storage runbook.

SVG is not accepted for new uploads. Authenticated and public attachment delivery uses sandbox CSP, `nosniff`, and forced download for legacy SVG objects.

## Tenant-integrity constraints

Derived note, folder, tag, comment, share, link, version, event, and attachment rows use composite tenant foreign keys. Migration `0036` runs a preflight and stops if legacy rows cross tenant boundaries.

Before production migration:

1. Back up the database.
2. Run `pnpm db:verify-tenants` against the target environment.
3. Run the migration against a production snapshot.
4. Investigate any named preflight violation or `tenant_integrity_preflight_zero` failure before retrying.
5. Verify `PRAGMA foreign_key_check` returns no rows after migration.
6. Deploy application code only after the migration succeeds.

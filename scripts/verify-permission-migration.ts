import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    const value = line
      .slice(index + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    process.env[key] ??= value;
  }
}

const environment = process.env.ENVIRONMENT ?? 'local';
loadEnvFile('.env');
loadEnvFile(`.env.${environment}`);
loadEnvFile('.env.local');

const url = process.env.TURSO_DB_URL ?? process.env.LIBSQL_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN;
const client = createClient({ url, authToken });

const commonChecks = {
  malformedFolderParents: `
    SELECT child.id, child.parent_folder_id
    FROM folders child
    LEFT JOIN folders parent ON parent.id = child.parent_folder_id
    WHERE child.parent_folder_id IS NOT NULL
      AND (child.id = child.parent_folder_id OR parent.id IS NULL OR child.user_id <> parent.user_id)
  `,
} as const;

const legacyChecks = {
  duplicateApiKeyGrants: `
    SELECT api_key_id, folder_id, count(*) AS count
    FROM api_key_folder_permissions
    GROUP BY api_key_id, folder_id
    HAVING count(*) > 1
  `,
  duplicateOAuthGrants: `
    SELECT authorization_id, folder_id, count(*) AS count
    FROM oauth_authorization_folder_permissions
    GROUP BY authorization_id, folder_id
    HAVING count(*) > 1
  `,
  crossTenantApiKeyGrants: `
    SELECT permission.id, permission.api_key_id, permission.folder_id
    FROM api_key_folder_permissions permission
    JOIN api_keys credential ON credential.id = permission.api_key_id
    JOIN folders folder ON folder.id = permission.folder_id
    WHERE credential.user_id <> folder.user_id
  `,
  crossTenantOAuthGrants: `
    SELECT permission.id, permission.authorization_id, permission.folder_id
    FROM oauth_authorization_folder_permissions permission
    JOIN oauth_authorizations authorization ON authorization.id = permission.authorization_id
    JOIN folders folder ON folder.id = permission.folder_id
    WHERE authorization.user_id <> folder.user_id
  `,
  apiKeyCapabilityMismatches: `
    SELECT permission.id, permission.api_key_id, permission.folder_id
    FROM api_key_folder_permissions permission
    JOIN api_keys credential ON credential.id = permission.api_key_id
    WHERE permission.can_read <> credential.can_read
       OR permission.can_create <> credential.can_create
       OR permission.can_edit <> credential.can_edit
       OR permission.can_comment <> credential.can_comment
  `,
  oauthCapabilityMismatches: `
    SELECT permission.id, permission.authorization_id, permission.folder_id
    FROM oauth_authorization_folder_permissions permission
    JOIN oauth_authorizations authorization ON authorization.id = permission.authorization_id
    WHERE permission.can_read <> authorization.can_read
       OR permission.can_create <> authorization.can_create
       OR permission.can_edit <> authorization.can_edit
       OR permission.can_comment <> authorization.can_comment
  `,
  invalidApiKeyCapabilities: `
    SELECT id FROM api_keys
    WHERE access_mode NOT IN ('all', 'top_level', 'specific')
       OR can_read NOT IN (0, 1) OR can_create NOT IN (0, 1) OR can_edit NOT IN (0, 1)
       OR can_comment NOT IN (0, 1) OR can_create_folders NOT IN (0, 1)
       OR (can_comment = 1 AND can_read = 0)
  `,
  invalidOAuthCapabilities: `
    SELECT id FROM oauth_authorizations
    WHERE access_mode NOT IN ('all', 'top_level', 'specific')
       OR can_read NOT IN (0, 1) OR can_create NOT IN (0, 1) OR can_edit NOT IN (0, 1)
       OR can_comment NOT IN (0, 1) OR can_create_folders NOT IN (0, 1)
       OR (can_comment = 1 AND can_read = 0)
  `,
} as const;

const unifiedChecks = {
  missingApiKeyAuthorizations: `
    SELECT credential.id
    FROM api_keys credential
    LEFT JOIN integration_authorizations authorization ON authorization.id = credential.authorization_id
    WHERE authorization.id IS NULL OR credential.user_id <> authorization.user_id
  `,
  missingOAuthAuthorizations: `
    SELECT connection.id
    FROM oauth_authorizations connection
    LEFT JOIN integration_authorizations authorization
      ON authorization.id = connection.integration_authorization_id
    WHERE authorization.id IS NULL OR connection.user_id <> authorization.user_id
  `,
  duplicateAuthorizationRules: `
    SELECT authorization_id, folder_id, count(*) AS count
    FROM authorization_folder_rules
    GROUP BY authorization_id, folder_id
    HAVING count(*) > 1
  `,
  crossTenantAuthorizationRules: `
    SELECT rule.id, rule.authorization_id, rule.folder_id
    FROM authorization_folder_rules rule
    JOIN integration_authorizations authorization ON authorization.id = rule.authorization_id
    JOIN folders folder ON folder.id = rule.folder_id
    WHERE rule.user_id <> authorization.user_id OR rule.user_id <> folder.user_id
  `,
  invalidUnifiedCapabilities: `
    SELECT id FROM integration_authorizations
    WHERE access_mode NOT IN ('all', 'top_level', 'specific')
       OR can_read NOT IN (0, 1) OR can_create NOT IN (0, 1) OR can_edit NOT IN (0, 1)
       OR can_comment NOT IN (0, 1) OR can_create_folders NOT IN (0, 1)
       OR (can_comment = 1 AND can_read = 0)
  `,
  folderRulesExceedCeiling: `
    SELECT rule.id, rule.authorization_id, rule.folder_id
    FROM authorization_folder_rules rule
    JOIN integration_authorizations authorization ON authorization.id = rule.authorization_id
    WHERE rule.can_read > authorization.can_read
       OR rule.can_create > authorization.can_create
       OR rule.can_edit > authorization.can_edit
       OR rule.can_comment > authorization.can_comment
       OR rule.can_create_folders > authorization.can_create_folders
  `,
  invalidOAuthAuthorizationScopes: `
    WITH RECURSIVE scope_tokens(id, scope, rest, token) AS (
      SELECT id, scope, trim(scope) || ' ', '' FROM oauth_authorizations
      UNION ALL
      SELECT id, scope, ltrim(substr(rest, instr(rest, ' ') + 1)), substr(rest, 1, instr(rest, ' ') - 1)
      FROM scope_tokens
      WHERE rest <> ''
    )
    SELECT DISTINCT id, scope
    FROM scope_tokens
    WHERE trim(scope) = ''
       OR (token <> '' AND token NOT IN (
         'notes.read', 'notes.create', 'notes.edit', 'comments.write', 'folders.create'
       ))
  `,
} as const;

async function tableExists(name: string) {
  const result = await client.execute({
    sql: "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [name],
  });
  return result.rows.length > 0;
}

try {
  let failed = false;
  const migratablePolicyChecks = new Set([
    'apiKeyCapabilityMismatches',
    'oauthCapabilityMismatches',
    'folderRulesExceedCeiling',
  ]);
  console.log(`Permission migration preflight: ${url}`);

  const checks: Record<string, string> = { ...commonChecks };
  if (await tableExists('api_key_folder_permissions')) Object.assign(checks, legacyChecks);
  if (await tableExists('integration_authorizations')) Object.assign(checks, unifiedChecks);

  for (const [name, sql] of Object.entries(checks)) {
    const result = await client.execute(sql);
    if (result.rows.length === 0) {
      console.log(`✓ ${name}`);
      continue;
    }
    if (migratablePolicyChecks.has(name)) {
      console.log(`• ${name}: ${result.rows.length} policy row(s) to preserve or normalize safely`);
      console.log(JSON.stringify(result.rows.slice(0, 20), null, 2));
      continue;
    }
    failed = true;
    console.error(`✗ ${name}: ${result.rows.length} violation(s)`);
    console.error(JSON.stringify(result.rows.slice(0, 20), null, 2));
  }

  if (failed) {
    console.error('Permission migration preflight failed. Resolve every violation before migration.');
    process.exitCode = 1;
  } else {
    console.log('Permission migration preflight passed.');
  }
} finally {
  client.close();
}

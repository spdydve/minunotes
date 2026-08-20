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

const checks = {
  notesFolderOwner: `SELECT child.id FROM notes child LEFT JOIN folders parent ON parent.id = child.folder_id AND parent.user_id = child.user_id WHERE parent.id IS NULL`,
  templateOwner: `SELECT child.id FROM template_folder_assignments child LEFT JOIN notes parent ON parent.id = child.template_id AND parent.user_id = child.user_id WHERE parent.id IS NULL`,
  templateFolderOwner: `SELECT child.id FROM template_folder_assignments child LEFT JOIN folders parent ON parent.id = child.folder_id AND parent.user_id = child.user_id WHERE parent.id IS NULL`,
  eventNoteOwner: `SELECT child.id FROM note_events child LEFT JOIN notes parent ON parent.id = child.note_id AND parent.user_id = child.user_id WHERE parent.id IS NULL`,
  versionNoteOwner: `SELECT child.id FROM note_versions child LEFT JOIN notes parent ON parent.id = child.note_id AND parent.user_id = child.user_id WHERE parent.id IS NULL`,
  versionFolderOwner: `SELECT child.id FROM note_versions child LEFT JOIN folders parent ON parent.id = child.folder_id AND parent.user_id = child.user_id WHERE parent.id IS NULL`,
  threadNoteOwner: `SELECT child.id FROM note_comment_threads child LEFT JOIN notes parent ON parent.id = child.note_id AND parent.user_id = child.user_id WHERE parent.id IS NULL`,
  messageThreadOwner: `SELECT child.id FROM note_comment_messages child LEFT JOIN note_comment_threads parent ON parent.id = child.thread_id AND parent.note_id = child.note_id AND parent.user_id = child.user_id WHERE parent.id IS NULL`,
  reactionMessageOwner: `SELECT child.id FROM note_comment_message_reactions child LEFT JOIN note_comment_messages parent ON parent.id = child.message_id AND parent.thread_id = child.thread_id AND parent.note_id = child.note_id AND parent.user_id = child.user_id WHERE parent.id IS NULL`,
  noteShareOwner: `SELECT child.id FROM note_share_links child LEFT JOIN notes parent ON parent.id = child.note_id AND parent.user_id = child.user_id WHERE parent.id IS NULL`,
  folderShareOwner: `SELECT child.id FROM folder_share_links child LEFT JOIN folders parent ON parent.id = child.folder_id AND parent.user_id = child.user_id WHERE parent.id IS NULL`,
  noteTagNoteOwner: `SELECT child.id FROM note_tags child LEFT JOIN notes parent ON parent.id = child.note_id AND parent.user_id = child.user_id WHERE parent.id IS NULL`,
  noteTagTagOwner: `SELECT child.id FROM note_tags child LEFT JOIN tags parent ON parent.id = child.tag_id AND parent.user_id = child.user_id WHERE parent.id IS NULL`,
  linkSourceOwner: `SELECT child.id FROM note_links child LEFT JOIN notes parent ON parent.id = child.source_note_id AND parent.user_id = child.user_id WHERE parent.id IS NULL`,
  linkTargetOwner: `SELECT child.id FROM note_links child LEFT JOIN notes parent ON parent.id = child.target_note_id AND parent.user_id = child.user_id WHERE child.target_note_id IS NOT NULL AND parent.id IS NULL`,
  attachmentNoteOwner: `SELECT child.id FROM attachments child LEFT JOIN notes parent ON parent.id = child.note_id AND parent.user_id = child.user_id WHERE parent.id IS NULL`,
  attachmentFolderOwner: `SELECT child.id FROM attachments child LEFT JOIN folders parent ON parent.id = child.folder_id AND parent.user_id = child.user_id WHERE parent.id IS NULL`,
} as const;

const environment = process.env.ENVIRONMENT ?? 'local';
loadEnvFile('.env');
loadEnvFile(`.env.${environment}`);
loadEnvFile('.env.local');

const url = process.env.TURSO_DB_URL ?? process.env.LIBSQL_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN;
const client = createClient({ url, authToken });

try {
  let failed = false;
  console.log(`Tenant-integrity migration preflight: ${url}`);
  for (const [name, sql] of Object.entries(checks)) {
    const result = await client.execute(`${sql} LIMIT 20`);
    if (result.rows.length === 0) {
      console.log(`✓ ${name}`);
      continue;
    }
    failed = true;
    console.error(`✗ ${name}: cross-tenant row(s) found`);
    console.error(JSON.stringify(result.rows, null, 2));
  }
  if (failed) {
    console.error('Tenant-integrity migration preflight failed. Repair every reported row before migration.');
    process.exitCode = 1;
  } else {
    console.log('Tenant-integrity migration preflight passed.');
  }
} finally {
  client.close();
}

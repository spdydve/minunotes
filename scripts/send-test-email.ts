import { existsSync, readFileSync } from 'node:fs';

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
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

const to = process.argv[2] ?? process.env.TEST_EMAIL_TO;
const from = process.env.SES_FROM_EMAIL;

if (!to) {
  console.error('Missing recipient. Usage: pnpm email:test you@example.com');
  process.exit(1);
}

if (!from) {
  console.error('Missing SES_FROM_EMAIL in environment/.env file.');
  process.exit(1);
}

const { sendEmail } = await import('../src/api/lib/email');
const sentAt = new Date().toISOString();

const result = await sendEmail({
  to,
  from,
  subject: 'MinuNotes local email test',
  html: `<p>This is a MinuNotes local email test.</p><p>Sent at <code>${sentAt}</code>.</p>`,
  text: `This is a MinuNotes local email test.\n\nSent at ${sentAt}.`,
});

console.log(`Sent test email to ${to}`);
console.log(`Message ID: ${result.messageId ?? 'unknown'}`);

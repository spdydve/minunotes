import { expect, test } from '@playwright/test';
import { browserFixture, mockBrowserApi } from './fixtures';

test('aligns the cursor with clicks immediately below a Mermaid diagram', async ({ page }) => {
  const api = await mockBrowserApi(page);
  const content =
    '\n```mermaid\nflowchart LR\n    F[Dealer feed arrives] --> R{Pipeline version}\n    R -- Legacy route --> D[Dealer feed processor]\n    R -- version 1 --> A1[Acquisition pipeline V1]\n    R -- version 2 --> A2[Acquisition pipeline V2]\n    A1 --> U{Uploader version}\n    A2 --> U\n    U -- version 1 --> V1[V1 legacy Django delivery]\n    U -- version 2 --> V2[V2 acquisition delivery]\n    B[Prospect status] -. business rules only .-> A1\n    B -. business rules only .-> A2\n```\n\n## Migration path\n\nFirst line.\n\nSecond line.';
  api.notes.set(browserFixture.source.id, { ...browserFixture.source, content });
  await page.goto(`/notes/${browserFixture.source.id}`);

  await expect(page.locator('.me-mermaid-block')).toHaveClass(/me-mermaid-block--ready/, { timeout: 15_000 });
  const target = page.locator('.cm-line').filter({ hasText: 'Migration path' });
  await target.click({ position: { x: 20, y: 17 } });
  await page.keyboard.type('X');

  await api.expectSavedContent(content.replace('## Migration path', '## MXigration path'));
});

import { createRouter } from '@tanstack/react-router';
import { rootRoute } from './routes/__root';
import { authRoute } from './routes/auth';
import { folderRoute } from './routes/folders.$folderId';
import { newFromTemplateRoute } from './routes/folders.$folderId.new-from-template';
import { folderSettingsRoute } from './routes/folders.$folderId.settings';
import { folderTemplateSettingsRoute } from './routes/folders.$folderId.templates';
import { indexRoute } from './routes/index';
import { noteRoute } from './routes/notes.$noteId';
import { noteActivityRoute } from './routes/notes.$noteId.activity';
import { oauthAuthorizeRoute } from './routes/oauth.authorize';
import { resourcesRoute } from './routes/resources';
import { resourceDocRoute } from './routes/resources.$slug';
import { apiAccessSettingsRoute } from './routes/settings.api-access';
import { shareRoute } from './routes/share.$token';
import { templatesRoute } from './routes/templates';

const routeTree = rootRoute.addChildren([
  indexRoute,
  folderRoute,
  newFromTemplateRoute,
  folderTemplateSettingsRoute,
  folderSettingsRoute,
  templatesRoute,
  noteRoute,
  noteActivityRoute,
  authRoute,
  oauthAuthorizeRoute,
  apiAccessSettingsRoute,
  resourcesRoute,
  resourceDocRoute,
  shareRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

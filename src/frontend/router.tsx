import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/__root";
import { indexRoute } from "./routes/index";
import { folderRoute } from "./routes/folders.$folderId";
import { noteRoute } from "./routes/notes.$noteId";
import { noteActivityRoute } from "./routes/notes.$noteId.activity";
import { authRoute } from "./routes/auth";
import { apiAccessSettingsRoute } from "./routes/settings.api-access";
import { templatesRoute } from "./routes/templates";
import { newFromTemplateRoute } from "./routes/folders.$folderId.new-from-template";
import { folderTemplateSettingsRoute } from "./routes/folders.$folderId.templates";
import { folderSettingsRoute } from "./routes/folders.$folderId.settings";
import { resourcesRoute } from "./routes/resources";
import { resourceDocRoute } from "./routes/resources.$slug";
import { oauthAuthorizeRoute } from "./routes/oauth.authorize";
import { shareRoute } from "./routes/share.$token";

const routeTree = rootRoute.addChildren([indexRoute, folderRoute, newFromTemplateRoute, folderTemplateSettingsRoute, folderSettingsRoute, templatesRoute, noteRoute, noteActivityRoute, authRoute, oauthAuthorizeRoute, apiAccessSettingsRoute, resourcesRoute, resourceDocRoute, shareRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}

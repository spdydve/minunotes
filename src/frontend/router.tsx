import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/__root";
import { indexRoute } from "./routes/index";
import { folderRoute } from "./routes/folders.$folderId";
import { noteRoute } from "./routes/notes.$noteId";

const routeTree = rootRoute.addChildren([indexRoute, folderRoute, noteRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}

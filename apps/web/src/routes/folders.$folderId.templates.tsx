import { createRoute, useNavigate } from "@tanstack/react-router";
import { rootRoute } from "./__root";

function FolderTemplateSettingsRedirect() {
  const { folderId } = folderTemplateSettingsRoute.useParams();
  const nav = useNavigate();
  void nav({ to: "/folders/$folderId/settings", params: { folderId }, replace: true });
  return <p className="notes-muted text-sm">Opening folder settings...</p>;
}

export const folderTemplateSettingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/folders/$folderId/templates", component: FolderTemplateSettingsRedirect });

import { createRoute, redirect } from '@tanstack/react-router';
import { rootRoute } from './__root';

export const folderTemplateSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/folders/$folderId/templates',
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/folders/$folderId/settings',
      params: { folderId: params.folderId },
      replace: true,
    });
  },
});

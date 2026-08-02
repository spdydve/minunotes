import { createRootRoute } from '@tanstack/react-router';
import { AppShell } from '../components/app-shell';
import { RouteError, RouteNotFound } from '../components/route-status';

export const rootRoute = createRootRoute({
  component: AppShell,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

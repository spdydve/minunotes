import { createRoute } from "@tanstack/react-router";
import { EmptyState } from "../components/ui/empty-state";
import { rootRoute } from "./__root";

function Index() { return <EmptyState>Create or select a folder to begin.</EmptyState>; }
export const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Index });

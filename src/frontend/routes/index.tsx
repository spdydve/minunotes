import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";

function Index() { return <div className="rounded-lg border border-dashed p-8 text-sm text-slate-500">Create or select a folder to begin.</div>; }
export const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Index });

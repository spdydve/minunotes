import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { QueryProvider } from "./lib/query";
import { router } from "./router";
import "@dpklabs/minueditor/theme.css";
import "@dpklabs/minueditor/themes/dark.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <QueryProvider>
    <RouterProvider router={router} />
  </QueryProvider>,
);

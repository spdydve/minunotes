import type { ComponentType } from "react";
import AgentIntegrations from "./agent-integrations.mdx";
import HarnessApi from "./harness-api.mdx";
import OpenApi from "./openapi.mdx";
import Mcp from "./mcp.mdx";
import SdkCli from "./sdk-cli.mdx";

export type ResourceDoc = {
  slug: string;
  title: string;
  description: string;
  category: string;
  component: ComponentType;
};

export const resourceDocs = [
  {
    slug: "agent-integrations",
    title: "Agent integrations",
    description: "Choose between harness API, hosted MCP, local MCP, OpenAPI, SDK, and CLI paths.",
    category: "Overview",
    component: AgentIntegrations,
  },
  {
    slug: "harness-api",
    title: "Harness API",
    description: "Core agent-safe REST endpoints, scoped permissions, and edit workflow guidance.",
    category: "API",
    component: HarnessApi,
  },
  {
    slug: "openapi",
    title: "OpenAPI",
    description: "Static OpenAPI documents for REST tool importers and action-style platforms.",
    category: "API",
    component: OpenApi,
  },
  {
    slug: "mcp",
    title: "MCP",
    description: "Hosted Streamable HTTP MCP and local stdio MCP usage.",
    category: "Agents",
    component: Mcp,
  },
  {
    slug: "sdk-cli",
    title: "SDK and CLI",
    description: "Developer package and command-line usage for automation workflows.",
    category: "Developer tools",
    component: SdkCli,
  },
] as const satisfies readonly ResourceDoc[];

export function getResourceDoc(slug: string) {
  return resourceDocs.find((doc) => doc.slug === slug);
}

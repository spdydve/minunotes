import type { ComponentType } from "react";
import AgentIntegrations from "./agent-integrations.mdx";
import HarnessApi from "./harness-api.mdx";
import MarkdownEditor from "./markdown-editor.mdx";
import Mcp from "./mcp.mdx";
import OpenApi from "./openapi.mdx";
import Skills from "./skills.mdx";
import SlashCommands from "./slash-commands.mdx";
import TagsDetails from "./tags-details.mdx";
import WikilinksBacklinks from "./wikilinks-backlinks.mdx";

export type ResourceDoc = {
  slug: string;
  title: string;
  description: string;
  category: string;
  component: ComponentType;
};

export const resourceDocs = [
  {
    slug: "markdown-editor",
    title: "Markdown and editor",
    description: "Markdown basics, code, tables, images, and editor behavior.",
    category: "Writing",
    component: MarkdownEditor,
  },
  {
    slug: "slash-commands",
    title: "Slash commands",
    description: "Use slash commands to insert headings, lists, tables, images, wikilinks, and more.",
    category: "Writing",
    component: SlashCommands,
  },
  {
    slug: "wikilinks-backlinks",
    title: "Wikilinks and backlinks",
    description: "Connect notes with wikilinks and navigate references with backlinks and graph endpoints.",
    category: "Organization",
    component: WikilinksBacklinks,
  },
  {
    slug: "tags-details",
    title: "Tags and note details",
    description: "Edit note metadata and organize notes with lightweight reusable tags.",
    category: "Organization",
    component: TagsDetails,
  },
  {
    slug: "skills",
    title: "Skills",
    description: "Use portable agent skills to work with MinuNotes through the harness API.",
    category: "Agents",
    component: Skills,
  },
  {
    slug: "agent-integrations",
    title: "Agent integrations",
    description: "Choose between harness API, hosted MCP, local MCP, and OpenAPI paths.",
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
] as const satisfies readonly ResourceDoc[];

export function getResourceDoc(slug: string) {
  return resourceDocs.find((doc) => doc.slug === slug);
}

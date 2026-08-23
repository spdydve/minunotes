import type { ComponentType } from 'react';
import CommentsAndReview from '../../../../docs/public/minunotes/collaborate/comments-and-review.mdx';
import PermissionsAndPrivacy from '../../../../docs/public/minunotes/collaborate/permissions-and-privacy.mdx';
import SharingAndCollaboration from '../../../../docs/public/minunotes/collaborate/sharing-and-collaboration.mdx';
import GettingStarted from '../../../../docs/public/minunotes/getting-started.mdx';
import AgentIntegrations from '../../../../docs/public/minunotes/integrations/agent-integrations.mdx';
import HarnessApi from '../../../../docs/public/minunotes/integrations/harness-api.mdx';
import Mcp from '../../../../docs/public/minunotes/integrations/mcp.mdx';
import OAuthManualTesting from '../../../../docs/public/minunotes/integrations/oauth-manual-testing.mdx';
import OpenApi from '../../../../docs/public/minunotes/integrations/openapi.mdx';
import Skills from '../../../../docs/public/minunotes/integrations/skills.mdx';
import FoldersAndNotes from '../../../../docs/public/minunotes/organize/folders-and-notes.mdx';
import SearchAndNavigation from '../../../../docs/public/minunotes/organize/search-and-navigation.mdx';
import TagsDetails from '../../../../docs/public/minunotes/organize/tags-details.mdx';
import WikilinksBacklinks from '../../../../docs/public/minunotes/organize/wikilinks-backlinks.mdx';
import TrashAndVersionHistory from '../../../../docs/public/minunotes/recover/trash-and-version-history.mdx';
import CanvasNotes from '../../../../docs/public/minunotes/write/canvas-notes.mdx';
import ImagesAndAttachments from '../../../../docs/public/minunotes/write/images-and-attachments.mdx';
import MarkdownEditor from '../../../../docs/public/minunotes/write/markdown-editor.mdx';
import SlashCommands from '../../../../docs/public/minunotes/write/slash-commands.mdx';

export type ResourceAudience = 'user' | 'developer';
export type ResourceSectionId = 'start' | 'write' | 'organize' | 'collaborate' | 'recover' | 'integrate';

export type ResourceDoc = {
  slug: string;
  title: string;
  description: string;
  section: ResourceSectionId;
  audience: ResourceAudience;
  order: number;
  featured?: boolean;
  advanced?: boolean;
  relatedSlugs?: readonly string[];
  component: ComponentType;
};

export const resourceSections = [
  { id: 'start', title: 'Start here', description: 'Build your first MinuNotes workspace.' },
  { id: 'write', title: 'Write', description: 'Create clear notes with Markdown, media, and canvases.' },
  { id: 'organize', title: 'Organize', description: 'Keep ideas connected and easy to find.' },
  { id: 'collaborate', title: 'Collaborate', description: 'Share knowledge and review work together.' },
  { id: 'recover', title: 'Protect and recover', description: 'Understand privacy, history, and recovery.' },
  { id: 'integrate', title: 'Agent and developer guides', description: 'Connect agents and developer tools safely.' },
] as const satisfies readonly { id: ResourceSectionId; title: string; description: string }[];

export const resourceDocs: readonly ResourceDoc[] = [
  {
    slug: 'getting-started',
    title: 'Getting started',
    description: 'Create your first folder and note, connect your ideas, and learn where to go next.',
    section: 'start',
    audience: 'user',
    order: 10,
    featured: true,
    relatedSlugs: ['folders-and-notes', 'markdown-editor', 'sharing-and-collaboration'],
    component: GettingStarted,
  },
  {
    slug: 'markdown-editor',
    title: 'Markdown and editor',
    description: 'Write with Markdown, rich blocks, code, tables, callouts, and diagrams.',
    section: 'write',
    audience: 'user',
    order: 10,
    relatedSlugs: ['slash-commands', 'images-and-attachments'],
    component: MarkdownEditor,
  },
  {
    slug: 'slash-commands',
    title: 'Slash commands',
    description: 'Insert headings, lists, tables, images, wikilinks, and more without memorizing syntax.',
    section: 'write',
    audience: 'user',
    order: 20,
    relatedSlugs: ['markdown-editor', 'wikilinks-backlinks'],
    component: SlashCommands,
  },
  {
    slug: 'images-and-attachments',
    title: 'Images and attachments',
    description: 'Upload images, use image URLs, and keep visual notes portable.',
    section: 'write',
    audience: 'user',
    order: 30,
    relatedSlugs: ['markdown-editor', 'slash-commands'],
    component: ImagesAndAttachments,
  },
  {
    slug: 'canvas-notes',
    title: 'Canvas notes',
    description: 'Arrange ideas visually with canvas and mind-map notes.',
    section: 'write',
    audience: 'user',
    order: 40,
    relatedSlugs: ['wikilinks-backlinks', 'folders-and-notes'],
    component: CanvasNotes,
  },
  {
    slug: 'folders-and-notes',
    title: 'Folders and notes',
    description: 'Build a simple hierarchy with folders, subfolders, and focused notes.',
    section: 'organize',
    audience: 'user',
    order: 10,
    relatedSlugs: ['getting-started', 'tags-details', 'search-and-navigation'],
    component: FoldersAndNotes,
  },
  {
    slug: 'wikilinks-backlinks',
    title: 'Wikilinks and backlinks',
    description: 'Connect related notes and see which notes reference the current idea.',
    section: 'organize',
    audience: 'user',
    order: 20,
    relatedSlugs: ['tags-details', 'canvas-notes'],
    component: WikilinksBacklinks,
  },
  {
    slug: 'tags-details',
    title: 'Tags and note details',
    description: 'Use lightweight tags and built-in note metadata for cross-cutting organization.',
    section: 'organize',
    audience: 'user',
    order: 30,
    relatedSlugs: ['folders-and-notes', 'wikilinks-backlinks'],
    component: TagsDetails,
  },
  {
    slug: 'search-and-navigation',
    title: 'Search and navigation',
    description: 'Move through your workspace and quickly find the note you need.',
    section: 'organize',
    audience: 'user',
    order: 40,
    relatedSlugs: ['folders-and-notes', 'tags-details'],
    component: SearchAndNavigation,
  },
  {
    slug: 'sharing-and-collaboration',
    title: 'Share notes and folders',
    description: 'Invite collaborators or publish read-only links with the right boundary.',
    section: 'collaborate',
    audience: 'user',
    order: 10,
    relatedSlugs: ['comments-and-review', 'permissions-and-privacy'],
    component: SharingAndCollaboration,
  },
  {
    slug: 'comments-and-review',
    title: 'Comments and Review',
    description: 'Discuss selected text, reply in threads, and resolve completed conversations.',
    section: 'collaborate',
    audience: 'user',
    order: 20,
    relatedSlugs: ['sharing-and-collaboration', 'permissions-and-privacy'],
    component: CommentsAndReview,
  },
  {
    slug: 'permissions-and-privacy',
    title: 'Permissions and private content',
    description: 'Understand viewer, commenter, editor, private-folder, and integration boundaries.',
    section: 'recover',
    audience: 'user',
    order: 10,
    relatedSlugs: ['sharing-and-collaboration', 'agent-integrations'],
    component: PermissionsAndPrivacy,
  },
  {
    slug: 'trash-and-version-history',
    title: 'Trash and version history',
    description: 'Recover deleted content and restore earlier versions of a note.',
    section: 'recover',
    audience: 'user',
    order: 20,
    relatedSlugs: ['folders-and-notes', 'permissions-and-privacy'],
    component: TrashAndVersionHistory,
  },
  {
    slug: 'agent-integrations',
    title: 'Agent integrations',
    description: 'Choose between the Harness API, hosted MCP, local MCP, and OpenAPI.',
    section: 'integrate',
    audience: 'developer',
    order: 10,
    relatedSlugs: ['skills', 'mcp', 'harness-api'],
    component: AgentIntegrations,
  },
  {
    slug: 'skills',
    title: 'Skills',
    description: 'Use portable agent skills to work with MinuNotes through the Harness API.',
    section: 'integrate',
    audience: 'developer',
    order: 20,
    relatedSlugs: ['agent-integrations', 'harness-api'],
    component: Skills,
  },
  {
    slug: 'mcp',
    title: 'MCP',
    description: 'Connect through hosted Streamable HTTP MCP or a local stdio server.',
    section: 'integrate',
    audience: 'developer',
    order: 30,
    relatedSlugs: ['agent-integrations', 'skills'],
    component: Mcp,
  },
  {
    slug: 'harness-api',
    title: 'Harness API',
    description: 'Use agent-safe REST endpoints, scoped permissions, and concurrency-aware edits.',
    section: 'integrate',
    audience: 'developer',
    order: 40,
    relatedSlugs: ['openapi', 'skills'],
    component: HarnessApi,
  },
  {
    slug: 'openapi',
    title: 'OpenAPI',
    description: 'Import static API documents into REST tool and action platforms.',
    section: 'integrate',
    audience: 'developer',
    order: 50,
    relatedSlugs: ['harness-api', 'agent-integrations'],
    component: OpenApi,
  },
  {
    slug: 'oauth-manual-testing',
    title: 'Manual integration testing',
    description: 'Smoke-test API keys, MCP, and OAuth connected-app flows.',
    section: 'integrate',
    audience: 'developer',
    order: 60,
    advanced: true,
    relatedSlugs: ['agent-integrations', 'mcp', 'openapi'],
    component: OAuthManualTesting,
  },
] as const;

export function getResourceDoc(slug: string) {
  return resourceDocs.find((doc) => doc.slug === slug);
}

export function getResourceSection(sectionId: ResourceSectionId) {
  return resourceSections.find((section) => section.id === sectionId);
}

export function getResourceDocsForSection(sectionId: ResourceSectionId) {
  return resourceDocs.filter((doc) => doc.section === sectionId).sort((a, b) => a.order - b.order);
}

export function getAdjacentResourceDocs(slug: string) {
  const currentIndex = resourceDocs.findIndex((doc) => doc.slug === slug);
  if (currentIndex < 0) return { previous: undefined, next: undefined };
  return { previous: resourceDocs[currentIndex - 1], next: resourceDocs[currentIndex + 1] };
}

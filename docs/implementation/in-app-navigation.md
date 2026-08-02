# In-app navigation

## Navigation hierarchy

Authenticated navigation is derived from the current TanStack Router location plus the existing folder and note queries. The URL remains the source of truth; sidebar selection, breadcrumbs, mobile titles, parent links, and document titles do not maintain a separate route stack.

- **Home** shows recent notes across folders.
- **Templates** is the structural parent for template notes.
- **Folders** form the hierarchy for regular Markdown and canvas notes.
- Settings, resources, note activity, and creation routes expose their structural parent through breadcrumbs on desktop and the parent control on mobile.

The MinuNotes brand and Home item both navigate to `/`. Browser Back/Forward navigation remains intact because in-app destinations use TanStack Router links rather than replacing history.

## Folder navigation

The Folders section has an explicit `+` control for creating a top-level folder. Subfolders are created from the parent folder's action menu. A successful top-level creation navigates into the new folder and closes the mobile drawer.

Desktop sidebar collapse and folder expansion preferences are stored in local storage. The current note's folder ancestors are always expanded even when no matching preference exists. Storage failure does not prevent navigation.

Recent Notes includes linked folder context so similarly named notes remain distinguishable.

## Desktop and mobile wayfinding

Desktop routes display horizontally scrollable breadcrumbs. Long segments truncate visually while preserving their full accessible label and hover title. Mobile routes use a compact header with the current route title, menu trigger, and structural parent action.

The mobile sidebar is an off-canvas drawer. It closes after route navigation, explicit dismissal, backdrop activation, or successful top-level folder creation.

## Search and overlays

Search is available from the sidebar icon and globally with `Cmd+K` on Apple platforms or `Ctrl+K` on Windows and Linux. The icon tooltip presents the platform-appropriate shortcut without adding persistent visual text.

Search and Backlinks use the shared Radix dialog primitive for modal semantics, Escape dismissal, focus trapping, and focus restoration. Search supports recent notes for an empty query and Arrow Up, Arrow Down, and Enter for keyboard-only result selection.

## Route resilience

Unknown routes provide a Home escape. Unexpected route rendering failures provide Retry and Home actions. The legacy `/folders/:folderId/templates` path redirects before rendering to folder settings. Authenticated routes, resources, notes, and public shares use descriptive document titles.

## Internal note-link policy

MinuNotes uses two intentional behaviors for links between authenticated notes:

- **Markdown wikilinks open in the current tab.** This keeps wikilinks consistent with folders, breadcrumbs, Search, Backlinks, and browser Back/Forward navigation. TanStack Router performs the transition so note navigation remains subject to the editor's unsaved-change blocker.
- **Canvas node note links open in a new tab.** A canvas is a spatial working context; opening its linked note separately preserves the canvas viewport, selection, and editing session. The new window uses `noopener,noreferrer`.

Public shared-view wikilinks continue to use only server-authorized destinations. They navigate in the current tab and do not infer or create private routes.

The executable policy is defined in `src/frontend/lib/link-policy.ts` and is covered by navigation and canvas browser tests.

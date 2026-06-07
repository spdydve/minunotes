import { createRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
import { Button } from "../components/ui/button";
import { DeleteConfirmDialog } from "../components/delete-confirm-dialog";
import { EmptyState } from "../components/ui/empty-state";
import { FolderApiAccessDialog } from "../components/folder-api-access-dialog";
import { RenameFolderDialog } from "../components/rename-folder-dialog";
import { rootRoute } from "./__root";

function FolderSettingsView() {
  const { folderId } = folderSettingsRoute.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renameOpen, setRenameOpen] = useState(false);
  const [apiAccessOpen, setApiAccessOpen] = useState(false);
  const folders = useQuery({ queryKey: ["folders"], queryFn: api.folders });
  const templates = useQuery({ queryKey: ["templates"], queryFn: api.templates });
  const assigned = useQuery({ queryKey: ["folder-templates", folderId], queryFn: () => api.folderTemplates(folderId) });
  const folder = folders.data?.folders.find((item) => item.id === folderId);

  useEffect(() => {
    if (!assigned.data) return;
    setSelectedIds(new Set(assigned.data.templates.map((template) => template.id)));
  }, [assigned.data]);

  const saveTemplates = useMutation({
    mutationFn: async () => {
      const templatesToUpdate = templates.data?.templates ?? [];
      await Promise.all(templatesToUpdate.map(async (template) => {
        const current = await api.templateFolders(template.id);
        const folderIds = new Set(current.folders.map((item) => item.id));
        if (selectedIds.has(template.id)) folderIds.add(folderId);
        else folderIds.delete(folderId);
        return api.updateTemplateFolders(template.id, [...folderIds]);
      }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folder-templates", folderId] });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteFolder(folderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      nav({ to: "/" });
    },
  });

  if (folders.isLoading || templates.isLoading || assigned.isLoading) return <p className="notes-muted text-sm">Loading folder settings...</p>;
  if (folders.error instanceof ApiError || !folder) return <section className="grid min-h-[60vh] place-items-center"><EmptyState title="Folder not found"><Button className="mt-4" onClick={() => nav({ to: "/" })}>Back to notes</Button></EmptyState></section>;

  return <section className="mx-auto w-full max-w-4xl space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="notes-muted text-sm">Folder settings</p>
        <h2 className="text-xl font-semibold">{folder.title}</h2>
      </div>
      <Button variant="secondary" onClick={() => nav({ to: "/folders/$folderId", params: { folderId } })}>Back to folder</Button>
    </div>

    <div className="rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] p-4">
      <h3 className="font-semibold">General</h3>
      <p className="notes-muted mt-1 text-sm">Manage this folder and its integrations.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setRenameOpen(true)}>Rename</Button>
        <Button variant="secondary" disabled title="Folder moving is coming with folder tree support.">Move</Button>
        <Button variant="secondary" onClick={() => setApiAccessOpen(true)}>API Access</Button>
      </div>
    </div>

    <div className="rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel)] p-4">
      <h3 className="font-semibold">Templates</h3>
      <p className="notes-muted mt-1 text-sm">Choose which global templates are available when creating notes in this folder.</p>
      {templates.data?.templates.length ? <div className="mt-4 space-y-2 rounded-lg border border-[var(--notes-border)] bg-[var(--notes-panel-muted)] p-2">{templates.data.templates.map((template) => <label key={template.id} className="flex cursor-pointer items-start gap-3 rounded-md p-3 hover:bg-[var(--notes-hover)]"><input className="mt-1" type="checkbox" checked={selectedIds.has(template.id)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); if (event.target.checked) next.add(template.id); else next.delete(template.id); return next; })} /><span><span className="block font-medium">{template.title}</span><span className="notes-muted mt-1 line-clamp-2 block text-xs">{template.content.trim() || "Empty template"}</span></span></label>)}</div> : <EmptyState title="No templates yet"><p>Create templates before assigning them to folders.</p><Button className="mt-4" onClick={() => nav({ to: "/templates" })}>Create templates</Button></EmptyState>}
      <div className="mt-4 flex gap-2"><Button onClick={() => saveTemplates.mutate()} disabled={saveTemplates.isPending || !templates.data?.templates.length}>Save template settings</Button>{saveTemplates.isSuccess ? <span className="self-center text-sm text-[var(--notes-muted)]">Saved</span> : null}</div>
    </div>

    <div className="rounded-lg border border-[var(--notes-button-destructive-border)] bg-[var(--notes-button-destructive-bg)] p-4">
      <h3 className="font-semibold text-[var(--notes-button-destructive-text)]">Danger zone</h3>
      <p className="mt-1 text-sm text-[var(--notes-button-destructive-text)]">Deleting this folder permanently removes all notes in it.</p>
      <div className="mt-4"><DeleteConfirmDialog label="folder" warning="All notes in this folder will be permanently lost." onConfirm={() => remove.mutate()} /></div>
    </div>

    <RenameFolderDialog folder={folder} open={renameOpen} onOpenChange={setRenameOpen} />
    <FolderApiAccessDialog folder={folder} open={apiAccessOpen} onOpenChange={setApiAccessOpen} />
  </section>;
}

export const folderSettingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/folders/$folderId/settings", component: FolderSettingsView });

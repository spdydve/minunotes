import type { SharedAccessMode, SharedCollaboration } from '../lib/api';

const ROLE_LABEL = { viewer: 'Viewer', commenter: 'Commenter', editor: 'Editor', owner: 'Owner' } as const;

function resourceTitle(item: SharedCollaboration) {
  return item.type === 'note' ? item.note.title : item.folder.title;
}

export function SharedIntegrationAccess({
  collaborations,
  mode,
  selectedGrantIds,
  onModeChange,
  onSelectionChange,
}: {
  collaborations: SharedCollaboration[];
  mode: SharedAccessMode;
  selectedGrantIds: Set<string>;
  onModeChange: (mode: SharedAccessMode) => void;
  onSelectionChange: (grantIds: Set<string>) => void;
}) {
  return (
    <div className="rounded-md border border-[var(--notes-border)] p-3">
      <h3 className="font-medium text-sm">Content shared with you</h3>
      <p className="notes-muted mt-1 text-xs">
        Shared access is separate from your own folder scope and can never exceed your human collaboration role.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {(['none', 'specific', 'all'] as const).map((value) => (
          <label
            key={value}
            className="flex items-start gap-2 rounded-md border border-[var(--notes-border)] p-3 text-sm"
          >
            <input
              className="mt-1"
              type="radio"
              checked={mode === value}
              onChange={() => {
                onModeChange(value);
                if (value !== 'specific') onSelectionChange(new Set());
              }}
            />
            <span>
              <span className="block font-medium">
                {value === 'none'
                  ? 'No shared content'
                  : value === 'specific'
                    ? 'Selected shares'
                    : 'All shared content'}
              </span>
              <span className="notes-muted text-xs">
                {value === 'none'
                  ? 'Default and safest.'
                  : value === 'specific'
                    ? 'Only selected grants.'
                    : 'Current and future grants.'}
              </span>
            </span>
          </label>
        ))}
      </div>

      {mode === 'all' ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 text-sm dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          This integration will automatically receive access to content shared with you in the future. Owners can still
          revoke or downgrade your human access at any time.
        </div>
      ) : null}

      {mode === 'specific' ? (
        <div className="notes-modal-scroll mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
          {collaborations.map((item) => (
            <label
              key={item.grantId}
              className="flex items-start gap-3 rounded-md border border-[var(--notes-border)] px-3 py-2 text-sm"
            >
              <input
                className="mt-1"
                type="checkbox"
                checked={selectedGrantIds.has(item.grantId)}
                disabled={!selectedGrantIds.has(item.grantId) && selectedGrantIds.size >= 100}
                onChange={(event) => {
                  const next = new Set(selectedGrantIds);
                  if (event.target.checked) next.add(item.grantId);
                  else next.delete(item.grantId);
                  onSelectionChange(next);
                }}
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">{resourceTitle(item)}</span>
                <span className="notes-muted block truncate text-xs">
                  {item.type === 'folder' ? 'Folder' : 'Note'} · Shared by {item.owner.label} · {ROLE_LABEL[item.role]}
                </span>
              </span>
            </label>
          ))}
          {selectedGrantIds.size >= 100 ? (
            <p className="text-amber-700 text-xs dark:text-amber-300">A credential can select up to 100 shares.</p>
          ) : null}
          {collaborations.length === 0 ? (
            <p className="rounded-md border border-[var(--notes-border)] border-dashed p-3 text-[var(--notes-muted)] text-sm">
              Nothing is currently shared with you.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

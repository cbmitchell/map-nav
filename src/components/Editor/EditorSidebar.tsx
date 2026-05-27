import { useState, useRef } from 'react';
import type { Dispatch } from 'react';
import type { Building } from '../../types/graph';
import type { Action } from '../../hooks/useGraphReducer';
import { renderPdfPage, getPageCount } from '../../utils/pdf';

interface EditorSidebarProps {
  building: Building;
  activeSectionId: string | null;
  onSectionChange: (id: string) => void;
  dispatch: Dispatch<Action>;
}

// ---------------------------------------------------------------------------
// Shared section form
// ---------------------------------------------------------------------------

interface SectionFormProps {
  name: string;
  floor: string;
  file: File | null;
  onNameChange: (v: string) => void;
  onFloorChange: (v: string) => void;
  onFileChange: (f: File | null) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  submitting: boolean;
  submitDisabled: boolean;
  filePlaceholder: string;
  fileAccept: string;
  autoFocus?: boolean;
}

function SectionForm({
  name, floor, file,
  onNameChange, onFloorChange, onFileChange,
  onSubmit, onCancel,
  submitLabel, submitting, submitDisabled,
  filePlaceholder, fileAccept,
  autoFocus = false,
}: SectionFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSubmit();
    if (e.key === 'Escape') onCancel();
    e.stopPropagation();
  };

  return (
    <>
      <input
        style={styles.formInput}
        autoFocus={autoFocus}
        placeholder="Section name"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        onKeyDown={handleKey}
      />
      <div style={styles.formRow}>
        <label style={styles.formLabel}>Floor</label>
        <input
          style={{ ...styles.formInput, width: 52 }}
          type="number"
          min={1}
          value={floor}
          onChange={(e) => onFloorChange(e.target.value)}
          onKeyDown={handleKey}
        />
      </div>
      <button style={styles.fileBtn} onClick={() => fileInputRef.current?.click()}>
        {file ? file.name : filePlaceholder}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={fileAccept}
        style={{ display: 'none' }}
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />
      <div style={styles.formActions}>
        <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button
          style={{ ...styles.addBtn, ...(submitDisabled ? styles.btnDisabled : {}) }}
          disabled={submitDisabled}
          onClick={onSubmit}
        >
          {submitting ? `${submitLabel}…` : submitLabel}
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

interface FormState {
  name: string;
  floor: string;
  file: File | null;
}

export function EditorSidebar({ building, activeSectionId, onSectionChange, dispatch }: EditorSidebarProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>({ name: '', floor: '', file: null });
  const [importing, setImporting] = useState(false);

  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>({ name: '', floor: '', file: null });
  const [editImporting, setEditImporting] = useState(false);

  const nextFloor =
    building.sections.length > 0
      ? Math.max(...building.sections.map((s) => s.floor)) + 1
      : 1;

  const openForm = () => {
    setForm({ name: `Floor ${nextFloor}`, floor: String(nextFloor), file: null });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.file || importing) return;
    setImporting(true);
    try {
      const name = form.name.trim() || `Floor ${form.floor}`;
      const floor = parseInt(form.floor, 10) || 1;
      const file = form.file;

      if (file.type === 'application/pdf') {
        const count = await getPageCount(file);
        const importAll =
          count > 1 &&
          window.confirm(
            `This PDF has ${count} pages. Import all ${count} pages as separate sections?\n\nOK = import all, Cancel = import page 1 only.`,
          );
        const pages = importAll ? Array.from({ length: count }, (_, i) => i + 1) : [1];
        let firstId: string | null = null;
        for (let i = 0; i < pages.length; i++) {
          const { imageData, imageW, imageH } = await renderPdfPage(file, pages[i]);
          const id = crypto.randomUUID();
          const sectionName = pages.length > 1 ? (i === 0 ? name : `${name} – Page ${pages[i]}`) : name;
          dispatch({
            type: 'ADD_SECTION',
            payload: { id, name: sectionName, floor: floor + i, imageData, imageW, imageH },
          });
          if (firstId === null) firstId = id;
        }
        if (firstId) onSectionChange(firstId);
      } else {
        await new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const imageData = ev.target?.result as string;
            const img = new Image();
            img.onload = () => {
              const id = crypto.randomUUID();
              dispatch({
                type: 'ADD_SECTION',
                payload: { id, name, floor, imageData, imageW: img.naturalWidth, imageH: img.naturalHeight },
              });
              onSectionChange(id);
              resolve();
            };
            img.onerror = () => reject(new Error('Image failed to load — file may be corrupt or unsupported.'));
            img.src = imageData;
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });
      }
    } finally {
      setImporting(false);
      setShowForm(false);
    }
  };

  const startEdit = (id: string, currentName: string, currentFloor: number) => {
    setEditingSectionId(id);
    setEditForm({ name: currentName, floor: String(currentFloor), file: null });
  };

  const commitEdit = async () => {
    if (!editingSectionId) return;
    const name = editForm.name.trim();
    const floor = parseInt(editForm.floor, 10);
    if (name) {
      dispatch({ type: 'UPDATE_SECTION', payload: { id: editingSectionId, name, floor: isNaN(floor) ? undefined : floor } });
    }
    if (editForm.file) {
      setEditImporting(true);
      try {
        await new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const imageData = ev.target?.result as string;
            const img = new Image();
            img.onload = () => {
              dispatch({ type: 'UPDATE_SECTION_IMAGE', payload: { id: editingSectionId!, imageData, imageW: img.naturalWidth, imageH: img.naturalHeight } });
              resolve();
            };
            img.onerror = () => reject(new Error('Image failed to load — file may be corrupt or unsupported.'));
            img.src = imageData;
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(editForm.file!);
        });
      } finally {
        setEditImporting(false);
      }
    }
    setEditingSectionId(null);
  };

  const crossEdges = building.edges.filter((e) => e.crossSection);
  const nodeIndex = new Map(building.nodes.map((n) => [n.id, n]));
  const sectionIndex = new Map(building.sections.map((s) => [s.id, s]));

  return (
    <div style={styles.sidebar}>
      <div style={styles.sectionHeader}>Sections</div>

      <div style={styles.sectionList}>
        {building.sections.map((s) => (
          <div key={s.id}>
            <div
              style={{
                ...styles.sectionItem,
                ...(s.id === activeSectionId ? styles.sectionItemActive : {}),
              }}
              onClick={() => { if (editingSectionId !== s.id) onSectionChange(s.id); }}
            >
              <span style={styles.sectionName}>{s.name}</span>
              <span style={styles.sectionFloor}>F{s.floor}</span>
              {editingSectionId !== s.id && (
                <button
                  style={styles.renameBtn}
                  title="Edit section"
                  onClick={(e) => { e.stopPropagation(); startEdit(s.id, s.name, s.floor); }}
                >
                  ✎
                </button>
              )}
            </div>
            {editingSectionId === s.id && (
              <div style={styles.editForm}>
                <SectionForm
                  name={editForm.name}
                  floor={editForm.floor}
                  file={editForm.file}
                  onNameChange={(v) => setEditForm((p) => ({ ...p, name: v }))}
                  onFloorChange={(v) => setEditForm((p) => ({ ...p, floor: v }))}
                  onFileChange={(f) => setEditForm((p) => ({ ...p, file: f }))}
                  onSubmit={commitEdit}
                  onCancel={() => setEditingSectionId(null)}
                  submitLabel="Save"
                  submitting={editImporting}
                  submitDisabled={editImporting}
                  filePlaceholder="Replace image…"
                  fileAccept="image/*"
                  autoFocus
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {showForm ? (
        <div style={styles.form}>
          <SectionForm
            name={form.name}
            floor={form.floor}
            file={form.file}
            onNameChange={(v) => setForm((p) => ({ ...p, name: v }))}
            onFloorChange={(v) => setForm((p) => ({ ...p, floor: v }))}
            onFileChange={(f) => setForm((p) => ({ ...p, file: f }))}
            onSubmit={handleSubmit}
            onCancel={() => setShowForm(false)}
            submitLabel="Add"
            submitting={importing}
            submitDisabled={!form.file || importing}
            filePlaceholder="Choose image or PDF…"
            fileAccept="image/*,application/pdf"
            autoFocus
          />
        </div>
      ) : (
        <button style={styles.newSectionBtn} onClick={openForm}>
          + New Section
        </button>
      )}

      {crossEdges.length > 0 && (
        <>
          <div style={styles.divider} />
          <div style={styles.sectionHeader}>Cross-section links</div>
          <div style={styles.crossList}>
            {crossEdges.map((edge) => {
              const src = nodeIndex.get(edge.srcId);
              const tgt = nodeIndex.get(edge.tgtId);
              const srcSec = src ? sectionIndex.get(src.sectionId) : undefined;
              const tgtSec = tgt ? sectionIndex.get(tgt.sectionId) : undefined;
              return (
                <div key={edge.id} style={styles.crossItem}>
                  <span style={styles.crossLabel}>
                    <span style={styles.crossSec}>{srcSec?.name ?? '?'}</span>
                    {': '}
                    {src?.label || '(node)'}
                    {' → '}
                    <span style={styles.crossSec}>{tgtSec?.name ?? '?'}</span>
                    {': '}
                    {tgt?.label || '(node)'}
                    {'  '}
                    <span style={styles.crossType}>{edge.type}</span>
                  </span>
                  <button
                    style={styles.deleteBtn}
                    title="Delete link"
                    onClick={() => dispatch({ type: 'DELETE_EDGE', payload: { id: edge.id } })}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 220,
    flexShrink: 0,
    background: '#0e0e0e',
    borderRight: '1px solid #2a2a2a',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: '#555',
    padding: '10px 12px 4px',
    flexShrink: 0,
  },
  sectionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    flexShrink: 0,
  },
  sectionItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '7px 12px',
    background: 'transparent',
    cursor: 'pointer',
    color: '#888',
    fontSize: 13,
    gap: 4,
    userSelect: 'none' as const,
  },
  sectionItemActive: {
    background: '#1e1e1e',
    color: '#eee',
    borderLeft: '2px solid #378ADD',
    paddingLeft: 10,
  },
  sectionName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  sectionFloor: {
    fontSize: 10,
    color: '#555',
    flexShrink: 0,
    marginLeft: 'auto',
    paddingLeft: 4,
  },
  renameBtn: {
    flexShrink: 0,
    padding: '0 3px',
    background: 'transparent',
    border: 'none',
    color: '#444',
    cursor: 'pointer',
    fontSize: 13,
    lineHeight: 1,
  },
  newSectionBtn: {
    margin: '6px 10px',
    padding: '5px 10px',
    background: 'transparent',
    border: '1px dashed #333',
    borderRadius: 4,
    color: '#555',
    cursor: 'pointer',
    fontSize: 12,
    textAlign: 'left' as const,
  },
  form: {
    margin: '6px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  editForm: {
    margin: '0 10px 6px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '8px',
    background: '#141414',
    borderRadius: 4,
  },
  formRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  formLabel: {
    fontSize: 11,
    color: '#666',
    flexShrink: 0,
  },
  formInput: {
    flex: 1,
    background: '#111',
    border: '1px solid #333',
    borderRadius: 3,
    color: '#ddd',
    padding: '4px 6px',
    fontSize: 12,
    outline: 'none',
    minWidth: 0,
  },
  fileBtn: {
    padding: '4px 8px',
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: 3,
    color: '#888',
    cursor: 'pointer',
    fontSize: 11,
    textAlign: 'left' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 6,
  },
  cancelBtn: {
    padding: '3px 10px',
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: 3,
    color: '#666',
    cursor: 'pointer',
    fontSize: 12,
  },
  addBtn: {
    padding: '3px 10px',
    background: 'transparent',
    border: '1px solid #378ADD',
    borderRadius: 3,
    color: '#378ADD',
    cursor: 'pointer',
    fontSize: 12,
  },
  btnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  divider: {
    height: 1,
    background: '#1e1e1e',
    margin: '8px 0',
    flexShrink: 0,
  },
  crossList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '0 8px',
    overflow: 'auto',
    flex: 1,
  },
  crossItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 4,
    padding: '4px 6px',
    background: '#141414',
    borderRadius: 3,
    fontSize: 11,
  },
  crossLabel: {
    flex: 1,
    color: '#888',
    lineHeight: 1.4,
    wordBreak: 'break-word' as const,
  },
  crossSec: {
    color: '#bbb',
  },
  crossType: {
    color: '#555',
    fontStyle: 'italic',
  },
  deleteBtn: {
    flexShrink: 0,
    padding: '0 4px',
    background: 'transparent',
    border: 'none',
    color: '#555',
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
  },
};

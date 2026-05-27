import { useState, useRef } from 'react';
import clsx from 'clsx';
import type { Dispatch } from 'react';
import type { Building } from '../../types/graph';
import type { Action } from '../../hooks/useGraphReducer';
import { loadPdf, renderPdfPage } from '../../utils/pdf';
import { generateId } from '../../utils/id';
import styles from './EditorSidebar.module.css';

interface EditorSidebarProps {
  building: Building;
  activeSectionId: string | null;
  onSectionChange: (id: string) => void;
  dispatch: Dispatch<Action>;
  isMobileOrTablet: boolean;
  isOpen: boolean;
  onClose: () => void;
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
        className={styles.formInput}
        autoFocus={autoFocus}
        placeholder="Section name"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        onKeyDown={handleKey}
      />
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Floor</label>
        <input
          className={clsx(styles.formInput, styles.formInputNarrow)}
          type="number"
          min={1}
          value={floor}
          onChange={(e) => onFloorChange(e.target.value)}
          onKeyDown={handleKey}
        />
      </div>
      <button className={styles.fileBtn} onClick={() => fileInputRef.current?.click()}>
        {file ? file.name : filePlaceholder}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={fileAccept}
        style={{ display: 'none' }}
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />
      <div className={styles.formActions}>
        <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button
          className={clsx(styles.addBtn, submitDisabled && styles.btnDisabled)}
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

export function EditorSidebar({ building, activeSectionId, onSectionChange, dispatch, isMobileOrTablet, isOpen, onClose }: EditorSidebarProps) {
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

      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        // Load document once — PDF.js transfers the ArrayBuffer to its worker,
        // detaching it, so calling getDocument twice on the same buffer would fail.
        const doc = await loadPdf(file);
        const count = doc.numPages;
        const importAll =
          count > 1 &&
          window.confirm(
            `This PDF has ${count} pages. Import all ${count} pages as separate sections?\n\nOK = import all, Cancel = import page 1 only.`,
          );
        const pages = importAll ? Array.from({ length: count }, (_, i) => i + 1) : [1];
        let firstId: string | null = null;
        for (let i = 0; i < pages.length; i++) {
          const { imageData, imageW, imageH } = await renderPdfPage(doc, pages[i]);
          const id = generateId();
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
              const id = generateId();
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
    } catch (err) {
      window.alert(`Failed to add section: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
    <>
      <div
        className={clsx(styles.backdrop, isMobileOrTablet && isOpen && styles.backdropVisible)}
        onClick={onClose}
      />
      <div className={clsx(styles.sidebar, isMobileOrTablet && styles.sidebarDrawer, isMobileOrTablet && isOpen && styles.sidebarOpen)}>
        <div className={clsx(styles.closeRow, isMobileOrTablet && styles.closeRowVisible)}>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
      <div className={styles.sectionHeader}>Sections</div>

      <div className={styles.sectionList}>
        {building.sections.map((s) => (
          <div key={s.id}>
            <div
              className={clsx(styles.sectionItem, s.id === activeSectionId && styles.sectionItemActive)}
              onClick={() => { if (editingSectionId !== s.id) { onSectionChange(s.id); if (isMobileOrTablet) onClose(); } }}
            >
              <span className={styles.sectionName}>{s.name}</span>
              <span className={styles.sectionFloor}>F{s.floor}</span>
              {editingSectionId !== s.id && (
                <button
                  className={styles.renameBtn}
                  title="Edit section"
                  onClick={(e) => { e.stopPropagation(); startEdit(s.id, s.name, s.floor); }}
                >
                  ✎
                </button>
              )}
            </div>
            {editingSectionId === s.id && (
              <div className={styles.editForm}>
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
        <div className={styles.form}>
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
        <button className={styles.newSectionBtn} onClick={openForm}>
          + New Section
        </button>
      )}

      {crossEdges.length > 0 && (
        <>
          <div className={styles.divider} />
          <div className={styles.sectionHeader}>Cross-section links</div>
          <div className={styles.crossList}>
            {crossEdges.map((edge) => {
              const src = nodeIndex.get(edge.srcId);
              const tgt = nodeIndex.get(edge.tgtId);
              const srcSec = src ? sectionIndex.get(src.sectionId) : undefined;
              const tgtSec = tgt ? sectionIndex.get(tgt.sectionId) : undefined;
              return (
                <div key={edge.id} className={styles.crossItem}>
                  <span className={styles.crossLabel}>
                    <span className={styles.crossSec}>{srcSec?.name ?? '?'}</span>
                    {': '}
                    {src?.label || '(node)'}
                    {' → '}
                    <span className={styles.crossSec}>{tgtSec?.name ?? '?'}</span>
                    {': '}
                    {tgt?.label || '(node)'}
                    {'  '}
                    <span className={styles.crossType}>{edge.type}</span>
                  </span>
                  <button
                    className={styles.deleteBtn}
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
    </>
  );
}


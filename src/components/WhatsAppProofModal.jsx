import React, { useEffect, useRef, useState } from 'react';
import { X, ImagePlus, Trash2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { compressScreenshot, saveWhatsAppProof, MAX_PROOF_IMAGES } from '../lib/whatsapp-proofs';

// Nothing is logged as a WhatsApp contact until at least one conversation screenshot is saved.
// The modal opens together with the chat, so the employee can send, screenshot, and attach
// without leaving the dialler.
export default function WhatsAppProofModal({ open, lead, currentUser, onClose, onSaved }) {
  const [images, setImages] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setImages([]);
    setNote('');
    setError('');
    setBusy(false);
  }, [open, lead?.id]);

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((file) => String(file.type || '').startsWith('image/'));
    if (files.length === 0) return;

    const room = MAX_PROOF_IMAGES - images.length;
    if (room <= 0) {
      setError(`Attach at most ${MAX_PROOF_IMAGES} screenshots.`);
      return;
    }

    setError('');
    setBusy(true);
    try {
      const next = [];
      for (const file of files.slice(0, room)) {
        next.push(await compressScreenshot(file));
      }
      setImages((previous) => [...previous, ...next]);
      if (files.length > room) {
        setError(`Only the first ${room} image${room === 1 ? '' : 's'} were added — ${MAX_PROOF_IMAGES} is the limit.`);
      }
    } catch (err) {
      setError(err.message || 'That image could not be prepared.');
    } finally {
      setBusy(false);
    }
  };

  // A screenshot is already on the clipboard after most screen-capture tools, so pasting is the
  // fastest path from "I sent it" to "it is on file".
  useEffect(() => {
    if (!open) return;
    const onPaste = (event) => {
      const pasted = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter(Boolean);
      if (pasted.length > 0) {
        event.preventDefault();
        addFiles(pasted);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, images.length]);

  if (!open) return null;

  const removeAt = (index) => setImages((previous) => previous.filter((unused, position) => position !== index));

  const submit = async (event) => {
    event.preventDefault();
    if (images.length === 0) {
      setError('Attach at least one screenshot of the WhatsApp conversation.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const proof = await saveWhatsAppProof({
        leadId: lead?.id ?? null,
        leadName: lead?.name || '',
        company: lead?.company || '',
        phone: lead?.displayPhone || lead?.phone || '',
        note,
        images
      });
      onSaved?.(proof);
    } catch (err) {
      setError(err.message || 'The screenshots could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xl p-4">
      <div className="w-full max-w-xl glass-strong overflow-hidden">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-[var(--glass-border)] bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> WhatsApp proof — {lead?.name || 'customer'}
            </h3>
            <p className="text-xs text-emerald-50 mt-0.5">
              {lead?.company || 'No company on file'} · {lead?.displayPhone || lead?.phone || 'No number'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
            title="Close without logging"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <p className="text-[11px] text-muted leading-relaxed">
            Attach screenshots of the conversation you just had on WhatsApp with{' '}
            <strong className="text-[var(--text-primary)]">{lead?.name || 'this customer'}</strong>. The admin and
            analyst review them. The contact is only logged once at least one image is attached.
          </p>

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              addFiles(event.dataTransfer?.files);
            }}
            className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
              dragActive ? 'border-emerald-400/70 bg-emerald-500/10' : 'border-[var(--glass-border)]'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy || images.length >= MAX_PROOF_IMAGES}
              className="px-4 py-2.5 glass-soft rounded-xl text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
            >
              <ImagePlus className="w-4 h-4" />
              <span>{images.length >= MAX_PROOF_IMAGES ? `${MAX_PROOF_IMAGES} attached` : 'Choose screenshots'}</span>
            </button>
            <p className="text-[11px] text-muted mt-2">…or drop them here, or paste a screenshot with Ctrl/Cmd + V</p>
          </div>

          {images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {images.map((image, index) => (
                <div key={`${index}-${image.length}`} className="relative group rounded-lg overflow-hidden border border-[var(--glass-border)]">
                  <img src={image} alt={`WhatsApp screenshot ${index + 1}`} className="w-full h-24 object-cover" />
                  <button
                    type="button"
                    onClick={() => removeAt(index)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/60 text-white flex items-center justify-center opacity-90 hover:bg-rose-600 transition-colors"
                    title="Remove this screenshot"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
              Note <span className="normal-case tracking-normal font-medium">(optional)</span>
            </label>
            <textarea
              rows="2"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What was agreed, or anything the reviewer should notice…"
              className="w-full p-2.5 glass-input rounded-xl text-sm resize-none"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl border border-rose-400/30 bg-rose-500/10 text-xs font-medium text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-[var(--glass-border)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 glass-soft rounded-xl text-sm font-medium hover:border-white/25 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || images.length === 0}
              className="px-5 py-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2 text-sm"
            >
              <ShieldCheck className={`w-4 h-4 ${busy ? 'animate-pulse' : ''}`} />
              <span>{busy ? 'Saving…' : 'Save proof & log contact'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

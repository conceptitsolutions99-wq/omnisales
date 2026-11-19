import React, { useEffect, useMemo, useState } from 'react';
import { X, RefreshCw, ShieldCheck, AlertTriangle, Camera, User } from 'lucide-react';
import { listWhatsAppProofs, getWhatsAppProof } from '../lib/whatsapp-proofs';

const timeAgo = (value) => {
  const then = new Date(value || '').getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

// Admin and analyst view of every WhatsApp contact: who messaged, which lead, and the
// screenshots of the conversation that the employee had to attach before it could be logged.
export default function WhatsAppReview({ open, onClose, currentUser }) {
  const [proofs, setProofs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agentFilter, setAgentFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [openingId, setOpeningId] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setProofs(await listWhatsAppProofs());
    } catch (err) {
      setError(err.message || 'The WhatsApp proofs could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const agents = useMemo(
    () => ['All', ...Array.from(new Set(proofs.map((proof) => proof.agent).filter(Boolean)))],
    [proofs]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return proofs.filter((proof) => {
      if (agentFilter !== 'All' && proof.agent !== agentFilter) return false;
      if (!needle) return true;
      return [proof.leadName, proof.company, proof.agent, proof.note, proof.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [proofs, agentFilter, query]);

  const openProof = async (proof) => {
    setOpeningId(proof.id);
    setError('');
    try {
      const full = await getWhatsAppProof(proof.id);
      if (!full) throw new Error('That proof could not be opened.');
      setImageIndex(0);
      setSelected(full);
    } catch (err) {
      setError(err.message || 'That proof could not be opened.');
    } finally {
      setOpeningId('');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-xl p-4 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-4xl glass-strong my-6">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-600/30">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-[var(--text-primary)] leading-tight">
                WhatsApp proof review
                <span className="ml-2 text-[11px] font-semibold text-muted">{proofs.length} contact{proofs.length === 1 ? '' : 's'}</span>
              </h2>
              <p className="text-[11px] text-muted">
                Every WhatsApp contact with a customer, with the screenshots the employee attached
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="w-9 h-9 rounded-xl glass-soft flex items-center justify-center text-muted hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
              title="Reload"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl glass-soft flex items-center justify-center text-muted hover:text-rose-400 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-5 pt-4 flex flex-col sm:flex-row sm:items-center gap-2">
          <select
            value={agentFilter}
            onChange={(event) => setAgentFilter(event.target.value)}
            className="px-3 py-2 glass-input rounded-xl text-xs dark:text-white"
          >
            {agents.map((agent) => (
              <option key={agent} value={agent}>{agent === 'All' ? 'All employees' : agent}</option>
            ))}
          </select>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search lead, company or employee…"
            className="flex-1 px-3 py-2 glass-input rounded-xl text-xs dark:text-white"
          />
        </div>

        {error && (
          <div className="mx-5 mt-4 flex items-start gap-2 p-3 rounded-xl border border-rose-400/30 bg-rose-500/10 text-[11px] font-medium text-rose-300">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-3 sm:p-4 space-y-2 max-h-[65vh] overflow-y-auto">
          {loading && proofs.length === 0 && <p className="text-center py-10 text-sm text-muted">Loading WhatsApp proofs…</p>}

          {!loading && visible.length === 0 && (
            <p className="text-center py-10 text-sm text-muted">
              {proofs.length === 0
                ? 'No WhatsApp contacts yet. Each one appears here with its conversation screenshots.'
                : 'No proof matches this filter.'}
            </p>
          )}

          {visible.map((proof) => (
            <button
              key={proof.id}
              type="button"
              onClick={() => openProof(proof)}
              disabled={openingId === proof.id}
              className="w-full text-left rounded-xl border border-white/10 glass-soft p-3.5 hover:border-emerald-400/40 transition-colors disabled:opacity-60"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[13px] text-[var(--text-primary)] truncate">
                      {proof.leadName || proof.company || 'Lead'}
                    </span>
                    {proof.company && proof.leadName && (
                      <span className="text-[11px] text-muted truncate">{proof.company}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted flex-wrap">
                    <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{proof.agent || 'Unknown employee'}</span>
                    <span className="inline-flex items-center gap-1"><Camera className="w-3 h-3" />{proof.imageCount} screenshot{proof.imageCount === 1 ? '' : 's'}</span>
                    <span>{timeAgo(proof.createdAt)}</span>
                  </div>
                  {proof.note && <p className="mt-1.5 text-[11px] text-[var(--text-secondary)] line-clamp-2">{proof.note}</p>}
                </div>
                <span className="text-[11px] font-semibold text-emerald-500 shrink-0">
                  {openingId === proof.id ? 'Opening…' : 'Review'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-3xl glass-strong overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/10">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                  {selected.leadName || selected.company || 'WhatsApp contact'}
                </h3>
                <p className="text-[11px] text-muted truncate">
                  {selected.agent} · {new Date(selected.createdAt).toLocaleString()} · {selected.imageCount} screenshot
                  {selected.imageCount === 1 ? '' : 's'}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="w-8 h-8 rounded-lg glass-soft flex items-center justify-center text-muted hover:text-rose-400"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-black/40 flex items-center justify-center max-h-[62vh] overflow-hidden">
              <img
                src={selected.images[imageIndex]}
                alt={`WhatsApp screenshot ${imageIndex + 1}`}
                className="max-h-[62vh] w-auto object-contain"
              />
            </div>

            {selected.note && (
              <p className="px-5 py-2 text-[11px] text-[var(--text-secondary)] border-t border-white/10">{selected.note}</p>
            )}

            <div className="flex gap-2 p-3 overflow-x-auto border-t border-white/10">
              {selected.images.map((image, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setImageIndex(index)}
                  className={`shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
                    index === imageIndex ? 'border-emerald-400' : 'border-transparent hover:border-white/20'
                  }`}
                >
                  <img src={image} alt={`Screenshot ${index + 1}`} className="w-16 h-16 object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

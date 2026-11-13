import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  CornerDownLeft,
  ArrowUpDown,
  LayoutDashboard,
  Users,
  PhoneCall,
  BarChart3,
  Clock,
  ShieldAlert,
  Building2,
  Globe,
  MapPin,
  Command
} from 'lucide-react';

const TAB_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: null, keywords: 'overview home kpi' },
  { id: 'leads', label: 'Leads Generator', icon: Users, permission: 'leads', keywords: 'prospects companies generate' },
  { id: 'dialler', label: 'The Dialler', icon: PhoneCall, permission: 'dialler', keywords: 'call phone outbound' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, permission: 'analytics', keywords: 'performance conversion reports' },
  { id: 'followups', label: 'Follow-ups', icon: Clock, permission: 'followups', keywords: 'tasks callbacks transfers queue' },
  { id: 'admin', label: 'Admin Control', icon: ShieldAlert, permission: 'admin', keywords: 'users permissions staff security' },
];

const BADGE_TONE = {
  New: 'bg-sky-400/15 text-sky-300 border-sky-400/25',
  Contacted: 'bg-amber-400/15 text-amber-300 border-amber-400/25',
  Qualified: 'bg-indigo-400/15 text-indigo-300 border-indigo-400/25',
  Considering: 'bg-violet-400/15 text-violet-300 border-violet-400/25',
  'Deal Completed': 'bg-emerald-400/15 text-emerald-300 border-emerald-400/25',
  Denied: 'bg-rose-400/15 text-rose-300 border-rose-400/25',
};

export default function CommandPalette({ open, onClose, activeTab, setActiveTab, leads, currentUser, onSelectLead }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const allowedTabs = useMemo(
    () => TAB_ITEMS.filter(tab => !tab.permission || currentUser.permissions[tab.permission]),
    [currentUser]
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();

    const tabResults = allowedTabs
      .filter(tab => !q || `${tab.label} ${tab.keywords}`.toLowerCase().includes(q))
      .map(tab => ({
        kind: 'tab',
        group: 'Navigate',
        key: `tab-${tab.id}`,
        label: tab.label,
        icon: tab.icon,
        sub: tab.id === activeTab ? 'Current screen' : 'Switch screen',
        run: () => {
          setActiveTab(tab.id);
          onClose();
        },
      }));

    const leadResults = q
      ? leads
          .filter(lead =>
            [lead.name, lead.company, lead.region, lead.country, lead.solution, lead.displayPhone || lead.phone]
              .join(' ')
              .toLowerCase()
              .includes(q)
          )
          .slice(0, 6)
          .map(lead => ({
            kind: 'lead',
            group: 'Leads',
            key: `lead-${lead.id}`,
            label: lead.name,
            icon: Users,
            sub: `${lead.company} · ${lead.country}`,
            lead,
            run: () => {
              onSelectLead(lead);
              setActiveTab('dialler');
              onClose();
            },
          }))
      : [];

    return [...tabResults, ...leadResults];
  }, [query, allowedTabs, leads, activeTab, setActiveTab, onClose, onSelectLead]);

  // Reset whenever the palette opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Keep the highlighted row visible
  useEffect(() => {
    const node = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(prev => (results.length ? (prev + 1) % results.length : 0));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(prev => (results.length ? (prev - 1 + results.length) % results.length : 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      results[activeIndex]?.run();
    }
  };

  let lastGroup = null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[10vh] sm:pt-[14vh] bg-black/50 backdrop-blur-xl"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-xl glass-strong overflow-hidden rise"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {/* Search field */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--glass-border)]">
          <Search className="w-4 h-4 text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search screens, leads, companies…"
            className="flex-1 bg-transparent border-0 outline-none text-sm font-medium placeholder:text-muted/70"
            spellCheck="false"
            autoComplete="off"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold text-muted glass-soft border border-[var(--glass-border)]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium">No matches for “{query}”</p>
              <p className="text-xs text-muted mt-1">
                Try a lead name, company, city, phone number or screen name.
              </p>
            </div>
          ) : (
            results.map((result, index) => {
              const Icon = result.icon;
              const showGroup = result.group !== lastGroup;
              lastGroup = result.group;
              const isActive = index === activeIndex;

              return (
                <React.Fragment key={result.key}>
                  {showGroup && (
                    <div className="px-4 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
                      {result.group}
                    </div>
                  )}
                  <button
                    type="button"
                    data-index={index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => result.run()}
                    className={`w-full flex items-center gap-3 px-3 mx-1 rounded-xl text-left transition-colors ${
                      isActive
                        ? 'bg-gradient-to-r from-indigo-500/25 to-violet-500/10 border border-[var(--accent)]/35'
                        : 'border border-transparent'
                    }`}
                    style={{ width: 'calc(100% - 0.5rem)' }}
                  >
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-600/30'
                          : 'glass-soft text-muted'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>

                    <span className="min-w-0 flex-1 py-2.5">
                      <span className="block text-[13px] font-semibold truncate">{result.label}</span>
                      <span className="block text-[11px] text-muted truncate">{result.sub}</span>
                    </span>

                    {result.kind === 'lead' ? (
                      <span className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            BADGE_TONE[result.lead.status] || BADGE_TONE.New
                          }`}
                        >
                          {result.lead.status}
                        </span>
                        <span className="hidden sm:flex items-center gap-2 text-[10px] text-muted font-mono">
                          <span className="flex items-center gap-0.5">
                            <MapPin className="w-2.5 h-2.5" />
                            {result.lead.region}
                          </span>
                        </span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted font-mono shrink-0 hidden sm:block">{result.sub}</span>
                    )}

                    {isActive && <CornerDownLeft className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-[var(--glass-border)] text-[10px] text-muted">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3" /> navigate
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft className="w-3 h-3" /> open
            </span>
            <span className="hidden sm:flex items-center gap-1">
              <Command className="w-3 h-3" /> K to toggle
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3 h-3" />
            <span>{leads.length} leads indexed</span>
            <Globe className="w-3 h-3 ml-1 text-cyan-400" />
          </div>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import {
  LayoutDashboard,
  Users,
  PhoneCall,
  BarChart3,
  Clock,
  ShieldAlert,
  Sun,
  Moon,
  LogOut,
  Globe,
  Sparkles,
  Search,
  MailOpen
} from 'lucide-react';

const initialsOf = (name = '') =>
  name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();

export default function Navbar({ activeTab, setActiveTab, currentUser, onLogout, darkMode, setDarkMode, onOpenPalette, repliesUnread = 0, onOpenReplies }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: true },
    { id: 'leads', label: 'Leads', icon: Users, permission: currentUser.permissions.leads },
    { id: 'dialler', label: 'Dialler', icon: PhoneCall, permission: currentUser.permissions.dialler },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, permission: currentUser.permissions.analytics },
    { id: 'followups', label: 'Follow-ups', icon: Clock, permission: currentUser.permissions.followups },
    { id: 'admin', label: 'Admin', icon: ShieldAlert, permission: currentUser.permissions.admin },
  ].filter(item => item.permission);

  return (
    <>
      {/* Floating glass top bar */}
      <div className="sticky top-0 z-40 pt-3 sm:pt-4 px-3 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px]">
          <header className="glass glass-strong !rounded-2xl px-3 sm:px-4">
            <div className="flex items-center justify-between gap-3 h-16">

              {/* Identity */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative w-10 h-10 rounded-xl overflow-hidden ring-1 ring-white/15 shadow-lg shadow-blue-950/50 shrink-0">
                  <img
                    src="/logo-mark.png"
                    alt="Concept IT Solutions logo"
                    className="w-full h-full object-cover"
                    onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = '/logo-mark.svg'; }}
                  />
                  <span className="absolute right-0.5 bottom-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[var(--page-bg)] live-dot" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[15px] tracking-tight whitespace-nowrap">Concept IT Solutions</span>
                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full accent-pill">
                      <Sparkles className="w-2.5 h-2.5" /> IT Pro
                    </span>
                  </div>
                  <div className="hidden md:flex items-center gap-1.5 text-[11px] text-muted whitespace-nowrap">
                    <Globe className="w-3 h-3 text-cyan-400" />
                    Canada &amp; USA · Web · Portals · Apps
                  </div>
                </div>
              </div>

              {/* Desktop segmented navigation */}
              <nav className="hidden lg:flex items-center gap-1 p-1 rounded-xl glass-soft">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-all duration-300 ${
                        isActive
                          ? 'text-white bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-600/35'
                          : 'text-muted hover:text-[var(--text-primary)] hover:bg-white/[0.06]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={onOpenReplies}
                  className="relative w-9 h-9 rounded-xl glass-soft flex items-center justify-center text-muted hover:text-[var(--text-primary)] hover:border-[var(--accent)]/40 transition-colors"
                  title={repliesUnread > 0 ? `${repliesUnread} new customer ${repliesUnread === 1 ? 'reply' : 'replies'}` : 'Customer replies'}
                >
                  <MailOpen className="w-4 h-4" />
                  {repliesUnread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-lg shadow-rose-500/40">
                      {repliesUnread > 9 ? '9+' : repliesUnread}
                    </span>
                  )}
                </button>

                <button
                  onClick={onOpenPalette}
                  className="flex items-center gap-2 h-9 px-2.5 xl:px-3 rounded-xl glass-soft text-muted hover:text-[var(--text-primary)] hover:border-[var(--accent)]/40 transition-colors"
                  title="Search (Ctrl/Cmd + K)"
                >
                  <Search className="w-4 h-4 shrink-0" />
                  <span className="hidden xl:inline text-[12px] font-medium">Search…</span>
                  <kbd className="hidden xl:inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border border-[var(--glass-border)]">
                    ⌘K
                  </kbd>
                </button>

                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className="w-9 h-9 rounded-xl glass-soft flex items-center justify-center text-muted hover:text-[var(--text-primary)] hover:border-[var(--accent)]/40 transition-colors"
                  title="Toggle theme"
                >
                  {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
                </button>

                <div className="hidden sm:flex items-center gap-2.5 pl-2.5 border-l border-white/10">
                  <div className="text-right leading-tight">
                    <div className="text-[13px] font-semibold whitespace-nowrap">{currentUser.name}</div>
                    <div className="text-[11px] font-medium accent-text whitespace-nowrap">{currentUser.role}</div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 text-[11px] font-bold text-white flex items-center justify-center shadow-md shadow-cyan-500/25">
                    {initialsOf(currentUser.name)}
                  </div>
                </div>

                <button
                  onClick={onLogout}
                  className="w-9 h-9 rounded-xl glass-soft flex items-center justify-center text-muted hover:text-rose-400 hover:border-rose-400/40 transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>

            </div>
          </header>
        </div>
      </div>

      {/* Mobile floating dock */}
      <div className="lg:hidden fixed bottom-3 inset-x-3 z-40">
        <div className="glass glass-strong !rounded-2xl px-1.5 py-1.5 flex items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-[10px] font-semibold transition-all ${
                  isActive
                    ? 'text-white bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-600/30'
                    : 'text-muted'
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

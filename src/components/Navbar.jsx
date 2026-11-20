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
  MailOpen,
  MessageSquareText,
  ClipboardList,
  Settings,
  UserRound
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

export default function Navbar({ activeTab, setActiveTab, currentUser, onLogout, onOpenProfile, darkMode, setDarkMode, onOpenPalette, repliesUnread = 0, onOpenReplies, onOpenRequirements, requirementsPending = 0, onOpenWhatsAppProofs, onOpenSetup }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: true },
    { id: 'leads', label: 'Leads', icon: Users, permission: currentUser.permissions.leads },
    { id: 'dialler', label: 'Dialler', icon: PhoneCall, permission: currentUser.permissions.dialler },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, permission: currentUser.permissions.analytics },
    { id: 'followups', label: 'Follow-ups', icon: Clock, permission: currentUser.permissions.followups },
    { id: 'admin', label: 'Admin', icon: ShieldAlert, permission: currentUser.permissions.admin },
  ].filter(item => item.permission);

  // The admin and the analyst review the WhatsApp proof trail; agents only file their own
  const canReviewWhatsApp =
    Boolean(currentUser.permissions?.admin) ||
    currentUser.role === 'Analyst' ||
    Boolean(currentUser.permissions?.analytics);

  return (
    <>
      {/* Floating top bar: obsidian, white type and gold accents in either theme */}
      <div className="sticky top-0 z-40 pt-3 sm:pt-4 px-3 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px]">
          <header className="goldbar px-3 sm:px-4">
            <div className="flex items-center justify-between gap-3 h-16">

              {/* Identity */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="goldbar-logo relative w-10 h-10 rounded-xl overflow-hidden shrink-0">
                  <img
                    src="/logo-mark.png"
                    alt="Concept IT Solutions logo"
                    className="w-full h-full object-cover"
                    onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = '/logo-mark.svg'; }}
                  />
                  <span className="goldbar-live absolute right-0.5 bottom-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0a0a0b]" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[15px] tracking-tight whitespace-nowrap">Concept IT Solutions</span>
                    <span className="goldbar-pill hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">
                      <Sparkles className="w-2.5 h-2.5" /> IT Pro
                    </span>
                  </div>
                  <div className="goldbar-sub hidden md:flex items-center gap-1.5 text-[11px] whitespace-nowrap">
                    <Globe className="goldbar-gold w-3 h-3" />
                    Canada &amp; USA · Web · Portals · Apps
                  </div>
                </div>
              </div>

              {/* Desktop segmented navigation */}
              <nav className="goldbar-nav hidden lg:flex items-center gap-1 p-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-all duration-300 ${
                        isActive ? 'goldbar-link-active' : 'goldbar-link'
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
                  className="goldbar-action relative w-9 h-9 flex items-center justify-center"
                  title={repliesUnread > 0 ? `${repliesUnread} new customer ${repliesUnread === 1 ? 'reply' : 'replies'}` : 'Customer replies'}
                >
                  <MailOpen className="w-4 h-4" />
                  {repliesUnread > 0 && (
                    <span className="goldbar-badge absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center">
                      {repliesUnread > 9 ? '9+' : repliesUnread}
                    </span>
                  )}
                </button>

                <button
                  onClick={onOpenRequirements}
                  className="goldbar-action relative w-9 h-9 flex items-center justify-center"
                  title={requirementsPending > 0 ? `${requirementsPending} requirements form${requirementsPending === 1 ? '' : 's'} awaiting answers` : 'Requirements forms'}
                >
                  <ClipboardList className="w-4 h-4" />
                  {requirementsPending > 0 && (
                    <span className="goldbar-badge absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center">
                      {requirementsPending > 9 ? '9+' : requirementsPending}
                    </span>
                  )}
                </button>

                {canReviewWhatsApp && (
                  <button
                    onClick={onOpenWhatsAppProofs}
                    className="goldbar-action w-9 h-9 flex items-center justify-center"
                    title="WhatsApp proof review"
                  >
                    <MessageSquareText className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={onOpenPalette}
                  className="goldbar-action flex items-center gap-2 h-9 px-2.5 xl:px-3"
                  title="Search (Ctrl/Cmd + K)"
                >
                  <Search className="w-4 h-4 shrink-0" />
                  <span className="hidden xl:inline text-[12px] font-medium">Search…</span>
                  <kbd className="goldbar-kbd hidden xl:inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border">
                    ⌘K
                  </kbd>
                </button>

                <button
                  onClick={onOpenSetup}
                  className="goldbar-action w-9 h-9 flex items-center justify-center shrink-0"
                  title="Setup status"
                >
                  <Settings className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className="goldbar-action w-9 h-9 flex items-center justify-center"
                  title="Toggle theme"
                >
                  {darkMode ? <Sun className="goldbar-gold w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>

                <button
                  onClick={onOpenProfile}
                  className="goldbar-divider hidden sm:flex items-center gap-2.5 pl-2.5 border-l text-left rounded-xl hover:opacity-90 transition-opacity"
                  title="Edit my name and outreach title"
                >
                  <div className="text-right leading-tight">
                    <div className="text-[13px] font-semibold whitespace-nowrap text-white">{currentUser.name}</div>
                    <div className="goldbar-gold text-[11px] font-medium whitespace-nowrap">
                      {currentUser.title || currentUser.role}
                    </div>
                  </div>
                  <div className="goldbar-avatar w-9 h-9 rounded-full text-[11px] font-bold flex items-center justify-center">
                    {initialsOf(currentUser.name)}
                  </div>
                </button>

                <button
                  onClick={onOpenProfile}
                  className="goldbar-action sm:hidden w-9 h-9 flex items-center justify-center"
                  title="Edit my name and outreach title"
                >
                  <UserRound className="w-4 h-4" />
                </button>

                <button
                  onClick={onLogout}
                  className="goldbar-action w-9 h-9 flex items-center justify-center"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>

            </div>
          </header>
        </div>
      </div>

      {/* Mobile floating dock, styled as the same black/white/gold chrome */}
      <div className="lg:hidden fixed bottom-3 inset-x-3 z-40">
        <div className="goldbar px-1.5 py-1.5 flex items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-[10px] font-semibold transition-all ${
                  isActive ? 'goldbar-link-active' : 'goldbar-link'
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

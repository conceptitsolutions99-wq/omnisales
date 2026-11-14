import React, { useState, useEffect, useCallback } from 'react';
import { INITIAL_USERS } from './data/initialData';
import LoginModal from './components/LoginModal';
import ForcePasswordChange from './components/ForcePasswordChange';
import Navbar from './components/Navbar';
import MainOverview from './components/MainOverview';
import LeadsGenerator from './components/LeadsGenerator';
import Dialler from './components/Dialler';
import Analytics from './components/Analytics';
import FollowUps from './components/FollowUps';
import AdminDashboard from './components/AdminDashboard';
import CommandPalette from './components/CommandPalette';
import RepliesPanel from './components/RepliesPanel';
import RequirementsPanel from './components/RequirementsPanel';
import PublicRequirementPage from './components/PublicRequirementPage';
import SetupChecklist from './components/SetupChecklist';
import { fetchReplies, markRepliesSeen, isAdminUser, assignReply } from './lib/replies';
import { getSession, signIn, signOut } from './lib/session';
import { listStaff } from './lib/staff';
import { listRequirements } from './lib/requirements';

function AmbientBackdrop() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
    </div>
  );
}

// Users saved in localStorage keep an older display name until renamed here
const LEGACY_NAMES = [['Alex Developer', 'Seif Amr']];

const renameLegacyUser = (user) => {
  if (!user || typeof user.name !== 'string') return user;
  const name = LEGACY_NAMES.reduce((current, [from, to]) => current.split(from).join(to), user.name);
  return name === user.name ? user : { ...user, name };
};

function Workspace() {
  // The session is an HttpOnly cookie verified by the server, never a local flag
  const [currentUser, setCurrentUser] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    getSession()
      .then((user) => setCurrentUser(user ? renameLegacyUser(user) : null))
      .catch(() => setCurrentUser(null))
      .finally(() => setSessionChecked(true));
  }, []);

  const [activeTab, setActiveTab] = useState('dashboard');

  // Dark glass is the default experience; light mode is an explicit opt-in
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('omnisales_theme');
    if (saved !== null) return JSON.parse(saved);
    return true;
  });

  const [users, setUsers] = useState(() => {
    const saved = localStorage.getItem('omnisales_users');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map(u => renameLegacyUser(u));
      } catch (e) {
        return INITIAL_USERS;
      }
    }
    return INITIAL_USERS;
  });

  // Fresh start: default to empty arrays and clear old cached demo data
  const [leads, setLeads] = useState(() => {
    const saved = localStorage.getItem('omnisales_leads');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // If it still has old demo data, clear it for fresh start
        if (parsed.length > 0 && parsed.some(l => l.company === 'Sterling Logistics Corp')) {
          localStorage.removeItem('omnisales_leads');
          return [];
        }
        return parsed;
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [callLogs, setCallLogs] = useState(() => {
    const saved = localStorage.getItem('omnisales_call_logs');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0 && parsed.some(l => l.company === 'Vancouver Harbor Exports')) {
          localStorage.removeItem('omnisales_call_logs');
          return [];
        }
        return parsed;
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [followups, setFollowups] = useState(() => {
    const saved = localStorage.getItem('omnisales_followups');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0 && parsed.some(l => l.company === 'Vancouver Harbor Exports')) {
          localStorage.removeItem('omnisales_followups');
          return [];
        }
        return parsed;
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [selectedLeadForCall, setSelectedLeadForCall] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Customer replies to outreach email
  const [replies, setReplies] = useState([]);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [repliesError, setRepliesError] = useState('');
  const [repliesStorage, setRepliesStorage] = useState('persistent');
  const [setupOpen, setSetupOpen] = useState(false);

  // Requirements forms sent to customers, and the answers that come back
  const [requirements, setRequirements] = useState([]);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [requirementsLoading, setRequirementsLoading] = useState(false);
  const [requirementsError, setRequirementsError] = useState('');

  const loadRequirements = useCallback(async () => {
    setRequirementsLoading(true);
    setRequirementsError('');
    try {
      const data = await listRequirements();
      setRequirements(Array.isArray(data.requests) ? data.requests : []);
    } catch (err) {
      setRequirementsError(err.message === 'Failed to fetch' ? 'Cannot reach the server.' : err.message);
    } finally {
      setRequirementsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) loadRequirements();
    else setRequirements([]);
  }, [currentUser, loadRequirements]);

  const openRequirements = () => {
    setRequirementsOpen(true);
    loadRequirements();
  };

  const loadReplies = useCallback(async (user) => {
    if (!user) return;
    setRepliesLoading(true);
    setRepliesError('');
    try {
      const loaded = await fetchReplies(user);
      setReplies(loaded.replies);
      setRepliesStorage(loaded.storage);
    } catch (err) {
      setRepliesError(err.message === 'Failed to fetch' ? 'Cannot reach the mail service.' : err.message);
    } finally {
      setRepliesLoading(false);
    }
  }, []);

  // Admins need the roster to hand a reply to a specific employee
  const [staff, setStaff] = useState([]);
  const viewerIsAdmin = isAdminUser(currentUser);

  useEffect(() => {
    if (!viewerIsAdmin) {
      setStaff([]);
      return;
    }
    listStaff()
      .then((data) => setStaff(Array.isArray(data.users) ? data.users : []))
      .catch(() => setStaff([]));
  }, [viewerIsAdmin]);

  const assignReplyTo = useCallback(
    async (replyId, email) => {
      setRepliesError('');
      try {
        await assignReply(replyId, email);
        await loadReplies(currentUser);
      } catch (err) {
        setRepliesError(err.message);
      }
    },
    [currentUser, loadReplies]
  );

  // Check on sign-in and then quietly every two minutes
  useEffect(() => {
    if (!currentUser) {
      setReplies([]);
      return undefined;
    }
    loadReplies(currentUser);
    const timer = setInterval(() => loadReplies(currentUser), 120000);
    return () => clearInterval(timer);
  }, [currentUser, loadReplies]);

  const openReplies = () => {
    setRepliesOpen(true);
    markRepliesSeen(replies.map((reply) => reply.id));
    setReplies((current) => current.map((reply) => ({ ...reply, unread: false })));
    loadReplies(currentUser);
  };

  // ⌘K / Ctrl+K opens the command palette, Esc closes it
  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(prev => !prev);
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    localStorage.setItem('omnisales_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem('omnisales_leads', JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem('omnisales_call_logs', JSON.stringify(callLogs));
  }, [callLogs]);

  useEffect(() => {
    localStorage.setItem('omnisales_followups', JSON.stringify(followups));
  }, [followups]);

  // Dark mode class toggle & persistence
  useEffect(() => {
    localStorage.setItem('omnisales_theme', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handleLogin = async (email, password) => {
    const user = await signIn(email, password);
    setCurrentUser(renameLegacyUser(user));
    setActiveTab('dashboard');
  };

  const handleLogout = async () => {
    await signOut();
    setCurrentUser(null);
    localStorage.removeItem('omnisales_user');
  };

  const handleClearDatabase = () => {
    if (window.confirm('Are you sure you want to clear all leads, call logs, and follow-up tasks? This will give you a completely fresh system.')) {
      setLeads([]);
      setCallLogs([]);
      setFollowups([]);
      localStorage.removeItem('omnisales_leads');
      localStorage.removeItem('omnisales_call_logs');
      localStorage.removeItem('omnisales_followups');
      alert('Database successfully cleared! You are operating fresh.');
    }
  };

  if (!sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <AmbientBackdrop />
        <p className="text-sm text-muted">Checking your session…</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <AmbientBackdrop />
        <LoginModal onLogin={handleLogin} />
      </div>
    );
  }

  // A temporary password from the admin only opens the change-password screen
  if (currentUser.mustChangePassword) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <AmbientBackdrop />
        <ForcePasswordChange
          user={currentUser}
          onChanged={(user) => setCurrentUser(user ? renameLegacyUser(user) : { ...currentUser, mustChangePassword: false })}
          onSignOut={handleLogout}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col text-[var(--text-primary)]">
      <AmbientBackdrop />

      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogout={handleLogout}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        onOpenPalette={() => setPaletteOpen(true)}
        repliesUnread={replies.filter((reply) => reply.unread).length}
        onOpenRequirements={openRequirements}
        requirementsPending={requirements.filter((request) => !request.submittedAt).length}
        onOpenReplies={openReplies}
        onOpenSetup={() => setSetupOpen(true)}
      />

      <main className="flex-1 w-full max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8 pt-4 pb-28 lg:pb-12">
        <div key={activeTab} className="rise">
          {activeTab === 'dashboard' && (
            <MainOverview
              leads={leads}
              callLogs={callLogs}
              followups={followups}
              setActiveTab={setActiveTab}
              currentUser={currentUser}
            />
          )}

          {activeTab === 'leads' && (
            <LeadsGenerator
              leads={leads}
              setLeads={setLeads}
              setActiveTab={setActiveTab}
              onSelectLeadForCall={setSelectedLeadForCall}
              currentUser={currentUser}
              callLogs={callLogs}
            />
          )}

          {activeTab === 'dialler' && (
            <Dialler
              leads={leads}
              setLeads={setLeads}
              callLogs={callLogs}
              setCallLogs={setCallLogs}
              followups={followups}
              setFollowups={setFollowups}
              selectedLeadForCall={selectedLeadForCall}
              currentUser={currentUser}
            />
          )}

          {activeTab === 'analytics' && (
            <Analytics
              leads={leads}
              callLogs={callLogs}
              currentUser={currentUser}
            />
          )}

          {activeTab === 'followups' && (
            <FollowUps
              followups={followups}
              setFollowups={setFollowups}
              leads={leads}
              currentUser={currentUser}
            />
          )}

          {activeTab === 'admin' && currentUser.permissions.admin && (
            <AdminDashboard
              users={users}
              setUsers={setUsers}
              currentUser={currentUser}
              onClearDatabase={handleClearDatabase}
            />
          )}
        </div>
      </main>

      <SetupChecklist open={setupOpen} onClose={() => setSetupOpen(false)} />

      <RequirementsPanel
        open={requirementsOpen}
        onClose={() => setRequirementsOpen(false)}
        requests={requirements}
        loading={requirementsLoading}
        error={requirementsError}
        isAdmin={viewerIsAdmin}
        onRefresh={loadRequirements}
      />

      <RepliesPanel
        open={repliesOpen}
        onClose={() => setRepliesOpen(false)}
        replies={replies}
        loading={repliesLoading}
        error={repliesError}
        isAdmin={viewerIsAdmin}
        currentUser={currentUser}
        staff={
          currentUser
            ? [
                { name: `${currentUser.name} (you)`, email: currentUser.email },
                ...staff.filter(
                  (person) => person.email.toLowerCase() !== String(currentUser.email || '').toLowerCase()
                )
              ]
            : staff
        }
        storage={repliesStorage}
        onRefresh={() => loadReplies(currentUser)}
        onAssign={assignReplyTo}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        leads={leads}
        currentUser={currentUser}
        onSelectLead={setSelectedLeadForCall}
      />
    </div>
  );
}

// The requirements page a customer opens from the emailed link is public: it renders before
// any session check, so the customer never meets the sign-in screen.
const requirementTokenFromUrl = () => {
  const match = window.location.hash.match(/^#\/requirements\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
};

export default function App() {
  const [requirementToken] = useState(requirementTokenFromUrl);
  if (requirementToken) return <PublicRequirementPage token={requirementToken} />;
  return <Workspace />;
}

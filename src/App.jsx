import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import ProfileModal from './components/ProfileModal';
import WhatsAppReview from './components/WhatsAppReview';
import { fetchReplies, markRepliesSeen, isAdminUser, isReviewerUser, assignReply } from './lib/replies';
import { getSession, signIn, signOut } from './lib/session';
import { listStaff } from './lib/staff';
import { listRequirements } from './lib/requirements';
import { listSharedLeads, pushSharedLeads, listActivity, pushActivity } from './lib/leads-api';
import { leadKey, mergeLeadLists } from './lib/lead-key';
import { mergeActivity } from './lib/activity-merge';

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
  // Admin and analyst review of every WhatsApp contact's conversation screenshots
  const [whatsAppReviewOpen, setWhatsAppReviewOpen] = useState(false);

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

  // The lead list is the team's, kept on the server; the browser copy is a cache so the page
  // still works offline. Each change is pushed, and the list is refreshed so an employee's
  // contact shows up in front of the admin without a reload.
  const leadsRef = useRef(leads);
  const leadsSynced = useRef(false);
  const leadsPushTimer = useRef(null);

  useEffect(() => {
    leadsRef.current = leads;
  }, [leads]);

  // Adopt the server's copy without re-rendering when nothing actually differs. The server is
  // also the truth about which leads still exist: keys an admin deleted are dropped from this
  // browser's copy before the merge, so a stale tab cannot push a deleted lead back.
  const applySharedLeads = useCallback((shared, deleted = []) => {
    setLeads(prev => {
      const gone = new Set(deleted || []);
      const kept = gone.size > 0 ? prev.filter(lead => !gone.has(leadKey(lead))) : prev;
      const merged = mergeLeadLists(kept, shared);
      return JSON.stringify(merged) === JSON.stringify(prev) ? prev : merged;
    });
  }, []);

  useEffect(() => {
    if (!currentUser) {
      leadsSynced.current = false;
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // Leads this browser already had are uploaded first, so the first sign-in on a new
        // device does not start from an empty list
        const synced = await pushSharedLeads(leadsRef.current);
        if (!cancelled) applySharedLeads(synced.leads, synced.deleted);
      } catch (err) {
        /* offline or not deployed yet: the cached list keeps working */
      } finally {
        if (!cancelled) leadsSynced.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser, applySharedLeads]);

  useEffect(() => {
    if (!currentUser || !leadsSynced.current) return;

    clearTimeout(leadsPushTimer.current);
    leadsPushTimer.current = setTimeout(() => {
      pushSharedLeads(leadsRef.current)
        .then(synced => applySharedLeads(synced.leads, synced.deleted))
        .catch(() => {});
    }, 1200);

    return () => clearTimeout(leadsPushTimer.current);
  }, [leads, currentUser, applySharedLeads]);

  // Outreach history follows the same rule as the leads: shared for the admin, own for an
  // employee, with this browser's copy kept as a cache
  const callLogsRef = useRef(callLogs);
  const activitySynced = useRef(false);
  const activityPushTimer = useRef(null);

  useEffect(() => {
    callLogsRef.current = callLogs;
  }, [callLogs]);

  // Only this employee's own entries are sent back: the rest arrived from the server and
  // pushing them again would copy them under the wrong name
  const ownActivity = useCallback(
    (entries) =>
      entries.filter(
        entry =>
          !entry.callerEmail ||
          String(entry.callerEmail).toLowerCase() === String(currentUser?.email || '').toLowerCase()
      ),
    [currentUser?.email]
  );

  const applySharedActivity = useCallback((shared) => {
    setCallLogs(prev => {
      const merged = mergeActivity(prev, shared);
      return JSON.stringify(merged) === JSON.stringify(prev) ? prev : merged;
    });
  }, []);

  useEffect(() => {
    if (!currentUser) {
      activitySynced.current = false;
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const merged = await pushActivity(ownActivity(callLogsRef.current));
        if (!cancelled) applySharedActivity(merged);
      } catch (err) {
        /* offline: the cached history keeps working */
      } finally {
        if (!cancelled) activitySynced.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser, applySharedActivity, ownActivity]);

  useEffect(() => {
    if (!currentUser || !activitySynced.current) return;

    clearTimeout(activityPushTimer.current);
    activityPushTimer.current = setTimeout(() => {
      pushActivity(ownActivity(callLogsRef.current))
        .then(merged => applySharedActivity(merged))
        .catch(() => {});
    }, 1200);

    return () => clearTimeout(activityPushTimer.current);
  }, [callLogs, currentUser, applySharedActivity, ownActivity]);

  // Both lists are refreshed together, so a colleague's contact and its history arrive
  useEffect(() => {
    if (!currentUser) return;
    const timer = setInterval(() => {
      listSharedLeads()
        .then(synced => applySharedLeads(synced.leads, synced.deleted))
        .catch(() => {});
      listActivity()
        .then(shared => applySharedActivity(shared))
        .catch(() => {});
    }, 20000);
    return () => clearInterval(timer);
  }, [currentUser, applySharedLeads, applySharedActivity]);

  const [selectedLeadForCall, setSelectedLeadForCall] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

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
      // A reply moves its lead to Replied on the server; adopt it without waiting for a push
      if (loaded.leads.length > 0) applySharedLeads(loaded.leads);
    } catch (err) {
      setRepliesError(err.message === 'Failed to fetch' ? 'Cannot reach the mail service.' : err.message);
    } finally {
      setRepliesLoading(false);
    }
  }, [applySharedLeads]);

  // Admins need the roster to hand a reply to a specific employee
  const [staff, setStaff] = useState([]);
  const viewerIsAdmin = isAdminUser(currentUser);
  // The analyst reviews the whole team's replies and forms, like the admin
  const viewerCanReview = isReviewerUser(currentUser);

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

  // A prospect who answered is no longer a follow-up target. The task queue lives in this
  // browser, so it is cancelled here as soon as the shared lead says it has a reply.
  useEffect(() => {
    const replied = leads.filter(lead => lead.repliedAt);
    if (replied.length === 0) return;
    const repliedIds = new Set(replied.map(lead => String(lead.id)));
    setFollowups(prev => {
      let changed = false;
      const next = prev.map(task => {
        if (!task || task.status === 'Completed' || task.status === 'Cancelled') return task;
        if (!repliedIds.has(String(task.leadId))) return task;
        changed = true;
        return {
          ...task,
          status: 'Cancelled',
          cancelledAt: new Date().toISOString(),
          cancelledReason: 'Prospect replied'
        };
      });
      return changed ? next : prev;
    });
  }, [leads]);

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
        onOpenProfile={() => setProfileOpen(true)}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        onOpenPalette={() => setPaletteOpen(true)}
        repliesUnread={replies.filter((reply) => reply.unread).length}
        onOpenRequirements={openRequirements}
        requirementsPending={requirements.filter((request) => !request.submittedAt).length}
        onOpenReplies={openReplies}
        onOpenWhatsAppProofs={() => setWhatsAppReviewOpen(true)}
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
              replies={replies}
              requirements={requirements}
              onOpenReplies={openReplies}
              onOpenRequirements={openRequirements}
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
              onOpenRequirements={openRequirements}
              requirementEvents={requirements.reduce((acc, request) => {
                if (request.leadId != null) acc[`id:${request.leadId}`] = request;
                if (request.leadEmail) acc[`email:${request.leadEmail}`] = request;
                return acc;
              }, {})}
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

      {profileOpen && (
        <ProfileModal
          user={currentUser}
          onClose={() => setProfileOpen(false)}
          onSaved={(user) => setCurrentUser(user ? renameLegacyUser(user) : currentUser)}
        />
      )}

      <RequirementsPanel
        open={requirementsOpen}
        onClose={() => setRequirementsOpen(false)}
        requests={requirements}
        loading={requirementsLoading}
        error={requirementsError}
        isAdmin={viewerIsAdmin}
        canReview={viewerCanReview}
        currentUser={currentUser}
        onRefresh={loadRequirements}
        setLeads={setLeads}
      />

      <RepliesPanel
        open={repliesOpen}
        onClose={() => setRepliesOpen(false)}
        replies={replies}
        loading={repliesLoading}
        error={repliesError}
        isAdmin={viewerIsAdmin}
        canReview={viewerCanReview}
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

      <WhatsAppReview
        open={whatsAppReviewOpen}
        onClose={() => setWhatsAppReviewOpen(false)}
        currentUser={currentUser}
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
  const [requirementToken, setRequirementToken] = useState(requirementTokenFromUrl);

  // A second form link can be opened in the same tab, which only changes the hash; without
  // this the page would keep showing the form it first loaded.
  useEffect(() => {
    const sync = () => setRequirementToken(requirementTokenFromUrl());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  if (requirementToken) return <PublicRequirementPage key={requirementToken} token={requirementToken} />;
  return <Workspace />;
}

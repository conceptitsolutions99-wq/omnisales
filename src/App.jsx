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
import HistoryLog from './components/HistoryLog';
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
import {
  listRequirements,
  markRequirementAnswersSeen,
  readSeenRequirementAnswers
} from './lib/requirements';
import { REQUIREMENT_FORMS } from './data/requirementForms';
import { BellRing } from 'lucide-react';
import {
  listSharedLeads,
  pushSharedLeads,
  listActivity,
  pushActivity,
  clearSharedActivity,
  deleteSharedActivity,
  restoreSharedActivity,
  deleteSharedLeads
} from './lib/leads-api';
import { listFollowups, pushFollowups, clearFollowups } from './lib/followups';
import { leadKey, mergeLeadLists } from './lib/lead-key';
import { dropDeleted, mergeActivity } from './lib/activity-merge';

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

// How long a cleared history can be put back, the same window the history delete offers
const CLEAR_UNDO_WINDOW_MS = 30000;

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

  const [followups, setFollowups] = useState([]);

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

  // Follow-ups live in the shared store, so a reply cancels the task on every device and any
  // device can complete or reschedule it. The fingerprints remember what the server already
  // has, so loading or polling the queue never pushes every task back as if it had changed.
  const followupsFingerprints = useRef(new Map());
  const followupsPending = useRef(false);
  const followupsRetryTimer = useRef(null);

  const seedFollowups = useCallback((shared) => {
    const list = Array.isArray(shared) ? shared : [];
    followupsFingerprints.current = new Map(list.map(task => [String(task.id), JSON.stringify(task)]));
    setFollowups(prev => (JSON.stringify(list) === JSON.stringify(prev) ? prev : list));
  }, []);

  useEffect(() => {
    if (!currentUser) {
      clearTimeout(followupsRetryTimer.current);
      followupsRetryTimer.current = null;
      followupsPending.current = false;
      followupsFingerprints.current = new Map();
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        let shared = await listFollowups();
        // The queue used to live in this browser only. Upload the tasks the shared queue does
        // not have yet, even when teammates already have entries: the id is the merge key, so a
        // task the server already knows keeps its newer state.
        let cached = [];
        try {
          const parsed = JSON.parse(localStorage.getItem('omnisales_followups') || '[]');
          cached = Array.isArray(parsed) ? parsed : [];
        } catch (err) {
          cached = [];
        }
        if (cached.length > 0) {
          const sharedIds = new Set(shared.map(task => String(task.id)));
          const cachedById = new Map();
          for (const task of cached) {
            if (!task || task.id === undefined || task.id === null || String(task.id).trim() === '') continue;
            cachedById.set(String(task.id), task);
          }
          const missing = [...cachedById.values()].filter(task => !sharedIds.has(String(task.id)));
          if (missing.length > 0) shared = await pushFollowups(missing);
          // Only forget the cache once the merge reached the server; a failure leaves it for
          // the next sign-in instead of losing the tasks
          localStorage.removeItem('omnisales_followups');
        }
        if (!cancelled) seedFollowups(shared);
      } catch (err) {
        // Offline: the last copy this browser held is still better than an empty queue
        try {
          const parsed = JSON.parse(localStorage.getItem('omnisales_followups') || '[]');
          if (Array.isArray(parsed) && parsed.length > 0) setFollowups(parsed);
        } catch (ignored) {
          /* no cache */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser, seedFollowups]);

  // Only the tasks that actually changed are sent; a load or a poll is not a change. A failed
  // push keeps the local task and retries, because the server never received it.
  useEffect(() => {
    if (!currentUser) {
      followupsPending.current = false;
      clearTimeout(followupsRetryTimer.current);
      followupsRetryTimer.current = null;
      return undefined;
    }

    const changed = followups.filter(
      task => followupsFingerprints.current.get(String(task.id)) !== JSON.stringify(task)
    );
    if (changed.length === 0) return undefined;

    let active = true;
    let retryDelay = 5000;
    followupsPending.current = true;
    clearTimeout(followupsRetryTimer.current);
    followupsRetryTimer.current = null;

    const send = () => {
      followupsRetryTimer.current = null;
      pushFollowups(changed)
        .then(() => {
          changed.forEach(task => followupsFingerprints.current.set(String(task.id), JSON.stringify(task)));
          if (active) followupsPending.current = false;
        })
        .catch(() => {
          if (!active) return;
          // Back off, but never drop the change: the next attempt carries the same tasks
          followupsRetryTimer.current = setTimeout(send, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30000);
        });
    };

    const timer = setTimeout(send, 800);

    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(followupsRetryTimer.current);
      followupsRetryTimer.current = null;
      // A cancelled timer never reaches its success handler, so leaving this set would stop the
      // 20-second poll from refreshing follow-ups for the rest of the session.
      followupsPending.current = false;
    };
  }, [followups, currentUser]);

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

  const applySharedActivity = useCallback((shared, deleted = []) => {
    setCallLogs(prev => {
      // The server is authoritative about what was deleted, so this browser's cached copy of those
      // entries is dropped before the merge can keep it alive
      const merged = mergeActivity(dropDeleted(prev, deleted), shared);
      return JSON.stringify(merged) === JSON.stringify(prev) ? prev : merged;
    });
  }, []);

  // An admin removes the entries they selected; the result carries the remaining history and the
  // keys that were deleted, so every open tab drops the same rows
  // A clear-all is a bigger mis-click than a selection, so its undo window works the same way:
  // the rows the server removed are held here until it closes
  const [clearedHistory, setClearedHistory] = useState(null);
  const [historyUndoSeconds, setHistoryUndoSeconds] = useState(0);
  const [restoringClearedHistory, setRestoringClearedHistory] = useState(false);
  const historyUndoDeadline = useRef(0);

  useEffect(() => {
    if (!clearedHistory) return undefined;
    let timer = null;
    let done = false;
    const tick = () => {
      const left = Math.max(0, Math.ceil((historyUndoDeadline.current - Date.now()) / 1000));
      setHistoryUndoSeconds(left);
      if (left === 0) {
        done = true;
        if (timer) clearInterval(timer);
        timer = null;
        setClearedHistory(null);
      }
    };
    tick();
    if (!done) timer = setInterval(tick, 1000);
    return () => {
      done = true;
      if (timer) clearInterval(timer);
    };
  }, [clearedHistory]);

  const handleDeleteActivity = useCallback(
    async (selection) => {
      const result = await deleteSharedActivity(selection);
      applySharedActivity(result.activity, result.deleted);
      return result;
    },
    [applySharedActivity]
  );

  // Undo: the entries the admin just deleted come back for the whole team, still credited to the
  // employee who recorded them
  const handleRestoreActivity = useCallback(
    async (entries) => {
      const result = await restoreSharedActivity(entries);
      applySharedActivity(result.activity, result.deleted);
      return result;
    },
    [applySharedActivity]
  );

  const handleUndoClearHistory = useCallback(async () => {
    if (!clearedHistory || restoringClearedHistory) return;

    setRestoringClearedHistory(true);
    try {
      const result = await restoreSharedActivity(clearedHistory);
      applySharedActivity(result.activity, result.deleted);
      setClearedHistory(null);
      setHistoryUndoSeconds(0);
    } catch (err) {
      alert(`The history was not restored: ${err.message}`);
    } finally {
      setRestoringClearedHistory(false);
    }
  }, [clearedHistory, restoringClearedHistory, applySharedActivity]);

  useEffect(() => {
    if (!currentUser) {
      activitySynced.current = false;
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const merged = await pushActivity(ownActivity(callLogsRef.current));
        if (!cancelled) applySharedActivity(merged.activity, merged.deleted);
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
        .then(merged => applySharedActivity(merged.activity, merged.deleted))
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
        .then(shared => applySharedActivity(shared.activity, shared.deleted))
        .catch(() => {});
      if (!followupsPending.current) {
        listFollowups()
          .then(shared => seedFollowups(shared))
          .catch(() => {});
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [currentUser, applySharedLeads, applySharedActivity, seedFollowups]);

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

  // Answers this browser has not opened yet; the navbar badge and the toast both read from it
  const [seenAnswerTokens, setSeenAnswerTokens] = useState(readSeenRequirementAnswers);
  // Whatever is already answered when a browser first loads the list is history, not news
  const answersBaselined = useRef(false);

  // A quiet refresh leaves the panel's spinner and error banner alone, which is what the poll
  // behind the notification needs
  const loadRequirements = useCallback(async (quiet = false) => {
    if (!quiet) {
      setRequirementsLoading(true);
      setRequirementsError('');
    }
    try {
      const data = await listRequirements();
      const loaded = Array.isArray(data.requests) ? data.requests : [];
      setRequirements(loaded);

      // A browser that has never opened the panel would otherwise announce every answer ever
      // given as a new one. Its first load takes what is already there as read, so the badge and
      // the toast only mean answers that arrived while someone was working.
      if (!answersBaselined.current) {
        answersBaselined.current = true;
        if (readSeenRequirementAnswers().size === 0) {
          const alreadyAnswered = loaded
            .filter((request) => request.submittedAt)
            .map((request) => request.token);
          if (alreadyAnswered.length) {
            markRequirementAnswersSeen(alreadyAnswered);
            setSeenAnswerTokens(readSeenRequirementAnswers());
          }
        }
      }
    } catch (err) {
      if (!quiet) {
        setRequirementsError(err.message === 'Failed to fetch' ? 'Cannot reach the server.' : err.message);
      }
    } finally {
      if (!quiet) setRequirementsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) loadRequirements();
    else setRequirements([]);
  }, [currentUser, loadRequirements]);

  // A customer filling the form an agent pasted into WhatsApp has to show up without anyone
  // reloading, so the list is also checked every minute
  useEffect(() => {
    if (!currentUser) return undefined;
    const timer = setInterval(() => loadRequirements(true), 60000);
    return () => clearInterval(timer);
  }, [currentUser, loadRequirements]);

  const openRequirements = () => {
    setRequirementsOpen(true);
    // Opening the panel is reading the answers it lists
    markRequirementAnswersSeen(
      requirements.filter((request) => request.submittedAt).map((request) => request.token)
    );
    setSeenAnswerTokens(readSeenRequirementAnswers());
    loadRequirements();
  };

  // Answers that arrived and have not been opened in this browser
  const requirementAnswers = requirements.filter(
    (request) => request.submittedAt && !seenAnswerTokens.has(request.token)
  );

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

  // A prospect who answered is no longer a follow-up target. The server also closes these tasks
  // when a reply is matched; this catches tasks scheduled before the lead carried repliedAt.
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
    // Re-run when the shared queue arrives too, so a task scheduled before the reply is caught
  }, [leads, followups]);

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

  // Leads, history and follow-ups live on the server, so a local reset alone is undone by the
  // next poll. This removes the shared copies first and only then clears this browser.
  const handleClearDatabase = async () => {
    if (
      !window.confirm(
        'Clear every shared lead, call and email history entry, and follow-up task for the whole team?\n\nThe call and email history can be put back for 30 seconds. Leads and follow-ups cannot.'
      )
    )
      return;

    try {
      const { leads: sharedLeads } = await listSharedLeads();
      const [, history] = await Promise.all([
        sharedLeads.length > 0 ? deleteSharedLeads(sharedLeads) : null,
        clearSharedActivity(),
        clearFollowups()
      ]);

      setLeads([]);
      setCallLogs([]);
      setFollowups([]);
      localStorage.removeItem('omnisales_leads');
      localStorage.removeItem('omnisales_call_logs');
      localStorage.removeItem('omnisales_followups');

      // The rows the clear removed stay on this screen for half a minute, so a mis-click can be
      // put back for the whole team
      if (history?.cleared?.length) {
        historyUndoDeadline.current = Date.now() + CLEAR_UNDO_WINDOW_MS;
        setClearedHistory(history.cleared);
        setHistoryUndoSeconds(Math.ceil(CLEAR_UNDO_WINDOW_MS / 1000));
      } else {
        setClearedHistory(null);
      }
      alert('The shared lead list, call history and follow-up queue were cleared for the whole team.');
    } catch (err) {
      alert(`The database was not cleared: ${err.message}`);
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
        requirementsAnswers={requirementAnswers.length}
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

          {activeTab === 'history' && (
            <HistoryLog
              callLogs={callLogs}
              currentUser={currentUser}
              onDeleteActivity={handleDeleteActivity}
              onRestoreActivity={handleRestoreActivity}
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
              clearedHistoryCount={clearedHistory ? clearedHistory.length : 0}
              historyUndoSeconds={historyUndoSeconds}
              restoringClearedHistory={restoringClearedHistory}
              onUndoClearHistory={handleUndoClearHistory}
            />
          )}
        </div>
      </main>

      <SetupChecklist open={setupOpen} onClose={() => setSetupOpen(false)} />

      {/* A customer answering the form an agent shared shows up here without a reload, and
          opening it is what marks the answers read */}
      {!requirementsOpen && requirementAnswers.length > 0 && (
        <button
          onClick={openRequirements}
          className="fixed bottom-4 right-4 z-40 max-w-xs text-left glass-strong border border-emerald-400/40 hover:border-emerald-400/70 p-3.5 shadow-2xl transition-colors"
        >
          <span className="flex items-center gap-2 text-emerald-500 dark:text-emerald-400">
            <BellRing className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {requirementAnswers.length} new requirement
              {requirementAnswers.length === 1 ? '' : 's'} answer{requirementAnswers.length === 1 ? '' : 's'}
            </span>
          </span>
          <span className="mt-1 block text-[12px] font-semibold text-[var(--text-primary)]">
            {requirementAnswers[0].company ||
              requirementAnswers[0].leadName ||
              requirementAnswers[0].leadEmail ||
              'A customer'}{' '}
            filled the{' '}
            {REQUIREMENT_FORMS[requirementAnswers[0].type]?.label || requirementAnswers[0].type} form
          </span>
          <span className="mt-0.5 block text-[11px] text-muted">Open Requirements to read the answers</span>
        </button>
      )}

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
        onRefresh={() => loadRequirements()}
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

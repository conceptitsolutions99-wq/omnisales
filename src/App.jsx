import React, { useState, useEffect } from 'react';
import { INITIAL_USERS } from './data/initialData';
import LoginModal from './components/LoginModal';
import Navbar from './components/Navbar';
import MainOverview from './components/MainOverview';
import LeadsGenerator from './components/LeadsGenerator';
import Dialler from './components/Dialler';
import Analytics from './components/Analytics';
import FollowUps from './components/FollowUps';
import AdminDashboard from './components/AdminDashboard';

export default function App() {
  // Load state from localStorage or fresh empty start
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('omnisales_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [activeTab, setActiveTab] = useState('dashboard');

  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('omnisales_theme');
    if (saved !== null) return JSON.parse(saved);
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [users, setUsers] = useState(() => {
    const saved = localStorage.getItem('omnisales_users');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map(u => {
          const defaultUser = INITIAL_USERS.find(iu => iu.email === u.email);
          return {
            ...u,
            password: u.password || (defaultUser ? defaultUser.password : 'sales123')
          };
        });
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

  // Sync with localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('omnisales_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('omnisales_user');
    }
  }, [currentUser]);

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

  const handleLogin = (user) => {
    setCurrentUser(user);
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
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

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <LoginModal users={users} onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogout={handleLogout}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && (
          <MainOverview
            leads={leads}
            callLogs={callLogs}
            followups={followups}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === 'leads' && (
          <LeadsGenerator
            leads={leads}
            setLeads={setLeads}
            setActiveTab={setActiveTab}
            onSelectLeadForCall={setSelectedLeadForCall}
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
      </main>
    </div>
  );
}

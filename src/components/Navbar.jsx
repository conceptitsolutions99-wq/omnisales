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
  Globe
} from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, currentUser, onLogout, darkMode, setDarkMode }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: true },
    { id: 'leads', label: 'Leads Generator', icon: Users, permission: currentUser.permissions.leads },
    { id: 'dialler', label: 'The Dialler', icon: PhoneCall, permission: currentUser.permissions.dialler },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, permission: currentUser.permissions.analytics },
    { id: 'followups', label: 'Follow-ups', icon: Clock, permission: currentUser.permissions.followups },
    { id: 'admin', label: 'Admin Control', icon: ShieldAlert, permission: currentUser.permissions.admin },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo & Region Indicator */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shadow-blue-500/20">
                OS
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white">OmniSales</span>
                <span className="text-xs ml-1.5 px-2 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-full font-semibold">IT Pro</span>
              </div>
            </div>

            <div className="hidden md:flex items-center space-x-1.5 pl-4 border-l border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Globe className="w-3.5 h-3.5 text-blue-500" />
              <span>Target: Canada & USA (Websites, Portals, Apps)</span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navItems.map((item) => {
              if (!item.permission) return null;
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Controls: Theme Switch & User Profile */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Toggle Theme"
            >
              {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
            </button>

            <div className="flex items-center space-x-3 pl-3 border-l border-slate-200 dark:border-slate-800">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{currentUser.name}</div>
                <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">{currentUser.role}</div>
              </div>
              <button
                onClick={onLogout}
                className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Mobile Navigation Bar */}
      <div className="lg:hidden flex items-center justify-around bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 px-2 py-2">
        {navItems.map((item) => {
          if (!item.permission) return null;
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center p-2 rounded-lg text-xs font-medium ${
                isActive ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5 mb-1" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
}

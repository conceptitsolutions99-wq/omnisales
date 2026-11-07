import React from 'react';
import {
  Users,
  PhoneCall,
  CheckCircle2,
  Clock,
  TrendingUp,
  DollarSign,
  Globe,
  ArrowRight,
  Laptop,
  Smartphone,
  Monitor,
  ShieldCheck
} from 'lucide-react';

export default function MainOverview({ leads, callLogs, followups, setActiveTab, onStartCall }) {
  const totalLeads = leads.length;
  const dealsCompleted = leads.filter(l => l.status === 'Deal Completed').length;
  const pendingFollowups = followups.filter(f => f.status !== 'Completed').length;
  const totalPipeline = leads.reduce((acc, l) => acc + (l.value || 0), 0);
  const wonPipeline = leads.filter(l => l.status === 'Deal Completed').reduce((acc, l) => acc + (l.value || 0), 0);

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-700 text-white p-8 shadow-xl">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 bg-white/10 rounded-full text-xs font-medium backdrop-blur-md mb-4 border border-white/20">
            <Globe className="w-3.5 h-3.5" />
            <span>Targeting Canada & USA Businesses (SMBs & Enterprises)</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            Outbound Sales & IT Solutions Command Center
          </h1>
          <p className="text-blue-100 text-base mb-6 leading-relaxed">
            Manage your leads generation, manual outbound dialer, conversion analytics, and customer follow-ups for Custom Websites, Web Portals, and Mobile Applications.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setActiveTab('dialler')}
              className="px-5 py-3 bg-white text-blue-600 font-semibold rounded-xl shadow-lg hover:bg-blue-50 transition-all flex items-center space-x-2"
            >
              <PhoneCall className="w-4 h-4" />
              <span>Launch The Dialler</span>
            </button>
            <button
              onClick={() => setActiveTab('leads')}
              className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl backdrop-blur-md border border-white/25 transition-all flex items-center space-x-2"
            >
              <Users className="w-4 h-4" />
              <span>Explore Leads Generator</span>
            </button>
          </div>
        </div>

        {/* Decorative background circles */}
        <div className="absolute right-0 top-0 -mt-12 -mr-12 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute right-32 bottom-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none"></div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Leads</p>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{totalLeads}</h3>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-2 inline-flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" /> Canada & USA Active
            </span>
          </div>
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/50 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Deals Completed</p>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{dealsCompleted}</h3>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-2 inline-flex items-center">
              <CheckCircle2 className="w-3 h-3 mr-1" /> ${wonPipeline.toLocaleString()} Won
            </span>
          </div>
          <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/50 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pending Follow-ups</p>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{pendingFollowups}</h3>
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-2 inline-flex items-center">
              <Clock className="w-3 h-3 mr-1" /> Action Required
            </span>
          </div>
          <div className="w-12 h-12 bg-amber-50 dark:bg-amber-950/50 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Pipeline Value</p>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">${totalPipeline.toLocaleString()}</h3>
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-2 inline-flex items-center">
              <DollarSign className="w-3 h-3 mr-0.5" /> IT Solutions Market
            </span>
          </div>
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Sub-Systems Quick Access */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center font-bold mb-4">
              1
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Leads Generator</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Generate and manage small, medium, and large business leads across Canada and USA with filters for phone numbers, regions, and IT solutions.
            </p>
          </div>
          <button
            onClick={() => setActiveTab('leads')}
            className="flex items-center justify-between w-full p-3 bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl font-medium text-sm transition-all"
          >
            <span>Open Leads Generator</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center font-bold mb-4">
              2
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">The Dialler</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Manual outbound calling interface. Choose when to call and end calls yourself with real-time outcome tracking (Considering, Completed, Denied).
            </p>
          </div>
          <button
            onClick={() => setActiveTab('dialler')}
            className="flex items-center justify-between w-full p-3 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl font-medium text-sm transition-all"
          >
            <span>Open The Dialler</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 rounded-xl flex items-center justify-center font-bold mb-4">
              3-5
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Analytics & Follow-ups</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Analyze call performance and manage customer follow-up queues such as wire transfers, scheduled callbacks, and admin user controls.
            </p>
          </div>
          <button
            onClick={() => setActiveTab('analytics')}
            className="flex items-center justify-between w-full p-3 bg-slate-50 dark:bg-slate-800 hover:bg-violet-50 dark:hover:bg-violet-950/40 text-slate-700 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-400 rounded-xl font-medium text-sm transition-all"
          >
            <span>Open Analytics & Follow-ups</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* IT Solutions Focus Area */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Supported IT Solutions Portfolio</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 flex items-start space-x-3">
            <div className="p-2.5 bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-lg">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white text-sm">Websites & E-Commerce</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">High-converting corporate sites and online stores for US & CA businesses.</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 flex items-start space-x-3">
            <div className="p-2.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white text-sm">Web Portals & Dashboards</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Custom client portals, logistics trackers, and secure enterprise software.</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 flex items-start space-x-3">
            <div className="p-2.5 bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 rounded-lg">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white text-sm">Mobile Applications</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Native iOS and Android mobile apps for customer engagement and operations.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

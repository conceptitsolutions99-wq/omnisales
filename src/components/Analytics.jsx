import React from 'react';
import {
  BarChart3,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  DollarSign,
  Award,
  Users,
  PieChart
} from 'lucide-react';

export default function Analytics({ leads, callLogs }) {
  const totalCalls = callLogs.length;
  const completedDeals = callLogs.filter(l => l.outcome === 'Deal Completed').length;
  const consideringCalls = callLogs.filter(l => l.outcome === 'Considering').length;
  const deniedCalls = callLogs.filter(l => l.outcome === 'Denied').length;
  const callbackCalls = callLogs.filter(l => l.outcome === 'Call Back Later').length;

  const conversionRate = totalCalls > 0 ? ((completedDeals / totalCalls) * 100).toFixed(1) : 0;
  const totalRevenueWon = leads.filter(l => l.status === 'Deal Completed').reduce((acc, l) => acc + (l.value || 0), 0);

  // Solution breakdown
  const solutionCounts = leads.reduce((acc, l) => {
    acc[l.solution] = (acc[l.solution] || 0) + 1;
    return acc;
  }, {});

  // Country breakdown
  const countryCounts = leads.reduce((acc, l) => {
    acc[l.country] = (acc[l.country] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center">
          <BarChart3 className="w-7 h-7 mr-2 text-violet-600" />
          Analytics & Information Sub-System
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Analyze outbound sales data, call outcomes (Considering, Deal Completed, Denied), and revenue performance.
        </p>
      </div>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Outbound Calls</p>
          <div className="flex items-baseline justify-between mt-2">
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{totalCalls}</h3>
            <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-full">Logged</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Conversion Rate</p>
          <div className="flex items-baseline justify-between mt-2">
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{conversionRate}%</h3>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" /> Success
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Deals Won Value</p>
          <div className="flex items-baseline justify-between mt-2">
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white">${totalRevenueWon.toLocaleString()}</h3>
            <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-full">USD/CAD</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Pipeline Leads</p>
          <div className="flex items-baseline justify-between mt-2">
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{leads.length}</h3>
            <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded-full">CA & USA</span>
          </div>
        </div>
      </div>

      {/* Call Outcomes Analysis Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Call Outcomes Distribution */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center">
            <PieChart className="w-5 h-5 mr-2 text-violet-600" />
            Call Outcome Analysis
          </h3>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="flex items-center text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Deal Completed</span>
                <span>{completedDeals} calls ({totalCalls ? Math.round((completedDeals/totalCalls)*100) : 0}%)</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${totalCalls ? (completedDeals/totalCalls)*100 : 0}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="flex items-center text-blue-600"><Clock className="w-3.5 h-3.5 mr-1" /> Considering</span>
                <span>{consideringCalls} calls ({totalCalls ? Math.round((consideringCalls/totalCalls)*100) : 0}%)</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${totalCalls ? (consideringCalls/totalCalls)*100 : 0}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="flex items-center text-amber-600"><Clock className="w-3.5 h-3.5 mr-1" /> Call Back Later</span>
                <span>{callbackCalls} calls ({totalCalls ? Math.round((callbackCalls/totalCalls)*100) : 0}%)</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full transition-all" style={{ width: `${totalCalls ? (callbackCalls/totalCalls)*100 : 0}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="flex items-center text-red-600"><XCircle className="w-3.5 h-3.5 mr-1" /> Denied</span>
                <span>{deniedCalls} calls ({totalCalls ? Math.round((deniedCalls/totalCalls)*100) : 0}%)</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden">
                <div className="bg-red-500 h-full rounded-full transition-all" style={{ width: `${totalCalls ? (deniedCalls/totalCalls)*100 : 0}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* IT Solution Interest Breakdown */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center">
            <Award className="w-5 h-5 mr-2 text-blue-600" />
            IT Solution Interest Breakdown
          </h3>

          <div className="space-y-4">
            {Object.entries(solutionCounts).map(([solution, count]) => (
              <div key={solution}>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-800 dark:text-slate-200">{solution}</span>
                  <span>{count} leads ({Math.round((count / leads.length) * 100)}%)</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full rounded-full" style={{ width: `${(count / leads.length) * 100}%` }}></div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span>Market Region Split:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              USA: {countryCounts['USA'] || 0} | Canada: {countryCounts['Canada'] || 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

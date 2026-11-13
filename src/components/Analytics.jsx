import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  Award,
  PieChart,
  Activity,
  Flame,
  CalendarDays,
  Mail
} from 'lucide-react';

/* ───────────────────────────  Helpers  ─────────────────────────── */

const CHART_W = 720;
const CHART_H = 190;
const PAD = { top: 14, right: 12, bottom: 22, left: 46 };

const dayLabel = (isoDate) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const compactMoney = (value) => {
  if (value >= 1000) return `$${Math.round(value / 1000)}k`;
  return `$${Math.round(value)}`;
};

const smoothPath = (points) =>
  points
    .map((point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;
      const prev = points[index - 1];
      const midX = (prev.x + point.x) / 2;
      return `C ${midX} ${prev.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
    })
    .join(' ');

const hourLabel = (hour) => {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
};

/* ───────────────────────────  Revenue trend  ─────────────────────────── */

function RevenueTrend({ days, won, added, wonTotal, addedTotal }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const count = days.length;

  const peak = Math.max(...won, ...added, 1);
  // Round the axis ceiling up to a readable step
  const step = peak > 50000 ? 25000 : peak > 20000 ? 10000 : peak > 5000 ? 5000 : 1000;
  const yMax = Math.max(Math.ceil(peak / step) * step, step);

  const xAt = (index) => PAD.left + (count <= 1 ? 0 : (index / (count - 1)) * plotW);
  const yAt = (value) => PAD.top + plotH - (value / yMax) * plotH;

  const wonPoints = won.map((value, index) => ({ x: xAt(index), y: yAt(value) }));
  const addedPoints = added.map((value, index) => ({ x: xAt(index), y: yAt(value) }));

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map(ratio => yMax * ratio);

  const hovered = hoverIndex !== null ? hoverIndex : null;
  const readoutDay = hovered !== null ? days[hovered] : days[days.length - 1];
  const readoutWon = hovered !== null ? won[hovered] : wonTotal;
  const readoutAdded = hovered !== null ? added[hovered] : addedTotal;

  const handleMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    // Map the pointer onto the padded plot area
    const usable = Math.min(Math.max((ratio * CHART_W - PAD.left) / plotW, 0), 1);
    setHoverIndex(Math.round(usable * (count - 1)));
  };

  return (
    <section className="glass p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h3 className="font-bold text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Revenue trend
            <span className="text-[11px] font-semibold text-muted">· last 30 days</span>
          </h3>
          <p className="text-[11px] text-muted mt-1">
            {hovered !== null ? `Reading ${dayLabel(readoutDay)}` : 'Closed revenue from call outcomes vs. new pipeline added'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold glass-soft">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Won
            <span className="tabular-nums text-muted">${readoutWon.toLocaleString()}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold glass-soft">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            Pipeline added
            <span className="tabular-nums text-muted">${readoutAdded.toLocaleString()}</span>
          </span>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="w-full overflow-visible"
          style={{ aspectRatio: `${CHART_W} / ${CHART_H}` }}
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
          role="img"
          aria-label="Daily won revenue and pipeline added over the last 30 days"
        >
          <defs>
            <linearGradient id="rev-won-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="rev-won-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>

          {/* Gridlines + axis labels */}
          {gridValues.map((value) => (
            <g key={value}>
              <line
                x1={PAD.left}
                x2={CHART_W - PAD.right}
                y1={yAt(value)}
                y2={yAt(value)}
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray={value === 0 ? '0' : '3 6'}
                className="text-[var(--text-secondary)]"
                opacity="0.22"
              />
              <text
                x={PAD.left - 10}
                y={yAt(value) + 3.5}
                textAnchor="end"
                className="fill-current text-[var(--text-secondary)]"
                fontSize="10"
                fontWeight="600"
                opacity="0.75"
              >
                {compactMoney(value)}
              </text>
            </g>
          ))}

          {/* Pipeline added (dashed) */}
          <path
            d={smoothPath(addedPoints)}
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1.8"
            strokeDasharray="5 5"
            strokeLinecap="round"
            opacity="0.85"
          />

          {/* Won revenue (area + line) */}
          <path
            d={`${smoothPath(wonPoints)} L ${xAt(count - 1)} ${PAD.top + plotH} L ${xAt(0)} ${PAD.top + plotH} Z`}
            fill="url(#rev-won-fill)"
          />
          <path
            d={smoothPath(wonPoints)}
            fill="none"
            stroke="url(#rev-won-line)"
            strokeWidth="2.6"
            strokeLinecap="round"
          />

          {/* Date ticks every ~6 days */}
          {days.map((day, index) =>
            index % 6 === 0 || index === count - 1 ? (
              <text
                key={day}
                x={xAt(index)}
                y={CHART_H - 6}
                textAnchor={index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle'}
                className="fill-current text-[var(--text-secondary)]"
                fontSize="10"
                fontWeight="600"
                opacity="0.7"
              >
                {dayLabel(day)}
              </text>
            ) : null
          )}

          {/* Hover guide */}
          {hovered !== null && (
            <g>
              <line
                x1={xAt(hovered)}
                x2={xAt(hovered)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="currentColor"
                strokeWidth="1"
                className="text-[var(--text-secondary)]"
                opacity="0.45"
              />
              <circle cx={xAt(hovered)} cy={yAt(added[hovered])} r="3.5" fill="#22d3ee" />
              <circle cx={xAt(hovered)} cy={yAt(won[hovered])} r="4.5" fill="#34d399" stroke="#05070f" strokeWidth="1.5" />
            </g>
          )}
        </svg>
      </div>

      <div className="mt-4 pt-4 border-t border-[var(--glass-border)] grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted font-bold">Won (30d)</div>
          <div className="text-sm font-bold tabular-nums mt-0.5">${wonTotal.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted font-bold">Best day</div>
          <div className="text-sm font-bold tabular-nums mt-0.5">
            {Math.max(...won) > 0 ? `$${Math.max(...won).toLocaleString()}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted font-bold">Pipeline added</div>
          <div className="text-sm font-bold tabular-nums mt-0.5">${addedTotal.toLocaleString()}</div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────  Hourly heat strip  ─────────────────────────── */

function HourlyHeatStrip({ hourly, totalCalls }) {
  const peak = Math.max(...hourly, 1);
  const peakHour = hourly.indexOf(Math.max(...hourly));
  const hasData = totalCalls > 0;

  return (
    <section className="glass p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-bold text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Calls by hour
          </h3>
          <p className="text-[11px] text-muted mt-1">When your outbound activity actually happens</p>
        </div>

        <div className="flex items-center gap-2">
          {hasData && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold glass-soft">
              <Flame className="w-3 h-3 text-amber-400" />
              Peak {hourLabel(peakHour)} · {Math.max(...hourly)} calls
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold glass-soft">
            <CalendarDays className="w-3 h-3 text-indigo-400" />
            {totalCalls} total
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-1 sm:gap-1.5">
        {hourly.map((count, hour) => {
          const ratio = count / peak;
          const tone = count === 0 ? 8 : Math.round(16 + ratio * 78);
          return (
            <div key={hour} className="flex flex-col items-center gap-1">
              <div
                title={`${hourLabel(hour)} — ${count} call${count === 1 ? '' : 's'}`}
                className="w-full h-10 sm:h-12 rounded-md border border-white/[0.07] transition-all duration-300 hover:scale-[1.08] hover:border-[var(--accent)]/50 cursor-default"
                style={{
                  background: `color-mix(in srgb, var(--accent) ${tone}%, transparent)`,
                  boxShadow: count === peak && hasData ? '0 0 0 1px color-mix(in srgb, var(--accent-2) 55%, transparent)' : 'none',
                }}
              />
              <span className={`text-[9px] font-semibold ${hour % 3 === 0 ? 'text-muted' : 'text-transparent'}`}>
                {hour % 3 === 0 ? hourLabel(hour) : '·'}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-[var(--glass-border)] flex items-center justify-between text-[10px] text-muted">
        <span>{hasData ? 'Darker cells mean more calls in that hour' : 'No calls logged yet — launch the dialler to populate this strip'}</span>
        <span className="flex items-center gap-1">
          less
          {[8, 30, 55, 80, 94].map(tone => (
            <span
              key={tone}
              className="w-3 h-3 rounded-sm border border-white/10"
              style={{ background: `color-mix(in srgb, var(--accent) ${tone}%, transparent)` }}
            />
          ))}
          more
        </span>
      </div>
    </section>
  );
}

/* ───────────────────────────  Screen  ─────────────────────────── */

export default function Analytics({ leads, callLogs, currentUser }) {
  // Role-based filtering: Admin sees all data, employees see only their own
  const isAdmin = currentUser.role === 'Admin' || currentUser.permissions.admin;

  const userInteractions = isAdmin ? callLogs : callLogs.filter(log => log.caller === currentUser.name);
  // Email sends live in the same history but are not calls, so keep them out of call metrics
  const userCallLogs = userInteractions.filter(log => log.channel !== 'Email');

  // Get lead IDs from user's call logs to determine which leads they've worked on
  const userLeadIds = new Set(userCallLogs.map(log => log.leadId));
  const userLeads = isAdmin ? leads : leads.filter(l => userLeadIds.has(l.id));

  const totalCalls = userCallLogs.length;
  const completedDeals = userCallLogs.filter(l => l.outcome === 'Deal Completed').length;
  const consideringCalls = userCallLogs.filter(l => l.outcome === 'Considering').length;
  const deniedCalls = userCallLogs.filter(l => l.outcome === 'Denied').length;
  const callbackCalls = userCallLogs.filter(l => l.outcome === 'Call Back Later').length;

  // Email sends are logged in the same history as calls but are their own channel
  const emailedCount = userInteractions.filter(log => (log.channel || 'Call') === 'Email').length;
  const totalOutreach = totalCalls + emailedCount;
  const shareOfOutreach = (count) => (totalOutreach ? Math.round((count / totalOutreach) * 100) : 0);

  const conversionRate = totalCalls > 0 ? ((completedDeals / totalCalls) * 100).toFixed(1) : 0;
  const totalRevenueWon = userLeads.filter(l => l.status === 'Deal Completed').reduce((acc, l) => acc + (l.value || 0), 0);

  // Solution breakdown
  const solutionCounts = userLeads.reduce((acc, l) => {
    acc[l.solution] = (acc[l.solution] || 0) + 1;
    return acc;
  }, {});

  // Country breakdown
  const countryCounts = userLeads.reduce((acc, l) => {
    acc[l.country] = (acc[l.country] || 0) + 1;
    return acc;
  }, {});

  // 30-day window, oldest first
  const days = useMemo(() => {
    const list = [];
    for (let i = 29; i >= 0; i -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      list.push(date.toISOString().split('T')[0]);
    }
    return list;
  }, []);

  const leadValues = useMemo(() => {
    const map = new Map();
    leads.forEach(lead => map.set(lead.id, lead.value || 0));
    return map;
  }, [leads]);

  const { wonSeries, addedSeries } = useMemo(() => {
    const won = days.map(day =>
      userCallLogs
        .filter(log => log.outcome === 'Deal Completed' && (log.timestamp || '').startsWith(day))
        .reduce((sum, log) => sum + (leadValues.get(log.leadId) || 0), 0)
    );

    const added = days.map(day =>
      userLeads
        .filter(lead => lead.createdAt === day)
        .reduce((sum, lead) => sum + (lead.value || 0), 0)
    );

    return { wonSeries: won, addedSeries: added };
  }, [days, userCallLogs, userLeads, leadValues]);

  const wonTotal = wonSeries.reduce((sum, value) => sum + value, 0);
  const addedTotal = addedSeries.reduce((sum, value) => sum + value, 0);

  // Hourly distribution from call timestamps ("YYYY-MM-DD HH:mm")
  const hourly = useMemo(() => {
    const buckets = new Array(24).fill(0);
    userCallLogs.forEach(log => {
      const hour = Number((log.timestamp || '').slice(11, 13));
      if (Number.isInteger(hour) && hour >= 0 && hour < 24) buckets[hour] += 1;
    });
    return buckets;
  }, [userCallLogs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center">
          <BarChart3 className="w-7 h-7 mr-2 text-violet-600" />
          Analytics & Information Sub-System ({isAdmin ? 'All Company Data' : 'My Performance'})
        </h1>
        <p className="text-sm text-muted mt-1">
          {isAdmin
            ? 'Admin View: Company-wide outbound sales data, call outcomes (Considering, Deal Completed, Denied), and revenue performance.'
            : `Personal View: Your individual sales performance and call analytics. Logged in as ${currentUser.name}.`}
        </p>
      </div>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Total Outbound Calls</p>
          <div className="flex items-baseline justify-between mt-2">
            <h3 className="text-3xl font-bold text-[var(--text-primary)]">{totalCalls}</h3>
            <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-full">Logged</span>
          </div>
        </div>

        <div className="glass p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Conversion Rate</p>
          <div className="flex items-baseline justify-between mt-2">
            <h3 className="text-3xl font-bold text-[var(--text-primary)]">{conversionRate}%</h3>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" /> Success
            </span>
          </div>
        </div>

        <div className="glass p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Deals Won Value</p>
          <div className="flex items-baseline justify-between mt-2">
            <h3 className="text-3xl font-bold text-[var(--text-primary)]">${totalRevenueWon.toLocaleString()}</h3>
            <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-full">USD/CAD</span>
          </div>
        </div>

        <div className="glass p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Active Pipeline Leads</p>
          <div className="flex items-baseline justify-between mt-2">
            <h3 className="text-3xl font-bold text-[var(--text-primary)]">{leads.length}</h3>
            <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded-full">CA & USA</span>
          </div>
        </div>
      </div>

      {/* Revenue trend over 30 days */}
      <RevenueTrend
        days={days}
        won={wonSeries}
        added={addedSeries}
        wonTotal={wonTotal}
        addedTotal={addedTotal}
      />

      {/* Calls by hour heat strip */}
      <HourlyHeatStrip hourly={hourly} totalCalls={totalCalls} />

      {/* Call Outcomes Analysis Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Call Outcomes Distribution */}
        <div className="glass p-6 space-y-5">
          <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center">
            <PieChart className="w-5 h-5 mr-2 text-violet-600" />
            Outcome & Channel Analysis
          </h3>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="flex items-center text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Deal Completed</span>
                <span>{completedDeals} calls ({totalOutreach ? Math.round((completedDeals/totalOutreach)*100) : 0}%)</span>
              </div>
              <div className="w-full track h-3 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${totalOutreach ? (completedDeals/totalOutreach)*100 : 0}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="flex items-center text-blue-600"><Clock className="w-3.5 h-3.5 mr-1" /> Considering</span>
                <span>{consideringCalls} calls ({totalOutreach ? Math.round((consideringCalls/totalOutreach)*100) : 0}%)</span>
              </div>
              <div className="w-full track h-3 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${totalOutreach ? (consideringCalls/totalOutreach)*100 : 0}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="flex items-center text-amber-600"><Clock className="w-3.5 h-3.5 mr-1" /> Call Back Later</span>
                <span>{callbackCalls} calls ({totalOutreach ? Math.round((callbackCalls/totalOutreach)*100) : 0}%)</span>
              </div>
              <div className="w-full track h-3 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full transition-all" style={{ width: `${totalOutreach ? (callbackCalls/totalOutreach)*100 : 0}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="flex items-center text-red-600"><XCircle className="w-3.5 h-3.5 mr-1" /> Denied</span>
                <span>{deniedCalls} calls ({totalOutreach ? Math.round((deniedCalls/totalOutreach)*100) : 0}%)</span>
              </div>
              <div className="w-full track h-3 rounded-full overflow-hidden">
                <div className="bg-red-500 h-full rounded-full transition-all" style={{ width: `${totalOutreach ? (deniedCalls/totalOutreach)*100 : 0}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="flex items-center text-indigo-600 dark:text-indigo-400"><Mail className="w-3.5 h-3.5 mr-1" /> Emailed</span>
                <span>{emailedCount} emails ({shareOfOutreach(emailedCount)}%)</span>
              </div>
              <div className="w-full track h-3 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full rounded-full transition-all" style={{ width: `${shareOfOutreach(emailedCount)}%` }}></div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--glass-border)] flex items-center justify-between text-[11px] text-muted">
            <span>Across {totalCalls} calls and {emailedCount} emails</span>
            <span className="font-semibold text-[var(--text-primary)]">{totalOutreach} interactions</span>
          </div>
        </div>

        {/* IT Solution Interest Breakdown */}
        <div className="glass p-6 space-y-5">
          <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center">
            <Award className="w-5 h-5 mr-2 text-blue-600" />
            IT Solution Interest Breakdown
          </h3>

          <div className="space-y-4">
            {Object.entries(solutionCounts).map(([solution, count]) => (
              <div key={solution}>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-[var(--text-primary)]">{solution}</span>
                  <span>{count} leads ({Math.round((count / leads.length) * 100)}%)</span>
                </div>
                <div className="w-full track h-3 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full rounded-full" style={{ width: `${(count / leads.length) * 100}%` }}></div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-[var(--glass-border)] flex items-center justify-between text-xs text-muted">
            <span>Market Region Split:</span>
            <span className="font-semibold text-[var(--text-primary)]">
              USA: {countryCounts['USA'] || 0} | Canada: {countryCounts['Canada'] || 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

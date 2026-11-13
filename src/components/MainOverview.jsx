import React, { useEffect, useRef, useState } from 'react';
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
  Activity,
  Zap,
  PhoneOutgoing,
  Radar
} from 'lucide-react';

/* ───────────────────────────  Dynamic primitives  ─────────────────────────── */

function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const delta = target - from;
    let raf;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + delta * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

function Stat({ value, prefix = '', suffix = '' }) {
  const animated = useCountUp(value);
  return (
    <span className="tabular-nums">
      {prefix}
      {Math.round(animated).toLocaleString()}
      {suffix}
    </span>
  );
}

function Sparkline({ points, stroke, id }) {
  const width = 180;
  const height = 56;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;

  const coords = points.map((value, index) => ({
    x: (index / Math.max(points.length - 1, 1)) * width,
    y: height - ((value - min) / span) * (height - 10) - 5,
  }));

  const line = coords
    .map((point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;
      const prev = coords[index - 1];
      const midX = (prev.x + point.x) / 2;
      return `C ${midX} ${prev.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
    })
    .join(' ');

  const area = `${line} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-12 overflow-visible" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.38" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#fill-${id})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      {coords.length > 0 && (
        <circle
          cx={coords[coords.length - 1].x}
          cy={coords[coords.length - 1].y}
          r="3.4"
          fill={stroke}
        />
      )}
    </svg>
  );
}

function Donut({ value, size = 132, label }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const animated = useCountUp(value, 1100);
  const offset = circumference - (Math.min(animated, 100) / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 132 132" className="w-full h-full -rotate-90">
        <defs>
          <linearGradient id="donut-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        <circle cx="66" cy="66" r={radius} fill="none" strokeWidth="12" className="stroke-current opacity-10" />
        <circle
          cx="66"
          cy="66"
          r={radius}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          stroke="url(#donut-grad)"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.3s linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{Math.round(animated)}%</span>
        <span className="text-[10px] uppercase tracking-widest text-muted font-semibold">{label}</span>
      </div>
    </div>
  );
}

const lastSevenDays = () => {
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    days.push(date.toISOString().split('T')[0]);
  }
  return days;
};

const outcomeTone = (outcome) => {
  if (outcome === 'Deal Completed') return 'text-emerald-400 bg-emerald-400/15 border-emerald-400/30';
  if (outcome === 'Considering') return 'text-sky-400 bg-sky-400/15 border-sky-400/30';
  if (outcome === 'Call Back Later') return 'text-amber-400 bg-amber-400/15 border-amber-400/30';
  if (outcome === 'Emailed') return 'text-indigo-400 bg-indigo-400/15 border-indigo-400/30';
  if (outcome === 'No Answer') return 'text-slate-400 bg-slate-400/15 border-slate-400/30';
  return 'text-rose-400 bg-rose-400/15 border-rose-400/30';
};

/* ───────────────────────────  Dashboard  ─────────────────────────── */

export default function MainOverview({ leads, callLogs, followups, setActiveTab, currentUser }) {
  const isAdmin = currentUser.role === 'Admin' || currentUser.permissions.admin;

  const userCallLogs = isAdmin ? callLogs : callLogs.filter(log => log.caller === currentUser.name);
  const userFollowups = isAdmin ? followups : followups.filter(f => f.assignedTo === currentUser.name);

  const userLeadIds = new Set(userCallLogs.map(log => log.leadId));
  const userLeads = isAdmin ? leads : leads.filter(l => userLeadIds.has(l.id));

  const totalLeads = userLeads.length;
  const dealsCompleted = userLeads.filter(l => l.status === 'Deal Completed').length;
  const pendingFollowups = userFollowups.filter(f => f.status !== 'Completed').length;
  const totalPipeline = userLeads.reduce((acc, l) => acc + (l.value || 0), 0);
  const wonPipeline = userLeads.filter(l => l.status === 'Deal Completed').reduce((acc, l) => acc + (l.value || 0), 0);
  const conversionRate = userLeads.length ? (dealsCompleted / userLeads.length) * 100 : 0;

  // Seven-day call + lead velocity, derived from real records
  const days = lastSevenDays();
  const callSeries = days.map(day => userCallLogs.filter(log => (log.timestamp || '').startsWith(day)).length);
  const leadSeries = days.map(day => userLeads.filter(lead => lead.createdAt === day).length);

  const pipelineStages = ['New', 'Contacted', 'Qualified', 'Considering', 'Deal Completed', 'Denied'].map(status => ({
    status,
    count: userLeads.filter(lead => lead.status === status).length,
  }));
  const maxStage = Math.max(...pipelineStages.map(stage => stage.count), 1);

  const recentActivity = userCallLogs.slice(0, 4);

  const stats = [
    {
      label: 'Total Leads',
      value: totalLeads,
      icon: Users,
      tint: 'from-indigo-500 to-violet-500',
      hint: 'Canada & USA active',
      series: leadSeries,
      stroke: '#818cf8',
    },
    {
      label: 'Deals Completed',
      value: dealsCompleted,
      icon: CheckCircle2,
      tint: 'from-emerald-400 to-teal-500',
      hint: `$${wonPipeline.toLocaleString()} won`,
      series: callSeries,
      stroke: '#34d399',
    },
    {
      label: 'Pending Follow-ups',
      value: pendingFollowups,
      icon: Clock,
      tint: 'from-amber-400 to-orange-500',
      hint: 'Action required',
      series: callSeries,
      stroke: '#fbbf24',
    },
    {
      label: 'Pipeline Value',
      value: totalPipeline,
      prefix: '$',
      icon: DollarSign,
      tint: 'from-cyan-400 to-sky-500',
      hint: 'IT solutions market',
      series: leadSeries,
      stroke: '#22d3ee',
    },
  ];

  const handleHeroMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  return (
    <div className="space-y-5 sm:space-y-6">

      {/* ── Hero ── */}
      <section
        onMouseMove={handleHeroMove}
        className="hero-glass rise relative overflow-hidden glass-strong p-6 sm:p-9"
      >
        <div className="sheen" />
        <div className="absolute -top-24 -right-16 w-[26rem] h-[26rem] rounded-full bg-indigo-500/25 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 left-1/3 w-80 h-80 rounded-full bg-cyan-400/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold glass-soft mb-4">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-muted">Live workspace</span>
              <span className="text-muted/40">·</span>
              <Globe className="w-3 h-3 text-cyan-400" />
              <span className="text-muted">North America</span>
            </div>

            <h1 className="text-2xl sm:text-[2.1rem] font-extrabold tracking-tight leading-[1.15]">
              Outbound Command Center
              <span className="block accent-text text-lg sm:text-xl font-bold mt-1.5">
                {isAdmin ? 'Admin view · all company data' : `Personal view · ${currentUser.name}`}
              </span>
            </h1>

            <p className="text-[13px] sm:text-sm text-muted mt-3 max-w-xl leading-relaxed">
              {isAdmin
                ? 'Company-wide lead generation, dialler operations, conversion analytics and customer follow-ups for custom websites, web portals and mobile applications.'
                : 'Your personal leads, calls, conversion analytics and follow-ups for custom websites, web portals and mobile applications.'}
            </p>

            <div className="flex flex-wrap gap-2.5 mt-6">
              <button
                onClick={() => setActiveTab('dialler')}
                className="group px-5 py-2.5 rounded-xl text-white font-semibold text-sm bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5 transition-all flex items-center gap-2"
              >
                <PhoneCall className="w-4 h-4" />
                Launch dialler
                <ArrowRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={() => setActiveTab('leads')}
                className="px-5 py-2.5 rounded-xl font-semibold text-sm glass-soft hover:border-[var(--accent)]/45 hover:-translate-y-0.5 transition-all flex items-center gap-2"
              >
                <Radar className="w-4 h-4 text-cyan-400" />
                Leads generator
              </button>
            </div>
          </div>

          {/* Live conversion gauge */}
          <div className="glass-soft p-5 flex items-center gap-5 lg:flex-col lg:text-center">
            <Donut value={conversionRate} label="Conversion" />
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-widest text-muted font-bold">Win rate</div>
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-sm">
                <TrendingUp className="w-4 h-4" />
                {dealsCompleted} closed
              </div>
              <div className="text-[11px] text-muted">{userCallLogs.length} touchpoints logged</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── KPI grid ── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <article
              key={stat.label}
              className="glass glass-hover p-5 rise overflow-hidden"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted truncate">{stat.label}</p>
                  <h3 className="text-[1.75rem] font-extrabold mt-1.5 leading-none">
                    <Stat value={stat.value} prefix={stat.prefix || ''} />
                  </h3>
                  <p className="text-[11px] font-semibold text-muted mt-2 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {stat.hint}
                  </p>
                </div>
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.tint} text-white flex items-center justify-center shadow-lg shrink-0`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-1 -mx-1">
                <Sparkline points={stat.series} stroke={stat.stroke} id={stat.label.replace(/\s+/g, '-')} />
              </div>
            </article>
          );
        })}
      </section>

      {/* ── Pipeline + activity ── */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5">
        <div className="xl:col-span-2 glass p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              Pipeline distribution
            </h3>
            <span className="text-[11px] font-semibold text-muted">{totalLeads} leads tracked</span>
          </div>

          <div className="space-y-3.5">
            {pipelineStages.map((stage, index) => {
              const width = (stage.count / maxStage) * 100;
              return (
                <div key={stage.status} className="group">
                  <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                    <span className="text-muted group-hover:text-[var(--text-primary)] transition-colors">{stage.status}</span>
                    <span className="tabular-nums">{stage.count}</span>
                  </div>
                  <div className="track h-2.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 grow-x"
                      style={{ width: `${Math.max(width, stage.count ? 4 : 0)}%`, animationDelay: `${index * 90}ms` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass p-5 sm:p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Recent activity
            </h3>
            <button
              onClick={() => setActiveTab('analytics')}
              className="text-[11px] font-semibold text-muted hover:text-[var(--text-primary)] transition-colors"
            >
              View all
            </button>
          </div>

          {recentActivity.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 gap-2">
              <PhoneOutgoing className="w-8 h-8 text-muted opacity-40" />
              <p className="text-xs text-muted max-w-[15rem]">
                No calls logged yet. Launch the dialler to start your first outbound conversation.
              </p>
            </div>
          ) : (
            <ul className="space-y-3 flex-1">
              {recentActivity.map(log => (
                <li key={log.id} className="flex items-start gap-3">
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${outcomeTone(log.outcome).split(' ')[1].replace('/15', '')}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold truncate">{log.leadName}</span>
                      <span className="text-[10px] text-muted whitespace-nowrap font-mono">{log.duration}</span>
                    </div>
                    <div className="text-[11px] text-muted truncate">{log.company}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${outcomeTone(log.outcome)}`}>
                        {log.outcome}
                      </span>
                      <span className="text-[10px] text-muted">{log.timestamp}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Sub-systems ── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {[
          {
            step: '01',
            title: 'Leads Generator',
            body: 'Build and filter SMB and enterprise prospects across Canada and the USA by phone, region, business size and IT solution.',
            action: 'leads',
            cta: 'Open leads generator',
            tint: 'from-indigo-500 to-blue-500',
            Icon: Users,
          },
          {
            step: '02',
            title: 'The Dialler',
            body: 'Manual outbound calling with a live timer, device and WhatsApp channels, plus instant outcome logging.',
            action: 'dialler',
            cta: 'Open the dialler',
            tint: 'from-emerald-400 to-teal-500',
            Icon: PhoneCall,
          },
          {
            step: '03',
            title: 'Analytics & Follow-ups',
            body: 'Track call outcomes and revenue, then clear the follow-up queue for wire transfers, callbacks and quote reviews.',
            action: 'analytics',
            cta: 'Open analytics',
            tint: 'from-violet-500 to-fuchsia-500',
            Icon: Activity,
          },
        ].map((card, index) => (
          <article
            key={card.title}
            className="glass glass-hover p-5 sm:p-6 flex flex-col justify-between rise"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.tint} text-white flex items-center justify-center shadow-lg`}>
                  <card.Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-black tracking-widest text-muted opacity-60">{card.step}</span>
              </div>
              <h3 className="font-bold text-[15px] mb-1.5">{card.title}</h3>
              <p className="text-xs text-muted leading-relaxed mb-5">{card.body}</p>
            </div>
            <button
              onClick={() => setActiveTab(card.action)}
              className="group flex items-center justify-between w-full px-3.5 py-2.5 glass-soft hover:border-[var(--accent)]/45 rounded-xl font-semibold text-xs transition-all"
            >
              <span>{card.cta}</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-1 transition-transform" />
            </button>
          </article>
        ))}
      </section>

      {/* ── Portfolio ── */}
      <section className="glass p-5 sm:p-6">
        <h3 className="font-bold text-base mb-4">Supported IT solutions portfolio</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {[
            { Icon: Monitor, title: 'Websites & E-Commerce', copy: 'High-converting corporate sites and online stores for US & CA businesses.', tint: 'text-blue-400' },
            { Icon: Laptop, title: 'Web Portals & Dashboards', copy: 'Custom client portals, logistics trackers and secure enterprise software.', tint: 'text-indigo-400' },
            { Icon: Smartphone, title: 'Mobile Applications', copy: 'Native iOS and Android apps for customer engagement and operations.', tint: 'text-fuchsia-400' },
          ].map(item => (
            <div key={item.title} className="p-4 glass-soft flex items-start gap-3 hover:border-[var(--accent)]/35 transition-colors">
              <div className={`w-9 h-9 rounded-lg glass-soft flex items-center justify-center ${item.tint} shrink-0`}>
                <item.Icon className="w-[18px] h-[18px]" />
              </div>
              <div>
                <h4 className="font-semibold text-[13px]">{item.title}</h4>
                <p className="text-[11px] text-muted mt-1 leading-relaxed">{item.copy}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

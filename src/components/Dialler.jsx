import React, { useState, useEffect } from 'react';
import {
  PhoneCall,
  PhoneOff,
  Clock,
  Building2,
  Globe,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  UserCheck,
  Send,
  History,
  PhoneForwarded,
  MessageSquare,
  Mail,
  Copy,
  Check,
  AtSign
} from 'lucide-react';

const SIGNATURE_SERVICE_LINE = 'Websites · Web Portals · Mobile Apps';

// One signature block, applied to every template
const buildSignature = (agent = {}) =>
  [
    'Best regards,',
    agent.name || 'Concept IT Solutions Team',
    agent.role || 'Sales Agent',
    `Concept IT Solutions — ${SIGNATURE_SERVICE_LINE}`,
  ].join('\n');

// Selectable outreach templates for the email compose window
const EMAIL_TEMPLATES = [
  {
    id: 'intro',
    label: 'Introduction',
    hint: 'First touch',
    icon: Mail,
    build: (lead, agent) => {
      const firstName = (lead?.name || 'there').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || 'there';
      const solution = (lead?.solution || 'website').toLowerCase();
      const company = lead?.company || 'your business';

      return {
        subject: `A faster ${solution} for ${company}`,
        body: [
          `Hi ${firstName},`,
          '',
          `I'm ${agent.name} from Concept IT Solutions — we build ${solution}s, web portals and mobile apps for businesses across Canada and the USA.`,
          '',
          `I had a quick idea for ${company}: a modern ${solution} that brings in qualified inbound leads and removes some of the manual work your team does today.`,
          '',
          'Would you be open to a 10-minute walkthrough of a tailored prototype next week?',
        ].join('\n'),
      };
    },
  },
  {
    id: 'followup',
    label: 'Follow-up',
    hint: 'Second touch',
    icon: History,
    build: (lead, agent) => {
      const firstName = (lead?.name || 'there').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || 'there';
      const solution = (lead?.solution || 'website').toLowerCase();
      const company = lead?.company || 'your business';

      return {
        subject: `Following up — ${solution} for ${company}`,
        body: [
          `Hi ${firstName},`,
          '',
          `I wanted to follow up on my note about ${company}'s ${solution}. In the last few months we've shipped similar builds for ${lead?.country || 'North American'} businesses, and the wins came down to three things:`,
          '',
          '- faster performance for customers',
          '- fewer manual steps for your team',
          '- more qualified inbound enquiries',
          '',
          'Is next week better for a short 10-minute walkthrough? If someone else on your team owns this, I’m happy to be pointed their way.',
        ].join('\n'),
      };
    },
  },
  {
    id: 'quote',
    label: 'Quote',
    hint: 'Pricing',
    icon: FileText,
    build: (lead, agent) => {
      const firstName = (lead?.name || 'there').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || 'there';
      const solution = (lead?.solution || 'website').toLowerCase();
      const company = lead?.company || 'your business';
      const value = Number(lead?.value) || 0;
      const deposit = Math.round(value * 0.4);

      return {
        subject: `${company} — ${solution} estimate`,
        body: [
          `Hi ${firstName},`,
          '',
          `Thanks for the conversation about ${company}. Here is the estimate we discussed:`,
          '',
          `- Scope: a custom ${solution}`,
          value ? `- Estimated investment: $${value.toLocaleString()}` : '- Estimated investment: to be scoped after the discovery call',
          value ? `- Deposit to start: $${deposit.toLocaleString()} (40%)` : '- Payment terms: 40% to start, balance on launch',
          '- Delivery window: 4–6 weeks from sign-off',
          '- Included: design, build, launch support and 30 days of post-launch fixes',
          '',
          'This quote is valid for 30 days, and I’ll revise it with you if the scope shifts before any work starts.',
          '',
          'Happy to walk through the breakdown on a short call.',
        ].join('\n'),
      };
    },
  },
];

export default function Dialler({
  leads,
  setLeads,
  callLogs,
  setCallLogs,
  followups,
  setFollowups,
  selectedLeadForCall,
  currentUser
}) {
  const [activeLead, setActiveLead] = useState(selectedLeadForCall || leads[0] || null);
  const [isCalling, setIsCalling] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callNotes, setCallNotes] = useState('');
  const [callOutcome, setCallOutcome] = useState('Considering');
  const [showOutcomeModal, setShowOutcomeModal] = useState(false);
  const [callHistorySearch, setCallHistorySearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('All');

  // Email channel
  const [showEmailCompose, setShowEmailCompose] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailCopied, setEmailCopied] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailLog, setEmailLog] = useState([]);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [emailSender, setEmailSender] = useState('');
  const [emailTemplate, setEmailTemplate] = useState('intro');

  // Timer effect
  useEffect(() => {
    let interval = null;
    if (isCalling) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isCalling]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartCall = () => {
    if (!activeLead) return;
    setIsCalling(true);
    setCallDuration(0);

    // Trigger device calling via the tel: protocol
    const cleanPhone = (activeLead.phone || '').replace(/[^+\d]/g, '');
    try {
      window.location.href = `tel:${cleanPhone}`;
    } catch (err) {
      console.log('Device call protocol note:', err);
    }
  };

  const handleWhatsAppCall = () => {
    if (!activeLead) return;
    const cleanPhone = (activeLead.phone || '').replace(/[^\d]/g, '');
    const message = `Hello ${activeLead.name}, calling from Concept IT Solutions regarding our IT solutions.`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  // Build a ready-to-send outreach draft from the active lead and a template
  const buildEmailDraft = (lead, templateId = 'intro') => {
    const template = EMAIL_TEMPLATES.find(item => item.id === templateId) || EMAIL_TEMPLATES[0];
    const draft = template.build(lead, currentUser);
    return { subject: draft.subject, body: `${draft.body}\n\n${buildSignature(currentUser)}` };
  };

  const applyEmailTemplate = (templateId) => {
    const draft = buildEmailDraft(activeLead, templateId);
    setEmailTemplate(templateId);
    setEmailSubject(draft.subject);
    setEmailBody(draft.body);
    setEmailStatus(null);
  };

  const handleOpenEmailCompose = () => {
    if (!activeLead) return;
    setEmailTo(activeLead.email || '');
    setEmailCopied(false);
    applyEmailTemplate('intro');
    setShowEmailCompose(true);
  };

  const fetchEmailLog = async () => {
    try {
      const response = await fetch('/api/emails');
      if (!response.ok) throw new Error(`Log unavailable (${response.status})`);
      const data = await response.json();
      setEmailLog(Array.isArray(data.emails) ? data.emails : []);
      setEmailConfigured(data.configured !== false);
      setEmailSender(data.sender || '');
    } catch (err) {
      setEmailLog([]);
    }
  };

  useEffect(() => {
    fetchEmailLog();
  }, []);

  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!emailTo.trim() || emailSending) return;

    setEmailSending(true);
    setEmailStatus(null);

    try {
      const response = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailTo.trim(),
          subject: emailSubject,
          body: emailBody,
          leadId: activeLead?.id ?? null,
          leadName: activeLead?.name || '',
          company: activeLead?.company || '',
          sentBy: currentUser.name
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Sending failed (${response.status}).`);

      setEmailStatus({
        type: 'success',
        message: `Email sent to ${emailTo.trim()}${data.email?.providerId ? ` · id ${data.email.providerId}` : ''}`
      });

      // Record the send in the shared outreach history
      const now = new Date();
      const timestampStr = `${now.toISOString().split('T')[0]} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const emailLogEntry = {
        id: Date.now(),
        channel: 'Email',
        leadId: activeLead?.id ?? null,
        leadName: activeLead?.name || emailTo.trim(),
        company: activeLead?.company || '—',
        phone: activeLead?.displayPhone || activeLead?.phone || emailTo.trim(),
        email: emailTo.trim(),
        caller: currentUser.name,
        outcome: 'Emailed',
        duration: '—',
        timestamp: timestampStr,
        notes: `Subject: ${emailSubject}`,
        providerId: data.email?.providerId || null
      };
      setCallLogs([emailLogEntry, ...callLogs]);

      fetchEmailLog();
    } catch (err) {
      setEmailStatus({
        type: 'error',
        message:
          err.message === 'Failed to fetch'
            ? 'Cannot reach the mail server. Start it with “npm start” and set GMAIL_APP_PASSWORD in .env.'
            : err.message
      });
    } finally {
      setEmailSending(false);
    }
  };

  const handleCopyEmail = async () => {
    const text = `To: ${emailTo}\nSubject: ${emailSubject}\n\n${emailBody}`;
    try {
      await navigator.clipboard.writeText(text);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    } catch (err) {
      console.log('Clipboard unavailable:', err);
    }
  };

  const handleEndCallClick = () => {
    setIsCalling(false);
    setShowOutcomeModal(true);
  };

  const handleSaveCallOutcome = (e) => {
    e.preventDefault();
    if (!activeLead) return;

    // Format duration string
    const mins = Math.floor(callDuration / 60);
    const secs = callDuration % 60;
    const durationStr = `${mins}m ${secs}s`;

    const now = new Date();
    const timestampStr = `${now.toISOString().split('T')[0]} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    // Create call log entry
    const newLog = {
      id: Date.now(),
      channel: 'Call',
      leadId: activeLead.id,
      leadName: activeLead.name,
      company: activeLead.company,
      phone: activeLead.displayPhone || activeLead.phone,
      caller: currentUser.name,
      outcome: callOutcome,
      duration: durationStr,
      timestamp: timestampStr,
      notes: callNotes || 'No specific notes recorded.'
    };

    setCallLogs([newLog, ...callLogs]);

    // Update lead status
    const updatedLeads = leads.map(l => {
      if (l.id === activeLead.id) {
        return { ...l, status: callOutcome };
      }
      return l;
    });
    setLeads(updatedLeads);

    // If Deal Completed or Call Back, create follow up task automatically
    if (callOutcome === 'Deal Completed' || callOutcome === 'Call Back Later') {
      const newFollowup = {
        id: Date.now() + 1,
        leadId: activeLead.id,
        leadName: activeLead.name,
        company: activeLead.company,
        phone: activeLead.displayPhone || activeLead.phone,
        type: callOutcome === 'Deal Completed' ? 'Payment Transfer' : 'Call Back',
        status: callOutcome === 'Deal Completed' ? 'Pending Transfer' : 'Scheduled',
        scheduledDate: new Date(Date.now() + 86400000 * 2).toISOString().replace('T', ' ').substring(0, 16),
        assignedTo: currentUser.name,
        notes: callNotes || (callOutcome === 'Deal Completed' ? 'Awaiting initial funds transfer.' : 'Requested call back.'),
        value: activeLead.value
      };
      setFollowups([newFollowup, ...followups]);
    }

    // Reset dialer modal
    setShowOutcomeModal(false);
    setCallNotes('');
    setCallDuration(0);
  };

  // Role-based filtering for call logs: Admin sees all, employees see only their own calls
  const filteredLogs = callLogs.filter(log => {
    const isAdmin = currentUser.role === 'Admin' || currentUser.permissions.admin;
    const isUserCaller = log.caller === currentUser.name;
    const matchesPermission = isAdmin || isUserCaller;
    const matchesSearch = log.leadName.toLowerCase().includes(callHistorySearch.toLowerCase()) ||
                          log.company.toLowerCase().includes(callHistorySearch.toLowerCase()) ||
                          log.caller.toLowerCase().includes(callHistorySearch.toLowerCase()) ||
                          log.outcome.toLowerCase().includes(callHistorySearch.toLowerCase()) ||
                          (log.channel || 'Call').toLowerCase().includes(callHistorySearch.toLowerCase()) ||
                          (log.notes || '').toLowerCase().includes(callHistorySearch.toLowerCase());
    const channel = log.channel || 'Call';
    const matchesChannel =
      channelFilter === 'All' ||
      (channelFilter === 'Emails' ? channel === 'Email' : channel !== 'Email');
    return matchesPermission && matchesSearch && matchesChannel;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center">
          <PhoneCall className="w-7 h-7 mr-2 text-emerald-600" />
          The Dialler Sub-System
        </h1>
        <p className="text-sm text-muted mt-1">
          Call from your device (Windows Phone Link, WhatsApp or your mobile carrier) with a full call timer and outcome logging — or send a ready-written email draft straight from your own mail app.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Lead Selector & Calling Console */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-emerald-50 dark:bg-emerald-950/50 px-4 py-2 rounded-bl-2xl border-l border-b border-emerald-100 dark:border-emerald-900 text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-1.5"></span>
              Live channels · call &amp; email
            </div>

            <div className="mb-6">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                Select Lead to Call
              </label>
              <select
                disabled={isCalling}
                value={activeLead?.id || ''}
                onChange={(e) => {
                  const lead = leads.find(l => l.id === Number(e.target.value));
                  if (lead) setActiveLead(lead);
                }}
                className="w-full p-3 glass-input rounded-xl text-sm font-medium dark:text-white disabled:opacity-50"
              >
                {leads.length === 0 ? (
                  <option value="">No leads available. Go to Leads Generator to add leads.</option>
                ) : (
                  leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.name} — {lead.company} ({lead.country} • {lead.solution})
                    </option>
                  ))
                )}
              </select>
            </div>

            {activeLead && (
              <div className="glass-soft p-5 mb-6 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">{activeLead.name}</h3>
                    <div className="text-xs text-muted flex items-center mt-0.5">
                      <Building2 className="w-3.5 h-3.5 mr-1 text-muted" /> {activeLead.company} ({activeLead.size} Business)
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-xl font-mono font-bold text-emerald-600 dark:text-emerald-400">{activeLead.displayPhone || activeLead.phone}</div>
                    <div className="text-xs text-muted flex items-center sm:justify-end mt-0.5">
                      <Globe className="w-3 h-3 mr-1 text-blue-500" /> {activeLead.country} • {activeLead.region}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--glass-border)] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-xs text-muted">Target Solution:</span>
                    <span className="ml-1.5 px-2 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded font-semibold text-xs">
                      {activeLead.solution} (${activeLead.value?.toLocaleString()})
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted">Current Status:</span>
                    <span className="ml-1.5 font-semibold text-xs text-[var(--text-primary)]">
                      {activeLead.status}
                    </span>
                  </div>
                </div>

                {activeLead.notes && (
                  <div className="text-xs glass-soft p-3 rounded-lg border border-[var(--glass-border)] text-[var(--text-secondary)]">
                    <strong>Lead Notes:</strong> {activeLead.notes}
                  </div>
                )}
              </div>
            )}

            {/* Calling Options & Timer */}
            <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-800/40 dark:to-slate-900 rounded-2xl border border-[var(--glass-border)] space-y-4">
              {isCalling ? (
                <div className="text-center space-y-4 w-full">
                  <div className="inline-flex items-center space-x-2 px-4 py-1.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-full font-semibold text-sm animate-pulse">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span>CALL IN PROGRESS</span>
                  </div>

                  <div className="text-4xl font-mono font-bold tracking-wider text-[var(--text-primary)]">
                    {formatTime(callDuration)}
                  </div>

                  <div className="flex flex-wrap justify-center gap-3">
                    <button
                      onClick={handleStartCall}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-xs transition-all inline-flex items-center space-x-1.5"
                    >
                      <PhoneForwarded className="w-4 h-4" />
                      <span>Re-dial Device (tel:)</span>
                    </button>
                    <button
                      onClick={handleWhatsAppCall}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-xs transition-all inline-flex items-center space-x-1.5"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>WhatsApp Call</span>
                    </button>
                    <button
                      onClick={handleEndCallClick}
                      className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl shadow-lg shadow-red-600/30 transition-all flex items-center space-x-2 text-xs"
                    >
                      <PhoneOff className="w-4 h-4" />
                      <span>End Call & Log Outcome</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-4 w-full">
                  <p className="text-xs text-muted">Choose a channel to reach {activeLead?.name || 'customer'}:</p>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={handleStartCall}
                      disabled={!activeLead}
                      className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg transition-all flex items-center space-x-2 text-sm"
                    >
                      <PhoneCall className="w-5 h-5" />
                      <span>Device / Phone Link Call</span>
                    </button>

                    <button
                      onClick={handleWhatsAppCall}
                      disabled={!activeLead}
                      className="px-6 py-3.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg transition-all flex items-center space-x-2 text-sm"
                    >
                      <MessageSquare className="w-5 h-5" />
                      <span>WhatsApp Call</span>
                    </button>

                    <button
                      onClick={handleOpenEmailCompose}
                      disabled={!activeLead}
                      className="px-6 py-3.5 bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center space-x-2 text-sm"
                    >
                      <Mail className="w-5 h-5" />
                      <span>Email Prospect</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: IT Solution Pitch Script Helper */}
        <div className="glass glass-hover p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <FileText className="w-5 h-5 text-emerald-600" />
              <h3 className="font-bold text-[var(--text-primary)]">IT Solutions Pitch Script</h3>
            </div>

            <div className="space-y-4 text-xs text-[var(--text-secondary)] leading-relaxed">
              <div className="p-3 glass-soft border-emerald-400/25 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
                <strong className="text-emerald-700 dark:text-emerald-300 block mb-1">1. Introduction & Hook</strong>
                "Hello {activeLead?.name || 'there'}, my name is {currentUser.name} with Concept IT Solutions. We specialize in empowering {activeLead?.country || 'North American'} businesses like {activeLead?.company || 'your company'} with high-performance {activeLead?.solution || 'websites and portals'}."
              </div>

              <div className="p-3 glass-soft">
                <strong className="text-[var(--text-primary)] block mb-1">2. Value Proposition</strong>
                "We noticed your current online presence could be modernized to drive 3x more inbound customer leads, streamline workflow operations, and boost revenue."
              </div>

              <div className="p-3 glass-soft">
                <strong className="text-[var(--text-primary)] block mb-1">3. Closing Call to Action</strong>
                "Would you be open to a 10-minute technical walkthrough of a tailored prototype for {activeLead?.company} next Tuesday?"
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[var(--glass-border)] text-center">
            <span className="text-xs text-muted">Outreach via WhatsApp, Windows Phone Link and email.</span>
          </div>
        </div>
      </div>

      {/* Call History Section */}
      <div className="glass p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center">
            <History className="w-5 h-5 mr-2 text-emerald-600" />
            Outbound Call & Email History ({filteredLogs.length})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-xl glass-soft" role="group" aria-label="Filter history by channel">
              {['All', 'Calls', 'Emails'].map((option) => {
                const isActive = channelFilter === option;
                return (
                  <button
                    key={option}
                    onClick={() => setChannelFilter(option)}
                    aria-pressed={isActive}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      isActive
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-600/25'
                        : 'text-muted hover:text-[var(--text-primary)] hover:bg-white/[0.06]'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Search calls, emails, outcomes..."
                value={callHistorySearch}
                onChange={(e) => setCallHistorySearch(e.target.value)}
                className="py-2 px-3 pl-8 glass-input rounded-xl text-xs dark:text-white w-full sm:w-56"
              />
              <History className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted" />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="glass-head text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="py-3 px-4">Contact / Company</th>
                <th className="py-3 px-4">Channel</th>
                <th className="py-3 px-4">Caller</th>
                <th className="py-3 px-4">Outcome</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Call Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07] text-sm">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-muted">No calls or emails recorded yet.</td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="row-hover">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[var(--text-primary)]">{log.leadName}</div>
                      <div className="text-xs text-muted">{log.company}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                          log.channel === 'Email'
                            ? 'bg-indigo-400/15 text-indigo-300'
                            : 'bg-emerald-400/15 text-emerald-300'
                        }`}
                      >
                        {log.channel === 'Email' ? (
                          <Mail className="w-3 h-3 mr-1" />
                        ) : (
                          <PhoneCall className="w-3 h-3 mr-1" />
                        )}
                        {log.channel === 'Email' ? 'Email' : 'Call'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-[var(--text-primary)]/80">
                      {log.caller}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        log.outcome === 'Emailed' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' :
                        log.outcome === 'Deal Completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' :
                        log.outcome === 'Considering' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' :
                        log.outcome === 'Call Back Later' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
                        'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                      }`}>
                        {log.outcome}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-[var(--text-primary)]/80">
                      {log.duration}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-muted">
                      {log.timestamp}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[var(--text-secondary)] max-w-xs truncate">
                      {log.notes}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Email Delivery Log */}
      <div className="glass p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center">
            <Mail className="w-5 h-5 mr-2 text-indigo-400" />
            Email Delivery Log ({emailLog.length})
          </h3>
          <span className="text-[11px] text-muted">
            {emailConfigured
              ? `Sending as ${emailSender || 'your Gmail account'} · newest first`
              : 'Sending not configured — add GMAIL_APP_PASSWORD to .env'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="glass-head text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="py-3 px-4">Recipient</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Sent By</th>
                <th className="py-3 px-4">Sent At</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07] text-sm">
              {emailLog.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-8 text-muted">
                    No emails sent yet. Compose one from the Email Prospect channel above.
                  </td>
                </tr>
              ) : (
                emailLog.map((entry) => (
                  <tr key={entry.id} className="row-hover">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[var(--text-primary)]">{entry.leadName || entry.to}</div>
                      <div className="text-xs text-muted font-mono">{entry.to}</div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[var(--text-secondary)] max-w-xs truncate" title={entry.subject}>
                      {entry.subject}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[var(--text-primary)]/80">{entry.sentBy}</td>
                    <td className="py-3.5 px-4 text-xs text-muted font-mono">
                      {new Date(entry.sentAt).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          entry.status === 'sent'
                            ? 'bg-emerald-400/15 text-emerald-300'
                            : entry.status === 'failed'
                            ? 'bg-rose-400/15 text-rose-300'
                            : 'bg-amber-400/15 text-amber-300'
                        }`}
                        title={entry.error || entry.providerId || ''}
                      >
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Outcome Modal */}
      {showOutcomeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xl p-4">
          <div className="w-full max-w-md glass-strong overflow-hidden">
            <div className="p-6 border-b border-[var(--glass-border)] bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
              <h3 className="text-lg font-bold">Call Completed</h3>
              <p className="text-xs text-emerald-100 mt-0.5">Select outcome and add notes for {activeLead?.name} ({activeLead?.company})</p>
            </div>

            <form onSubmit={handleSaveCallOutcome} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                  Call Outcome *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['Considering', 'Deal Completed', 'Denied', 'Call Back Later', 'No Answer'].map((outcome) => (
                    <button
                      type="button"
                      key={outcome}
                      onClick={() => setCallOutcome(outcome)}
                      className={`p-3 rounded-xl border text-xs font-semibold text-left transition-all ${
                        callOutcome === outcome
                          ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 shadow-sm'
                          : 'border-[var(--glass-border)] text-[var(--text-primary)]/80 hover:border-white/20'
                      }`}
                    >
                      {outcome}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Call Notes & Next Steps
                </label>
                <textarea
                  rows="3"
                  placeholder="Summarize conversation discussion, client objections, or requirements..."
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white resize-none"
                ></textarea>
              </div>

              {callOutcome === 'Deal Completed' && (
                <div className="p-3 glass-soft border-emerald-400/25 rounded-xl border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300">
                  🎉 Selecting <strong>Deal Completed</strong> will automatically create a follow-up task for wire transfer verification (${activeLead?.value?.toLocaleString()}).
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center space-x-2"
                >
                  <Send className="w-4 h-4" />
                  <span>Save Call Log & Update Lead</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Email Compose Modal */}
      {showEmailCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xl p-4">
          <div className="w-full max-w-xl glass-strong overflow-hidden">
            <div className="p-6 border-b border-[var(--glass-border)] bg-gradient-to-r from-indigo-600 to-violet-600 text-white">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Mail className="w-4 h-4" /> Email {activeLead?.name}
              </h3>
              <p className="text-xs text-indigo-100 mt-0.5">
                {activeLead?.company} · {activeLead?.country} · {activeLead?.solution}
              </p>
            </div>

            <form onSubmit={handleSendEmail} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
                  Template
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {EMAIL_TEMPLATES.map((template) => {
                    const Icon = template.icon;
                    const isActive = emailTemplate === template.id;
                    return (
                      <button
                        type="button"
                        key={template.id}
                        onClick={() => applyEmailTemplate(template.id)}
                        className={`p-2.5 rounded-xl text-left transition-all ${
                          isActive
                            ? 'accent-pill shadow-sm'
                            : 'border border-[var(--glass-border)] hover:border-white/20'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 mb-1 ${isActive ? 'text-[var(--accent)]' : 'text-muted'}`} />
                        <div className="text-[11px] font-semibold">{template.label}</div>
                        <div className="text-[10px] text-muted">{template.hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  To <span className="normal-case tracking-normal font-medium">(recipient email)</span>
                </label>
                <div className="relative">
                  <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="email"
                    required
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full pl-9 pr-3 py-2.5 glass-input rounded-xl text-sm"
                  />
                </div>
                {!activeLead?.email && (
                  <p className="text-[11px] text-amber-500 mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    No email on file for this lead — add one above before sending.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">Subject</label>
                <input
                  type="text"
                  required
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2.5 glass-input rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">Message</label>
                <textarea
                  rows="9"
                  required
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full p-3 glass-input rounded-xl text-sm resize-none leading-relaxed"
                ></textarea>
              </div>

              <div className="p-3 glass-soft rounded-xl text-[11px] leading-relaxed">
                <span className="text-muted font-bold uppercase tracking-widest text-[9px] block mb-1.5">
                  Signature · added automatically
                </span>
                Best regards,<br />
                <strong>{currentUser.name}</strong> · {currentUser.role}<br />
                Concept IT Solutions — {SIGNATURE_SERVICE_LINE}
              </div>

              {emailStatus && (
                <div
                  className={`p-3 rounded-xl border text-xs font-medium flex items-start gap-2 ${
                    emailStatus.type === 'success'
                      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-rose-400/30 bg-rose-500/10 text-rose-300'
                  }`}
                >
                  {emailStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                  )}
                  <span>{emailStatus.message}</span>
                </div>
              )}

              <p className="text-[11px] text-muted">
                Sent through your Gmail account from Concept IT Solutions, and recorded in the delivery log on this screen.
              </p>

              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-[var(--glass-border)]">
                <button
                  type="button"
                  onClick={() => setShowEmailCompose(false)}
                  className="px-4 py-2.5 glass-soft rounded-xl text-sm font-medium hover:border-white/25 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="px-4 py-2.5 glass-soft rounded-xl text-sm font-medium hover:border-white/25 transition-colors flex items-center space-x-2"
                >
                  {emailCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  <span>{emailCopied ? 'Copied' : 'Copy draft'}</span>
                </button>
                <button
                  type="submit"
                  disabled={!emailTo.trim() || emailSending}
                  className="px-5 py-2.5 bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center space-x-2 text-sm"
                >
                  <Send className={`w-4 h-4 ${emailSending ? 'animate-pulse' : ''}`} />
                  <span>{emailSending ? 'Sending…' : 'Send email'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

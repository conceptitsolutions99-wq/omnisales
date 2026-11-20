import React, { useState, useEffect, useRef } from 'react';
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
  ImagePlus,
  Mail,
  Copy,
  Check,
  AtSign
} from 'lucide-react';
import { markLeadContacted } from '../lib/lead-status';
import { whatsappNumberFor } from '../lib/contact-channels';
import { buildSignature, SIGNATURE_SERVICE_LINE, COMPANY_SITE } from '../lib/signature';
import WhatsAppProofModal from './WhatsAppProofModal';

// The outreach copy names the market the prospect is in, so an Egyptian lead is not told about
// work "across Canada and the USA"
const marketLine = (lead) =>
  /egypt/i.test(String(lead?.country || '')) ? 'Egypt' : 'Canada and the USA';
const EMAIL_LOG_KEY = 'cit_email_delivery_log';

// What was actually written to each lead last. A resend must be the same message, not a fresh
// draft the agent has to rebuild, and the server keeps no copy of a body after it sends it.
const LAST_DRAFT_KEY = 'cit_last_email_drafts';

const readLastDrafts = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_DRAFT_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const rememberLastDraft = (lead, draft) => {
  const all = readLastDrafts();
  if (!lead || !draft?.to) return all;

  all[String(lead.id)] = { ...draft, sentAt: new Date().toISOString() };

  // Keep the map bounded: old leads drop out rather than filling the browser's storage
  const keys = Object.keys(all);
  if (keys.length > 200) {
    keys
      .sort((a, b) => String(all[a].sentAt || '').localeCompare(String(all[b].sentAt || '')))
      .slice(0, keys.length - 200)
      .forEach((key) => delete all[key]);
  }

  try {
    localStorage.setItem(LAST_DRAFT_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: resend is simply not offered */
  }
  return all;
};

// How the From of a recorded send was decided, so the log explains itself without the server logs
const SENDER_MODES = {
  account: {
    label: 'Gmail account',
    className: 'bg-slate-400/15 text-slate-300',
    hint: 'Sent as the signed-in Gmail account, so SPF and DKIM stay aligned'
  },
  alias: {
    label: 'Verified alias',
    className: 'bg-emerald-400/15 text-emerald-300',
    hint: 'Sent as a Gmail “send mail as” address that the account has verified'
  },
  relay: {
    label: 'Relay sender',
    className: 'bg-sky-400/15 text-sky-300',
    hint: 'MAIL_FROM sent through the configured relay host'
  }
};

// A test proves the path only if the receiver agrees: these are Gmail's own SPF, DKIM and DMARC
// verdicts for the delivered copy, read back over IMAP, shown next to the From that was used
const AUTH_MECHANISMS = ['spf', 'dkim', 'dmarc'];

const AuthenticationVerdicts = ({ result }) => {
  if (!result) return null;

  if (!result.found) {
    const message =
      result.reason === 'imap_not_configured'
        ? 'Add GMAIL_USER and GMAIL_APP_PASSWORD to read the verdicts back.'
        : result.reason === 'not_delivered_yet'
          ? 'Gmail had not delivered the copy into the inbox yet, so no verdicts were read. Send the test again in a moment.'
          : `Verdicts unavailable: ${result.reason || 'unknown reason'}`;
    return <div className="mt-2 text-[11px] text-amber-300/90">{message}</div>;
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
      {AUTH_MECHANISMS.map((mechanism) => {
        const verdict = String(result[mechanism] || '').toLowerCase();
        return (
          <span
            key={mechanism}
            className={`px-2 py-0.5 rounded-full uppercase tracking-wider ${
              !verdict
                ? 'bg-slate-400/15 text-slate-300'
                : verdict === 'pass'
                  ? 'bg-emerald-400/15 text-emerald-300'
                  : 'bg-rose-400/15 text-rose-300'
            }`}
          >
            {mechanism} {verdict || '—'}
          </span>
        );
      })}
      <span className="ml-1 font-medium text-muted">
        {result.aligned ? 'aligned with the From' : 'not aligned with the From'}
        {result.fromDomain ? ` · ${result.fromDomain}` : ''}
      </span>
    </div>
  );
};

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
          `I'm ${agent.name}, ${agent.title || agent.role || 'Sales Agent'} at Concept IT Solutions — we build ${solution}s, web portals and mobile apps for businesses across ${marketLine(lead)}.`,
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
  // History can be narrowed by the contact's name and by the day it happened, so a follow-up
  // question ("what did we send Ahmed last Tuesday?") does not need scrolling or the free search
  const [historyName, setHistoryName] = useState('');
  // A whole week is the usual question, so the date filter is a range rather than one day
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [historyCaller, setHistoryCaller] = useState('All');
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
  // Sender audit: which From path each send took, and how many took each
  const [senderFilter, setSenderFilter] = useState('All');
  // The same audit by person: one employee's sends can be isolated from the team's
  const [emailSenderFilter, setEmailSenderFilter] = useState('All');
  // The last message written to each lead, so an earlier one can be sent again unchanged
  const [lastDrafts, setLastDrafts] = useState(readLastDrafts);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendStatus, setResendStatus] = useState(null);
  const [whatsAppIssue, setWhatsAppIssue] = useState('');
  // Opening a WhatsApp chat also opens the proof step: no screenshots, no logged contact
  const [proofLead, setProofLead] = useState(null);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [emailSender, setEmailSender] = useState('');
  // The From the server actually used, and whether MAIL_FROM was ignored in favour of the account
  const [emailFrom, setEmailFrom] = useState('');
  const [emailFromOverridden, setEmailFromOverridden] = useState(false);
  // The deliverability test is an admin action: it sends one real message to the admin's own
  // address and reports the From, mode and message id the provider actually used
  const [testEmailBusy, setTestEmailBusy] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState(null);
  const canSendTest = currentUser.role === 'Admin' || Boolean(currentUser.permissions?.admin);
  // The postal identity and opt-out the server would add, so the signature can carry them once
  const [companySignature, setCompanySignature] = useState({ disclosure: '', optOut: '' });
  const [emailTemplate, setEmailTemplate] = useState('intro');
  // Optional requirements form the customer fills in from the email
  const [emailRequirements, setEmailRequirements] = useState('');

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
    if (!String(activeLead.phone || '').replace(/\D/g, '')) return;
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


  // A usable WhatsApp number is 8–15 digits and never starts with the 0 trunk prefix
  const usableWhatsAppNumber = (number) => /^[1-9]\d{7,14}$/.test(number);

  // The opening message is written from what the app already knows about the lead: a business
  // with no site gets the website angle, one with a site gets an improvement angle
  const WHATSAPP_OFFERS = { Website: 'websites', 'Web Portal': 'web portals', 'Mobile App': 'mobile apps' };

  const buildWhatsAppMessage = (lead) => {
    const firstName = String(lead.name || '').split(' ')[0] || 'there';
    const offer = WHATSAPP_OFFERS[lead.solution] || 'websites and apps';
    const pitch = lead.website
      ? `I had a quick look at ${lead.company}'s website and have two ideas that could bring in more enquiries — is now a good time for two minutes?`
      : `I noticed ${lead.company} doesn't have a website yet. We build ${offer} for businesses in ${lead.region || lead.country || 'your area'} — can I send you two examples?`;
    return `Hi ${firstName}, this is ${currentUser.name} from Concept IT Solutions. ${pitch}`;
  };

  const handleWhatsAppCall = () => {
    if (!activeLead) return;
    // A WhatsApp or mobile number on file wins over the switchboard, because that is the
    // number the chat actually exists on
    const number = whatsappNumberFor(activeLead);

    if (!usableWhatsAppNumber(number)) {
      setWhatsAppIssue(
        number
          ? `WhatsApp needs a number with its country code, and ${activeLead.displayPhone || activeLead.phone} does not have a usable one — correct the lead's phone number first.`
          : 'This lead has no phone number to message on WhatsApp.'
      );
      return;
    }

    setWhatsAppIssue('');
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(buildWhatsAppMessage(activeLead))}`, '_blank');

    // The chat opens first, then the screenshot step: the contact is only recorded once the
    // conversation it produced is on file for the admin and analyst to review.
    setProofLead(activeLead);
  };

  const handleWhatsAppProofSaved = (proof) => {
    const lead = proofLead || activeLead;
    if (!lead) return;

    const now = new Date();
    const timestampStr = `${now.toISOString().split('T')[0]} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const shots = Number(proof?.imageCount) || 0;

    setCallLogs([
      {
        id: Date.now(),
        channel: 'WhatsApp',
        leadId: lead.id ?? null,
        leadName: lead.name || lead.company || '—',
        company: lead.company || '—',
        phone: lead.displayPhone || lead.phone || '—',
        email: lead.email || '—',
        caller: currentUser.name,
        outcome: 'WhatsApped',
        duration: '—',
        timestamp: timestampStr,
        notes: `${shots} WhatsApp screenshot${shots === 1 ? '' : 's'} attached${proof?.note ? ` · ${proof.note}` : ''}`,
        proofId: proof?.id || null
      },
      ...callLogs
    ]);

    markContacted(lead);
    setProofLead(null);
  };

  // Reaching a lead by email or WhatsApp moves it off "New"; the rule lives in one place so
  // every screen agrees
  const markContacted = (lead) => {
    if (!lead) return;
    markLeadContacted(setLeads, { leadId: lead.id, email: lead.email, by: currentUser.name });
  };

  // Build a ready-to-send outreach draft from the active lead and a template
  const buildEmailDraft = (lead, templateId = 'intro') => {
    const template = EMAIL_TEMPLATES.find(item => item.id === templateId) || EMAIL_TEMPLATES[0];
    const draft = template.build(lead, currentUser);
    return { subject: draft.subject, body: `${draft.body}\n\n${buildSignature(currentUser, companySignature)}` };
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
    setEmailRequirements('');
    applyEmailTemplate('intro');
    setShowEmailCompose(true);
  };

  // The deployed endpoint keeps no disk, so each browser stores what it sent too
  const readLocalEmailLog = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(EMAIL_LOG_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  };

  const writeLocalEmailLog = (entries) => {
    try {
      localStorage.setItem(EMAIL_LOG_KEY, JSON.stringify(entries.slice(0, 100)));
    } catch (err) {
      /* storage unavailable: the session list still shows what was sent */
    }
  };

  const fetchEmailLog = async () => {
    const local = readLocalEmailLog();
    try {
      const response = await fetch('/api/emails');
      if (!response.ok) throw new Error(`Log unavailable (${response.status})`);
      const data = await response.json();
      const serverEmails = Array.isArray(data.emails) ? data.emails : [];
      // The server's copy of a send records the From it left with; the browser copy keeps what
      // the warm serverless instance may have forgotten, so a duplicate keeps both sets of facts
      const byId = new Map();
      for (const entry of local) byId.set(entry.id, entry);
      for (const entry of serverEmails) {
        const existing = byId.get(entry.id);
        const filled = Object.fromEntries(
          Object.entries(entry).filter(([, value]) => value !== null && value !== undefined && value !== '')
        );
        byId.set(entry.id, existing ? { ...existing, ...filled } : entry);
      }
      const merged = [...byId.values()].sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
      setEmailLog(merged);
      setEmailConfigured(data.configured !== false);
      setEmailSender(data.sender || '');
      setEmailFrom(data.from || '');
      setEmailFromOverridden(Boolean(data.fromOverridden));
      setCompanySignature(
        data.signature && typeof data.signature === 'object'
          ? { disclosure: data.signature.disclosure || '', optOut: data.signature.optOut || '' }
          : { disclosure: '', optOut: '' }
      );
    } catch (err) {
      setEmailLog(local);
    }
  };

  useEffect(() => {
    fetchEmailLog();
  }, []);

  // An email sent before this rule existed still leaves its lead on New, so the delivery log is
  // replayed once on mount and those leads catch up
  useEffect(() => {
    const sentNames = new Set(
      readLocalEmailLog()
        .filter(entry => entry.status === 'sent' && entry.leadName)
        .map(entry => String(entry.leadName).toLowerCase())
    );
    if (sentNames.size === 0) return;

    setLeads(prev => {
      let changed = false;
      const next = prev.map(lead => {
        if (lead.status && lead.status !== 'New') return lead;
        if (!sentNames.has(String(lead.name || '').toLowerCase())) return lead;
        changed = true;
        return { ...lead, status: 'Contacted' };
      });
      return changed ? next : prev;
    });
    // Runs once: the point is to reconcile history that predates the rule, not to watch it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A second click can arrive before the state has re-rendered, so the guard is a ref: one
  // click must mean one email and one history entry
  const sendingRef = useRef(false);
  const resendRef = useRef(false);

  // The history entry, the contact mark and this browser's copy of the delivery all follow from
  // one send; a resend records itself the same way, so the log shows both messages
  const recordEmailSend = (data, { to, subject, lead }) => {
    const now = new Date();
    const timestampStr = `${now.toISOString().split('T')[0]} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const emailLogEntry = {
      id: Date.now(),
      channel: 'Email',
      leadId: lead?.id ?? null,
      leadName: lead?.name || to,
      company: lead?.company || '—',
      phone: lead?.displayPhone || lead?.phone || to,
      email: to,
      caller: currentUser.name,
      outcome: 'Emailed',
      duration: '—',
      timestamp: timestampStr,
      notes: `Subject: ${subject}`,
      providerId: data.email?.providerId || null
    };
    setCallLogs(prev => [emailLogEntry, ...prev]);
    markContacted(lead);

    writeLocalEmailLog([
      {
        id: data.email?.id || `local_${Date.now()}`,
        to,
        subject,
        leadName: lead?.name || '',
        sentBy: currentUser.name,
        sentAt: new Date().toISOString(),
        // The From the server says it used, so this browser's copy stays auditable even after
        // the warm serverless instance that held the delivery is gone
        from: data.email?.from || emailFrom || '',
        fromMode: data.email?.fromMode || '',
        status: 'sent',
        providerId: data.email?.providerId || null,
        error: null
      },
      ...readLocalEmailLog()
    ]);

    fetchEmailLog();
  };

  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!emailTo.trim() || emailSending || sendingRef.current) return;

    sendingRef.current = true;
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
          requirements: emailRequirements,
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
        message: `Email sent to ${emailTo.trim()}${data.email?.providerId ? ` · id ${data.email.providerId}` : ''}${
          data.email?.requirementsUrl ? ' · requirements form attached' : ''
        }`
      });

      recordEmailSend(data, { to: emailTo.trim(), subject: emailSubject, lead: activeLead });
      // Remembered so this lead can be written to again later without rebuilding the message
      setLastDrafts(
        rememberLastDraft(activeLead, { to: emailTo.trim(), subject: emailSubject, body: emailBody })
      );
    } catch (err) {
      setEmailStatus({
        type: 'error',
        message:
          err.message === 'Failed to fetch'
            ? 'Cannot reach the mail service. Check your connection, and make sure GMAIL_USER and GMAIL_APP_PASSWORD are set in the environment variables.'
            : err.message
      });
    } finally {
      sendingRef.current = false;
      setEmailSending(false);
    }
  };

  // Sending the same message again because the customer lost it or did not reply. The subject,
  // wording and recipient come from what was sent last time, not from a new draft.
  const handleResendEmail = async () => {
    if (!activeLead || !activeLastDraft?.to || resendingEmail || resendRef.current) return;

    resendRef.current = true;
    setResendingEmail(true);
    setResendStatus(null);

    try {
      const response = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: activeLastDraft.to,
          subject: activeLastDraft.subject,
          body: activeLastDraft.body,
          leadId: activeLead.id ?? null,
          leadName: activeLead.name || '',
          company: activeLead.company || '',
          sentBy: currentUser.name
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Sending failed (${response.status}).`);

      recordEmailSend(data, {
        to: activeLastDraft.to,
        subject: activeLastDraft.subject,
        lead: activeLead
      });
      setLastDrafts(rememberLastDraft(activeLead, activeLastDraft));
      setResendStatus({ type: 'success', message: `Sent again to ${activeLastDraft.to}.` });
    } catch (err) {
      setResendStatus({
        type: 'error',
        message: err.message === 'Failed to fetch' ? 'Cannot reach the mail service.' : err.message
      });
    } finally {
      resendRef.current = false;
      setResendingEmail(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (testEmailBusy) return;

    setTestEmailBusy(true);
    setTestEmailResult(null);
    try {
      const response = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `The test email failed (${response.status}).`);

      setTestEmailResult({
        ok: true,
        to: data.email?.to || '',
        from: data.from || data.email?.from || '',
        mode: data.fromMode || data.email?.fromMode || '',
        messageId: data.messageId || data.email?.providerId || '',
        authentication: data.authentication || null
      });
      fetchEmailLog();
    } catch (err) {
      setTestEmailResult({
        ok: false,
        error: err.message === 'Failed to fetch' ? 'Cannot reach the mail service.' : err.message
      });
    } finally {
      setTestEmailBusy(false);
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
      if (String(l.id) === String(activeLead.id)) {
        const at = new Date().toISOString();
        return {
          ...l,
          status: callOutcome,
          contactedAt: at,
          contactedBy: currentUser.name,
          statusBy: currentUser.name,
          statusAt: at,
          updatedAt: at
        };
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
  const isAdminView = currentUser.role === 'Admin' || Boolean(currentUser.permissions?.admin);
  const filteredLogs = callLogs.filter(log => {
    const isUserCaller = log.caller === currentUser.name;
    const matchesPermission = isAdminView || isUserCaller;
    const query = callHistorySearch.toLowerCase();
    const matchesSearch = (log.leadName || '').toLowerCase().includes(query) ||
                          (log.company || '').toLowerCase().includes(query) ||
                          (log.caller || '').toLowerCase().includes(query) ||
                          (log.outcome || '').toLowerCase().includes(query) ||
                          (log.channel || 'Call').toLowerCase().includes(query) ||
                          (log.notes || '').toLowerCase().includes(query);
    const nameQuery = historyName.trim().toLowerCase();
    const matchesName =
      !nameQuery || `${log.leadName || ''} ${log.company || ''}`.toLowerCase().includes(nameQuery);
    // Outreach entries carry a readable "YYYY-MM-DD HH:mm" timestamp and emails an ISO sentAt,
    // so the first ten characters are the day either way
    const logDay = String(log.timestamp || log.sentAt || '').slice(0, 10);
    // ISO days compare as text, so an open end simply means "from here" or "up to here"
    const matchesDate =
      (!historyFrom || logDay >= historyFrom) && (!historyTo || logDay <= historyTo);
    const matchesCaller = historyCaller === 'All' || (log.caller || '') === historyCaller;
    const channel = log.channel || 'Call';
    const matchesChannel =
      channelFilter === 'All' ||
      (channelFilter === 'Emails'
        ? channel === 'Email'
        : channelFilter === 'WhatsApp'
          ? channel === 'WhatsApp'
          : channel !== 'Email' && channel !== 'WhatsApp');
    return matchesPermission && matchesSearch && matchesChannel && matchesName && matchesDate && matchesCaller;
  });

  // Only the employees this viewer can already see, so the list never offers a name that would
  // then return nothing
  const historyCallers = [...new Set(
    callLogs
      .filter((log) => isAdminView || log.caller === currentUser.name)
      .map((log) => String(log.caller || '').trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  // A lead found by its email alone has no number, so calling has to be offered only when there is one
  const activePhoneDigits = String(activeLead?.phone || '').replace(/\D/g, '');

  // Sending the same message to one address again within minutes is what gets mail filtered,
  // so the compose card says when this lead was last written to
  const lastEmailToLead = activeLead
    ? callLogs.find(
        log =>
          (log.channel || 'Call') === 'Email' &&
          (String(log.leadId) === String(activeLead.id) ||
            (log.leadName && log.leadName === activeLead.name))
      )
    : null;
  const minutesSinceLastEmail = lastEmailToLead
    ? Math.max(0, Math.round((Date.now() - new Date(String(lastEmailToLead.timestamp).replace(' ', 'T')).getTime()) / 60000))
    : null;

  // What the lead was last written, when this browser wrote it; that is what Resend sends
  const activeLastDraft = activeLead ? lastDrafts[String(activeLead.id)] || null : null;

  // Older entries predate the Sender column, so they are counted as unknown rather than
  // disappearing from the audit
  const senderModeOf = (entry) => {
    const mode = String(entry?.fromMode || '');
    return Object.prototype.hasOwnProperty.call(SENDER_MODES, mode) ? mode : 'unknown';
  };
  // Only the employees this viewer can already see, so the picker never offers a name that
  // would then return nothing
  // The log follows the same rule as the history table: an admin sees every send, an agent
  // only the messages they sent themselves
  const emailLogForViewer = emailLog.filter(
    (entry) => isAdminView || String(entry.sentBy || '') === currentUser.name
  );
  const emailLogSenders = [...new Set(
    emailLogForViewer.map((entry) => String(entry.sentBy || '').trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
  // The path counts follow the employee picked, so the chips describe that person's sends
  const emailLogForEmployee =
    emailSenderFilter === 'All'
      ? emailLogForViewer
      : emailLogForViewer.filter((entry) => String(entry.sentBy || '') === emailSenderFilter);
  const senderCounts = emailLogForEmployee.reduce(
    (counts, entry) => {
      const mode = senderModeOf(entry);
      counts[mode] = (counts[mode] || 0) + 1;
      return counts;
    },
    { unknown: 0 }
  );
  const visibleEmailLog =
    senderFilter === 'All'
      ? emailLogForEmployee
      : emailLogForEmployee.filter((entry) => senderModeOf(entry) === senderFilter);

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
                value={String(activeLead?.id ?? '')}
                onChange={(e) => {
                  // Generated leads carry string ids (osm-node-…, geoapify-…), so the value is
                  // compared as text or they could never be picked
                  const lead = leads.find(l => String(l.id) === e.target.value);
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
                      onClick={handleWhatsAppCall}
                      disabled={!activeLead || !activePhoneDigits}
                      className="px-6 py-3.5 bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center space-x-2 text-sm"
                    >
                      <MessageSquare className="w-5 h-5" />
                      <span>WhatsApp First</span>
                    </button>

                    <button
                      onClick={handleStartCall}
                      disabled={!activeLead || !activePhoneDigits}
                      className="px-6 py-3.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg transition-all flex items-center space-x-2 text-sm"
                    >
                      <PhoneCall className="w-5 h-5" />
                      <span>Device / Phone Link Call</span>
                    </button>

                    <button
                      onClick={handleOpenEmailCompose}
                      disabled={!activeLead}
                      className="px-6 py-3.5 bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center space-x-2 text-sm"
                    >
                      <Mail className="w-5 h-5" />
                      <span>Email Prospect</span>
                    </button>

                    {/* Offered once this lead has actually been written to: it sends that same
                        message again, which is the common "they never got it" case */}
                    {activeLastDraft && (
                      <button
                        onClick={handleResendEmail}
                        disabled={resendingEmail}
                        title={`Last sent ${new Date(activeLastDraft.sentAt).toLocaleString()} — “${activeLastDraft.subject}”`}
                        className="px-6 py-3.5 rounded-xl border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 disabled:opacity-50 text-amber-600 dark:text-amber-300 font-bold transition-all flex items-center space-x-2 text-sm"
                      >
                        <History className="w-5 h-5" />
                        <span>{resendingEmail ? 'Resending…' : 'Resend Last Email'}</span>
                      </button>
                    )}
                  </div>

                  {activeLastDraft && !resendStatus && (
                    <p className="text-[11px] text-muted">
                      Resend sends “{activeLastDraft.subject}” to {activeLastDraft.to} again, exactly as it was
                      written.
                    </p>
                  )}

                  {resendStatus && (
                    <p
                      className={`text-[11px] font-medium ${
                        resendStatus.type === 'error' ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {resendStatus.message}
                    </p>
                  )}

                  {whatsAppIssue && (
                    <p className="text-[11px] text-amber-500 max-w-md mx-auto">{whatsAppIssue}</p>
                  )}

                  {activeLead && !activePhoneDigits && (
                    <p className="text-[11px] text-amber-500">This lead has no phone number on file, so only email is available.</p>
                  )}

                  {activeLead && !activeLead.email && (
                    <p className="text-[11px] text-amber-500">
                      No email on file for this lead — use “Find email” in the Leads list, or type the address into
                      the email card.
                    </p>
                  )}

                  {activeLead && (
                    <div className="w-full max-w-md mx-auto rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-left">
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium flex items-start gap-1.5">
                        <ImagePlus className="w-3.5 h-3.5 mt-px shrink-0" />
                        <span>
                          Screenshots of the WhatsApp conversation are required for every contact. Nothing is
                          logged until at least one is attached, and the admin and analyst review them.
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={() => setProofLead(activeLead)}
                        className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline"
                      >
                        Already messaged this lead? Attach the screenshots
                      </button>
                    </div>
                  )}

                  <p className="text-[11px] text-muted max-w-md mx-auto">
                    WhatsApp opens the chat with a message already written for this lead. WhatsApp does not
                    let a website see whether a number is registered on it, so if the chat does not open, use
                    the phone button.
                  </p>
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
                "Hello {activeLead?.name || 'there'}, my name is {currentUser.name}, {currentUser.title || currentUser.role} at Concept IT Solutions. We specialize in empowering {activeLead?.country || 'North American'} businesses like {activeLead?.company || 'your company'} with high-performance {activeLead?.solution || 'websites and portals'}."
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
              {['All', 'Calls', 'Emails', 'WhatsApp'].map((option) => {
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
                placeholder="Filter by name..."
                value={historyName}
                onChange={(e) => setHistoryName(e.target.value)}
                aria-label="Filter history by contact or company name"
                className="py-2 px-3 pl-8 glass-input rounded-xl text-xs dark:text-white w-full sm:w-44"
              />
              <UserCheck className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted" />
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Filter history by date range">
              <input
                type="date"
                value={historyFrom}
                onChange={(e) => setHistoryFrom(e.target.value)}
                aria-label="History from this date"
                title="Show entries recorded on or after this day"
                className="py-2 px-2 glass-input rounded-xl text-xs dark:text-white"
              />
              <span className="text-[11px] text-muted">to</span>
              <input
                type="date"
                value={historyTo}
                onChange={(e) => setHistoryTo(e.target.value)}
                aria-label="History up to this date"
                title="Show entries recorded on or before this day"
                className="py-2 px-2 glass-input rounded-xl text-xs dark:text-white"
              />
            </div>
            <select
              value={historyCaller}
              onChange={(e) => setHistoryCaller(e.target.value)}
              aria-label="Filter history by the employee who made the entry"
              title="Show only the entries one employee recorded"
              className="py-2 px-3 glass-input rounded-xl text-xs dark:text-white"
            >
              <option value="All">Everyone</option>
              {historyCallers.map((caller) => (
                <option key={caller} value={caller}>
                  {caller}
                </option>
              ))}
            </select>
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
            {(historyName || historyFrom || historyTo || historyCaller !== 'All') && (
              <button
                onClick={() => {
                  setHistoryName('');
                  setHistoryFrom('');
                  setHistoryTo('');
                  setHistoryCaller('All');
                }}
                title="Clear the name, date range and employee filters"
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-muted hover:text-[var(--text-primary)] hover:bg-white/[0.06]"
              >
                Clear
              </button>
            )}
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
                            : log.channel === 'WhatsApp'
                              ? 'bg-teal-400/15 text-teal-300'
                              : 'bg-emerald-400/15 text-emerald-300'
                        }`}
                      >
                        {log.channel === 'Email' ? (
                          <Mail className="w-3 h-3 mr-1" />
                        ) : log.channel === 'WhatsApp' ? (
                          <MessageSquare className="w-3 h-3 mr-1" />
                        ) : (
                          <PhoneCall className="w-3 h-3 mr-1" />
                        )}
                        {log.channel === 'Email' ? 'Email' : log.channel === 'WhatsApp' ? 'WhatsApp' : 'Call'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-[var(--text-primary)]/80">
                      {log.caller}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        log.outcome === 'Emailed' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' :
                        log.outcome === 'WhatsApped' ? 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300' :
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
            Email Delivery Log ({emailLogForViewer.length})
          </h3>
          <div className="text-[11px] text-muted sm:text-right space-y-1">
            {canSendTest && (
              <button
                onClick={handleSendTestEmail}
                disabled={testEmailBusy || !emailConfigured}
                title="Send one real test through the configured mail path, addressed only to your own account"
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[11px] font-semibold inline-flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                {testEmailBusy ? 'Sending test…' : 'Send test to myself'}
              </button>
            )}
            <div>
              {emailConfigured
                ? `Sending as ${emailFrom || emailSender || 'your Gmail account'} · newest first`
                : 'Sending not configured — add GMAIL_USER and GMAIL_APP_PASSWORD to the environment variables'}
            </div>
            {emailConfigured && emailFromOverridden && (
              <p className="text-amber-500 mt-0.5 max-w-xs">
                MAIL_FROM was ignored: Gmail only sends as the signed-in account. Set
                GMAIL_FROM_ALIAS_VERIFIED=true once that address is a verified “send mail as” alias.
              </p>
            )}
          </div>
        </div>

        {testEmailResult && (
          <div
            className={`p-3 rounded-xl border text-[11px] font-medium ${
              testEmailResult.ok
                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                : 'border-rose-400/30 bg-rose-400/10 text-rose-300'
            }`}
          >
            {testEmailResult.ok ? (
              <>
              <span>
                Test email sent to <strong>{testEmailResult.to}</strong>
                {testEmailResult.from && (
                  <>
                    {' · From '}
                    <strong className="font-mono">{testEmailResult.from}</strong>
                  </>
                )}
                {testEmailResult.mode && <> · {SENDER_MODES[testEmailResult.mode]?.label || testEmailResult.mode}</>}
                {testEmailResult.messageId && (
                  <>
                    {' · id '}
                    <span className="font-mono">{testEmailResult.messageId}</span>
                  </>
                )}
              </span>
              <AuthenticationVerdicts result={testEmailResult.authentication} />
              </>
            ) : (
              <span>{testEmailResult.error}</span>
            )}
          </div>
        )}

        {/* Which From each send used and which employee made it, so a month of sends can be
            audited per path and per person */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={emailSenderFilter}
            onChange={(e) => setEmailSenderFilter(e.target.value)}
            aria-label="Filter the delivery log by the employee who sent the email"
            title="Show only the sends one employee made"
            className="py-1.5 px-3 glass-input rounded-lg text-[11px] font-semibold dark:text-white"
          >
            <option value="All">Everyone</option>
            {emailLogSenders.map((sender) => (
              <option key={sender} value={sender}>
                {sender}
              </option>
            ))}
          </select>
          {[{ key: 'All', label: 'All sends' }, ...Object.entries(SENDER_MODES).map(([key, mode]) => ({ key, label: mode.label }))]
            .concat(senderCounts.unknown > 0 ? [{ key: 'unknown', label: 'Sender not recorded' }] : [])
            .map((chip) => {
              const count = chip.key === 'All' ? emailLogForEmployee.length : senderCounts[chip.key] || 0;
              const isActive = senderFilter === chip.key;
              return (
                <button
                  key={chip.key}
                  onClick={() => setSenderFilter(chip.key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all inline-flex items-center gap-1.5 ${
                    isActive
                      ? 'accent-pill text-[var(--accent)]'
                      : 'glass-soft text-muted hover:text-[var(--text-primary)]'
                  }`}
                  title={
                    chip.key === 'All'
                      ? 'Every delivery in the log'
                      : SENDER_MODES[chip.key]?.hint || 'Sends made before the Sender column existed'
                  }
                >
                  <span>{chip.label}</span>
                  <span
                    className={`px-1.5 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-[var(--accent)]/20' : 'bg-white/10'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          {(senderFilter !== 'All' || emailSenderFilter !== 'All') && (
            <button
              onClick={() => {
                setSenderFilter('All');
                setEmailSenderFilter('All');
              }}
              title="Clear the sender path and employee filters"
              className="px-2.5 py-1.5 rounded-lg glass-soft text-[11px] font-semibold text-muted hover:text-[var(--text-primary)]"
            >
              Clear
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="glass-head text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="py-3 px-4">Recipient</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Sender</th>
                <th className="py-3 px-4">Sent By</th>
                <th className="py-3 px-4">Sent At</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07] text-sm">
              {visibleEmailLog.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-muted">
                    {emailLogForViewer.length === 0
                      ? emailLog.length === 0
                        ? 'No emails sent yet. Compose one from the Email Prospect channel above.'
                        : 'You have not sent any emails yet. This log shows only your own sends.'
                      : emailSenderFilter !== 'All'
                        ? `No sends by ${emailSenderFilter} match these filters. Choose another employee or clear it.`
                        : 'No sends used that sender. Choose another filter or clear it.'}
                  </td>
                </tr>
              ) : (
                visibleEmailLog.map((entry) => (
                  <tr key={entry.id} className="row-hover">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[var(--text-primary)]">{entry.leadName || entry.to}</div>
                      <div className="text-xs text-muted font-mono">{entry.to}</div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[var(--text-secondary)] max-w-xs truncate" title={entry.subject}>
                      {entry.subject}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      {entry.from ? (
                        <>
                          <div
                            className="font-mono text-[var(--text-primary)]/80 truncate max-w-[200px]"
                            title={`${entry.from}${entry.fromMode ? ` — ${SENDER_MODES[entry.fromMode]?.hint || entry.fromMode}` : ''}`}
                          >
                            {entry.from}
                          </div>
                          {entry.fromMode && (
                            <span
                              className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                SENDER_MODES[entry.fromMode]?.className || 'bg-slate-400/15 text-slate-300'
                              }`}
                              title={SENDER_MODES[entry.fromMode]?.hint || entry.fromMode}
                            >
                              {SENDER_MODES[entry.fromMode]?.label || entry.fromMode}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted" title="This send was recorded before the From address was logged">
                          —
                        </span>
                      )}
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

            {minutesSinceLastEmail !== null && minutesSinceLastEmail <= 1440 && (
              <div className="px-6 py-2 bg-amber-400/10 border-b border-amber-400/25 text-[11px] text-amber-600 dark:text-amber-300">
                Already emailed {minutesSinceLastEmail <= 1 ? 'less than a minute ago' : `${minutesSinceLastEmail} minutes ago`}. The
                same subject and wording again this soon usually ends up in spam — change the subject or wait before sending.
              </div>
            )}

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
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Requirements form
                </label>
                <select
                  value={emailRequirements}
                  onChange={(e) => setEmailRequirements(e.target.value)}
                  className="w-full px-3 py-2.5 glass-input rounded-xl text-sm dark:text-white"
                >
                  <option value="">No form — plain email</option>
                  <option value="website">Website project requirements</option>
                  <option value="mobile">Mobile app requirements</option>
                  <option value="desktop">Desktop app requirements</option>
                </select>
                <p className="mt-1.5 text-[11px] text-muted leading-relaxed">
                  The customer gets a link in the email to tick exactly what they need. Their answers appear under
                  Requirements, ready for a quote.
                </p>
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
                Concept IT Solutions — {SIGNATURE_SERVICE_LINE}<br />
                Our own site: {COMPANY_SITE}
                {companySignature.optOut && (
                  <>
                    <br />
                    {companySignature.disclosure} {companySignature.optOut}
                  </>
                )}
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

      {/* Every WhatsApp contact is stored with its conversation screenshots */}
      {proofLead && (
        <WhatsAppProofModal
          open={Boolean(proofLead)}
          lead={proofLead}
          currentUser={currentUser}
          onClose={() => setProofLead(null)}
          onSaved={handleWhatsAppProofSaved}
        />
      )}
    </div>
  );
}

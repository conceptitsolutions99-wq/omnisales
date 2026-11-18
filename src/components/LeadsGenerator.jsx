import React, { useState } from 'react';
import { searchLeads } from '../lib/leads';
import {
  Users,
  MapPin,
  Search,
  Filter,
  Plus,
  PhoneCall,
  Globe,
  Building2,
  Sparkles,
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  DollarSign,
  RefreshCw,
  Database,
  ClipboardList,
  AtSign,
  ExternalLink
} from 'lucide-react';

const CATEGORY_OPTIONS = [
  { value: 'offices', label: 'Offices' },
  { value: 'professional', label: 'Professional services' },
  { value: 'retail', label: 'Retail & shops' },
  { value: 'food', label: 'Restaurants & cafés' },
  { value: 'health', label: 'Health & dental' },
  { value: 'trades', label: 'Trades & repair' },
];

export default function LeadsGenerator({
  leads,
  setLeads,
  setActiveTab,
  onSelectLeadForCall,
  currentUser,
  callLogs,
  requirementEvents = {},
  onOpenRequirements
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [countryFilter, setCountryFilter] = useState('All');
  const [sizeFilter, setSizeFilter] = useState('All');
  const [solutionFilter, setSolutionFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [websiteFilter, setWebsiteFilter] = useState('All');
  const [emailFilter, setEmailFilter] = useState('All');
  const [contactFilter, setContactFilter] = useState('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isFetchingLive, setIsFetchingLive] = useState(false);
  const [fetchMessage, setFetchMessage] = useState('');
  const [fetchCity, setFetchCity] = useState('Toronto');
  const [fetchCategory, setFetchCategory] = useState('offices');
  // Picking a country can pre-select the category that country's listings are richest in, but
  // only until the agent chooses a category themselves
  const [categoryChosenByAgent, setCategoryChosenByAgent] = useState(false);
  const [emailBusy, setEmailBusy] = useState({});
  const [emailLookupMessage, setEmailLookupMessage] = useState('');

  // Egyptian OpenStreetMap coverage is thin for offices and dense for shops and restaurants, so
  // choosing Egypt moves the search there; leaving it restores offices unless the agent picked
  // a category of their own in the meantime
  const EGYPT_SEARCH_CATEGORY = 'retail';

  const handleCountryChange = (value) => {
    setCountryFilter(value);
    if (value === 'Egypt') {
      setFetchCategory(EGYPT_SEARCH_CATEGORY);
      setCategoryChosenByAgent(false);
      return;
    }
    if (!categoryChosenByAgent && fetchCategory === EGYPT_SEARCH_CATEGORY) setFetchCategory('offices');
  };

  // New lead form state
  const [newLead, setNewLead] = useState({
    name: '',
    company: '',
    phone: '',
    displayPhone: '',
    email: '',
    country: 'Canada',
    region: 'Ontario (Toronto)',
    size: 'Medium',
    solution: 'Website',
    value: 15000,
    notes: ''
  });

  const handleAddLead = (e) => {
    e.preventDefault();
    if (!newLead.name || !newLead.company || !newLead.phone) return;

    const cleanPhone = newLead.phone.replace(/[^+\d]/g, '');
    const leadToAdd = {
      id: Date.now(),
      ...newLead,
      phone: cleanPhone,
      displayPhone: newLead.phone,
      status: 'New',
      createdAt: new Date().toISOString().split('T')[0]
    };

    setLeads([leadToAdd, ...leads]);
    setIsAddModalOpen(false);
    setNewLead({
      name: '',
      company: '',
      phone: '',
      displayPhone: '',
      email: '',
      country: 'Canada',
      region: 'Ontario (Toronto)',
      size: 'Medium',
      solution: 'Website',
      value: 15000,
      notes: ''
    });
  };

  // Each search walks a little further through the provider's results, otherwise a second
  // search in the same city only ever sees businesses that are already in the list.
  const OFFSET_KEY = 'omnisales_lead_offsets';
  const nextSearchOffset = (city, category) => {
    try {
      const map = JSON.parse(localStorage.getItem(OFFSET_KEY) || '{}');
      const key = `${city.toLowerCase()}|${category}`;
      const offset = Number(map[key] || 0);
      map[key] = (offset + 20) % 200;
      localStorage.setItem(OFFSET_KEY, JSON.stringify(map));
      return offset;
    } catch (err) {
      return 0;
    }
  };

  // Pull real businesses (with a published phone number) from OpenStreetMap's Overpass API
  const handleFetchLiveLeads = async () => {
    const city = fetchCity.trim();
    const categoryLabel = CATEGORY_OPTIONS.find(option => option.value === fetchCategory)?.label || 'businesses';

    if (city.length < 2) {
      setFetchMessage('Enter a city or region to search, for example Toronto, Dallas or Cairo.');
      return;
    }

    setIsFetchingLive(true);
    setFetchMessage(`Searching OpenStreetMap for ${categoryLabel} in ${city}…`);

    try {
      // Places already saved never need their details bought again, so the search is told
      // which ids are on file before it spends anything
      const data = await searchLeads({
        city,
        category: fetchCategory,
        limit: 30,
        country: countryFilter === 'All' ? '' : countryFilter,
        offset: nextSearchOffset(city, fetchCategory),
        knownIds: new Set(leads.map(lead => lead.id)),
        // A business saved from OpenStreetMap comes back with a Geoapify id, so its name and
        // position travel too and it is recognised before its details are bought
        knownPlaces: leads.map(lead => ({ name: lead.name || lead.company, lat: lead.lat, lon: lead.lon })),
        // A saved number identifies the same business even when its name reaches us differently
        knownPhones: new Set(leads.map(lead => lead.phone).filter(Boolean)),
      });

      const fetched = Array.isArray(data.leads) ? data.leads : [];
      if (fetched.length === 0 && data.allKnown) {
        setFetchMessage(
          `All ${data.skippedKnown} results for ${city} are already in your list, so no credits were spent. Search again to move to the next page.` +
            (data.areaLimited ? ' The map was queried around the city centre to keep it fast — try a district name to cover another part of the city.' : '')
        );
        setTimeout(() => setFetchMessage(''), 10000);
        return;
      }
      if (fetched.length === 0) {
        setFetchMessage(
          `No ${categoryLabel.toLowerCase()} with a published phone or email were found in ${city}. Try another city or category.` +
            (data.areaLimited ? ' The map was queried around the city centre to keep it fast — try a district name to cover another part of the city.' : '')
        );
        return;
      }

      // Businesses that publish an email but no phone have no number to compare, so the email
      // stands in for it when deciding what is already in the list
      const leadKey = (lead) => (lead.phone ? `phone:${lead.phone}` : `email:${String(lead.email || '').toLowerCase()}`);
      const existingKeys = new Set(leads.map(leadKey));
      const fresh = fetched.filter(lead => !existingKeys.has(leadKey(lead)));
      const skipped = fetched.length - fresh.length + (data.skippedKnown || 0);

      if (fresh.length > 0) setLeads(prev => [...fresh, ...prev]);

      const areaNote = data.areaLimited ? ' The map was queried around the city centre to keep it fast — try a district name for another part of the city.' : '';

      setFetchMessage(
        fresh.length > 0
          ? `Added ${fresh.length} real business leads from ${city} (${data.attribution || '© OpenStreetMap contributors'}).` +
              (skipped ? ` ${skipped} already in your list were skipped.` : '') +
              areaNote
          : `No new businesses this time: all ${skipped} results are already in your list. Search again to move on to the next page, or switch category.`
      );
      setTimeout(() => setFetchMessage(''), 10000);
    } catch (err) {
      setFetchMessage(
        err.message === 'Failed to fetch'
                      ? 'Cannot reach the map service. Check your connection and try again.'
          : err.message
      );
    } finally {
      setIsFetchingLive(false);
    }
  };

  // Reads the contact address off the lead's own website. The fetch runs on the server because
  // a page on another domain cannot be read from the browser.
  const lookupEmail = async (website) => {
    const response = await fetch('/api/find-email', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ website })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'That website could not be read.');
    return Array.isArray(data.emails) ? data.emails : [];
  };

  const handleFindEmail = async (lead) => {
    if (!lead.website || emailBusy[lead.id]) return;
    setEmailBusy(prev => ({ ...prev, [lead.id]: true }));
    try {
      const emails = await lookupEmail(lead.website);
      if (emails.length === 0) {
        setEmailLookupMessage(`${lead.company} does not publish an email address on ${lead.website}.`);
      } else {
        setLeads(prev =>
          prev.map(item => (item.id === lead.id ? { ...item, email: emails[0], altEmails: emails.slice(1) } : item))
        );
        setEmailLookupMessage(`Added ${emails[0]} for ${lead.company}.`);
      }
    } catch (err) {
      setEmailLookupMessage(err.message);
    } finally {
      setEmailBusy(prev => {
        const next = { ...prev };
        delete next[lead.id];
        return next;
      });
      setTimeout(() => setEmailLookupMessage(''), 9000);
    }
  };

  // Every visible lead that has a website but no address yet, four sites at a time
  const handleFindMissingEmails = async () => {
    const targets = visibleLeads.filter(lead => !lead.email && lead.website);
    if (targets.length === 0) {
      setEmailLookupMessage('Every lead with a website already has an email address.');
      return;
    }

    setEmailLookupMessage(`Checking ${targets.length} website${targets.length === 1 ? '' : 's'} for contact addresses…`);
    let found = 0;
    let checked = 0;

    for (let i = 0; i < targets.length; i += 4) {
      const chunk = targets.slice(i, i + 4);
      const results = await Promise.all(
        chunk.map(async (lead) => {
          try {
            return { lead, emails: await lookupEmail(lead.website) };
          } catch (err) {
            return { lead, emails: [] };
          }
        })
      );

      const withEmail = results.filter(result => result.emails.length > 0);
      if (withEmail.length > 0) {
        const byId = new Map(withEmail.map(result => [result.lead.id, result.emails]));
        setLeads(prev =>
          prev.map(item => {
            const emails = byId.get(item.id);
            return emails ? { ...item, email: emails[0], altEmails: emails.slice(1) } : item;
          })
        );
        found += withEmail.length;
      }
      checked += chunk.length;
      setEmailLookupMessage(`Checked ${checked} of ${targets.length} websites — ${found} email${found === 1 ? '' : 's'} found.`);
    }

    setEmailLookupMessage(`Finished: ${found} email${found === 1 ? '' : 's'} found on ${checked} website${checked === 1 ? '' : 's'}.`);
    setTimeout(() => setEmailLookupMessage(''), 12000);
  };

  // The list is shared, so everyone works from the same leads: an employee can see that a
  // colleague already emailed a business instead of writing to it twice
  const isAdmin = currentUser.role === 'Admin' || currentUser.permissions.admin;
  const visibleLeads = leads;

  // Filter logic
  const filteredLeads = visibleLeads.filter(lead => {
    const matchesSearch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          lead.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          lead.phone.includes(searchTerm) ||
                          lead.region.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (lead.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCountry = countryFilter === 'All' || lead.country === countryFilter;
    const matchesSize = sizeFilter === 'All' || lead.size === sizeFilter;
    const matchesSolution = solutionFilter === 'All' || lead.solution === solutionFilter;
    const matchesStatus = statusFilter === 'All' || lead.status === statusFilter;
    const matchesWebsite =
      websiteFilter === 'All' ||
      (websiteFilter === 'NoWebsite' ? !lead.website : Boolean(lead.website));

    const matchesEmail =
      emailFilter === 'All' ||
      (emailFilter === 'WithEmail' ? Boolean(lead.email) : !lead.email);
    const matchesContact =
      contactFilter === 'All' ||
      (contactFilter === 'None' ? !lead.contactedBy : lead.contactedBy === contactFilter);

    return matchesSearch && matchesCountry && matchesSize && matchesSolution && matchesStatus && matchesWebsite && matchesEmail && matchesContact;
  });

  // The employees who have contacted someone in this list, so the filter only offers real names
  const contactedByNames = [...new Set(visibleLeads.map(lead => lead.contactedBy).filter(Boolean))].sort();

  const noWebsiteCount = visibleLeads.filter(lead => !lead.website).length;
  const emailCount = visibleLeads.filter(lead => lead.email).length;
  const missingEmailCount = visibleLeads.filter(lead => !lead.email && lead.website).length;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Deal Completed':
        return <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-semibold flex items-center w-max"><CheckCircle className="w-3 h-3 mr-1" /> Deal Completed</span>;
      case 'Considering':
        return <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold flex items-center w-max"><Clock className="w-3 h-3 mr-1" /> Considering</span>;
      case 'Qualified':
        return <span className="px-2.5 py-1 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-semibold flex items-center w-max"><Sparkles className="w-3 h-3 mr-1" /> Qualified</span>;
      case 'Contacted':
        return <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 rounded-full text-xs font-semibold flex items-center w-max"><PhoneCall className="w-3 h-3 mr-1" /> Contacted</span>;
      case 'Denied':
        return <span className="px-2.5 py-1 bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded-full text-xs font-semibold flex items-center w-max"><XCircle className="w-3 h-3 mr-1" /> Denied</span>;
      default:
        return <span className="px-2.5 py-1 glass-soft text-[var(--text-primary)]/80 rounded-full text-xs font-semibold flex items-center w-max">New</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center">
            <Users className="w-7 h-7 mr-2 text-blue-600" />
            Leads Generator Sub-System ({isAdmin ? 'All Leads' : 'My Leads'})
          </h1>
          <p className="text-sm text-muted mt-1">
            {isAdmin
              ? 'Admin View: the team\'s shared leads for Canada, the USA and Egypt (Websites, Web Portals, Mobile Apps), with each contact credited to the employee who made it.'
              : `Team View: the same shared leads the admins see. Logged in as ${currentUser.name}.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
            <input
              type="text"
              value={fetchCity}
              onChange={(e) => setFetchCity(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFetchLiveLeads();
              }}
              placeholder="City (e.g. Toronto, Cairo)"
              className="w-44 pl-8 pr-3 py-2.5 glass-input rounded-xl text-sm"
            />
          </div>
          <select
            value={fetchCategory}
            onChange={(e) => {
              setFetchCategory(e.target.value);
              setCategoryChosenByAgent(true);
            }}
            title={countryFilter === 'Egypt' ? 'Shops, restaurants and clinics are the best covered listings in Egypt' : undefined}
            className="py-2.5 px-3 glass-input rounded-xl text-sm"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            onClick={handleFetchLiveLeads}
            disabled={isFetchingLive}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl shadow-md transition-all flex items-center space-x-2 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isFetchingLive ? 'animate-spin' : ''}`} />
            <span>{isFetchingLive ? 'Searching...' : 'Fetch Real Business Leads'}</span>
          </button>
          <button
            onClick={handleFindMissingEmails}
            disabled={missingEmailCount === 0}
            title="Read the contact address published on each lead's own website"
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-xl shadow-md transition-all flex items-center space-x-2 text-sm"
          >
            <AtSign className="w-4 h-4" />
            <span>Find Missing Emails ({missingEmailCount})</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-md transition-all flex items-center space-x-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Lead Manually</span>
          </button>
        </div>

        {countryFilter === 'Egypt' && (
          <p className="text-[11px] text-muted">
            Egyptian listings are richest in shops, restaurants and clinics, so the search starts on
            {' '}<span className="font-semibold text-[var(--text-primary)]">Retail &amp; shops</span>. Choose another category above to override it.
          </p>
        )}
      </div>

      {fetchMessage && (
        <div className="p-4 accent-pill border border-blue-200 dark:border-blue-900 rounded-2xl text-xs text-blue-800 dark:text-blue-300 font-medium flex items-center space-x-2">
          <Database className="w-4 h-4 text-blue-600 animate-pulse" />
          <span>{fetchMessage}</span>
        </div>
      )}

      {emailLookupMessage && (
        <div className="p-4 accent-pill border border-emerald-200 dark:border-emerald-900 rounded-2xl text-xs text-emerald-800 dark:text-emerald-300 font-medium flex items-center space-x-2">
          <AtSign className="w-4 h-4 text-emerald-600" />
          <span>{emailLookupMessage}</span>
        </div>
      )}

      {/* Filters & Search Bar */}
      <div className="glass p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative col-span-1 sm:col-span-2">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder="Search by name, company, phone, or region..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:text-white"
            />
          </div>

          {/* Country Filter */}
          <div>
            <select
              value={countryFilter}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="w-full py-2.5 px-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:text-white"
            >
              <option value="All">All Countries</option>
              <option value="Canada">Canada</option>
              <option value="USA">USA</option>
              <option value="Egypt">Egypt</option>
            </select>
          </div>

          {/* Size Filter */}
          <div>
            <select
              value={sizeFilter}
              onChange={(e) => setSizeFilter(e.target.value)}
              className="w-full py-2.5 px-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:text-white"
            >
              <option value="All">All Business Sizes</option>
              <option value="Small">Small Business</option>
              <option value="Medium">Medium Business</option>
              <option value="Large">Large Enterprise</option>
            </select>
          </div>

          {/* Solution Filter */}
          <div>
            <select
              value={solutionFilter}
              onChange={(e) => setSolutionFilter(e.target.value)}
              className="w-full py-2.5 px-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:text-white"
            >
              <option value="All">All IT Solutions</option>
              <option value="Website">Website</option>
              <option value="Web Portal">Web Portal</option>
              <option value="Mobile App">Mobile App</option>
            </select>
          </div>

          {/* Website Filter: a business with no site is the easiest website sale */}
          <div>
            <select
              value={websiteFilter}
              onChange={(e) => setWebsiteFilter(e.target.value)}
              className="w-full py-2.5 px-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:text-white"
            >
              <option value="All">Any Website Status</option>
              <option value="NoWebsite">No website — best prospects</option>
              <option value="HasWebsite">Already has a website</option>
            </select>
          </div>

          {/* Email Filter: narrows the list to the leads outreach can actually reach */}
          <div>
            <select
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              className="w-full py-2.5 px-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:text-white"
            >
              <option value="All">Any Email Status</option>
              <option value="WithEmail">Has an email — ready to write</option>
              <option value="NoEmail">No email yet</option>
            </select>
          </div>

          {/* Contact Filter: whose last contact this was, so a manager can review one person */}
          <div>
            <select
              value={contactFilter}
              onChange={(e) => setContactFilter(e.target.value)}
              className="w-full py-2.5 px-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:text-white"
            >
              <option value="All">Contacted by anyone</option>
              <option value="None">Not contacted yet</option>
              {contactedByNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[var(--glass-border)] text-xs text-muted">
          <span>
            Showing <strong>{filteredLeads.length}</strong> of <strong>{visibleLeads.length}</strong> leads
            <span className="text-emerald-500/90"> · <strong>{emailCount}</strong> with an email</span>
            {noWebsiteCount > 0 && (
              <span className="text-amber-400/90"> · <strong>{noWebsiteCount}</strong> have no website</span>
            )}
            <span className="opacity-60"> · lead data © OpenStreetMap contributors</span>
          </span>
          <div className="flex items-center space-x-2">
            <span>Status Filter:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="py-1 px-2 glass-input rounded-lg text-xs dark:text-white"
            >
              <option value="All">All Statuses</option>
              <option value="New">New</option>
              <option value="Contacted">Contacted</option>
              <option value="Qualified">Qualified</option>
              <option value="Considering">Considering</option>
              <option value="Deal Completed">Deal Completed</option>
              <option value="Denied">Denied</option>
            </select>
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <div className="glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="glass-head text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="py-3.5 px-4">Contact & Company</th>
                <th className="py-3.5 px-4">Phone & Region</th>
                <th className="py-3.5 px-4">Size & Solution</th>
                <th className="py-3.5 px-4">Potential Value</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07] text-sm">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-12 text-muted">
                    No leads found matching your filters. Click "Fetch Live Business Leads (API)" to ingest live leads.
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="row-hover transition-colors">
                    <td className="py-4 px-4">
                      <div className="font-semibold text-[var(--text-primary)]">{lead.name}</div>
                      <div className="text-xs text-muted flex items-center mt-0.5">
                        <Building2 className="w-3 h-3 mr-1 text-muted" /> {lead.company}
                      </div>
                      {lead.email ? (
                        <div className="text-xs mt-1 flex items-center text-emerald-600 dark:text-emerald-400">
                          <AtSign className="w-3 h-3 mr-1 shrink-0" />
                          <span className="truncate max-w-[190px]" title={lead.email}>{lead.email}</span>
                        </div>
                      ) : lead.website ? (
                        <button
                          onClick={() => handleFindEmail(lead)}
                          disabled={Boolean(emailBusy[lead.id])}
                          title={`Read the contact address published on ${lead.website}`}
                          className="mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold border border-amber-400/30 bg-amber-400/15 text-amber-300 inline-flex items-center disabled:opacity-60"
                        >
                          <AtSign className="w-3 h-3 mr-1" />
                          {emailBusy[lead.id] ? 'Looking…' : 'Find email'}
                        </button>
                      ) : (
                        <div className="text-[10px] text-muted mt-1">
                          {lead.facebook || lead.instagram
                            ? 'no email on file · check the social page'
                            : 'no email · no website to check'}
                        </div>
                      )}
                      {(lead.facebook || lead.instagram) && (
                        <div className="flex items-center gap-2 mt-1 text-[10px] font-semibold">
                          {lead.facebook && (
                            <a
                              href={lead.facebook.startsWith('http') ? lead.facebook : `https://${lead.facebook}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Open the Facebook page — its About tab shows contact details"
                              className="text-blue-500 hover:underline inline-flex items-center"
                            >
                              <ExternalLink className="w-3 h-3 mr-0.5" /> Facebook
                            </a>
                          )}
                          {lead.instagram && (
                            <a
                              href={lead.instagram.startsWith('http') ? lead.instagram : `https://${lead.instagram}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Open the Instagram profile — the bio often lists an email"
                              className="text-pink-500 hover:underline inline-flex items-center"
                            >
                              <ExternalLink className="w-3 h-3 mr-0.5" /> Instagram
                            </a>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-mono text-xs font-medium text-[var(--text-primary)]">{lead.displayPhone || lead.phone}</div>
                      <div className="text-xs text-muted flex items-center mt-0.5">
                        <Globe className="w-3 h-3 mr-1 text-blue-500" /> {lead.country} • {lead.region}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      {lead.size && lead.size !== 'Unknown' && (
                        <span className="inline-block px-2 py-0.5 glass-soft text-[var(--text-primary)]/80 rounded text-xs font-medium mb-1">
                          {lead.size} Business
                        </span>
                      )}
                      <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {lead.solution || <span className="text-muted font-normal">Not specified</span>}
                      </div>
                      {lead.website ? (
                        <a
                          href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-muted hover:text-[var(--text-primary)] underline underline-offset-2"
                        >
                          website on file
                        </a>
                      ) : (
                        <span
                          title="No website on file — the strongest prospect for a website project"
                          className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400/15 text-amber-300 border border-amber-400/30"
                        >
                          <Globe className="w-3 h-3" />
                          No website
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 font-semibold text-[var(--text-primary)]">
                      {lead.value ? `$${lead.value.toLocaleString()}` : <span className="text-muted font-normal">—</span>}
                    </td>
                    <td className="py-4 px-4">
                      {getStatusBadge(lead.status)}
                      {lead.contactedBy && (
                        <div className="text-[10px] text-muted mt-1">
                          {lead.contactedBy}
                          {lead.contactedAt ? ` · ${new Date(lead.contactedAt).toLocaleDateString()}` : ''}
                        </div>
                      )}
                      {(() => {
                        const event =
                          requirementEvents[`id:${lead.id}`] ||
                          requirementEvents[`email:${(lead.email || '').toLowerCase()}`];
                        if (!event) return null;
                        return (
                          <button
                            onClick={onOpenRequirements}
                            title={
                              event.submittedAt
                                ? `Requirements submitted ${new Date(event.submittedAt).toLocaleString()} — open to price a quote`
                                : 'Requirements form sent, waiting for answers'
                            }
                            className={`mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold inline-flex items-center gap-1 border ${
                              event.submittedAt
                                ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30'
                                : 'bg-amber-400/15 text-amber-300 border-amber-400/30'
                            }`}
                          >
                            <ClipboardList className="w-3 h-3" />
                            {event.submittedAt ? 'Requirements in' : 'Form sent'}
                          </button>
                        );
                      })()}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button
                        onClick={() => {
                          onSelectLeadForCall(lead);
                          setActiveTab('dialler');
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-all inline-flex items-center space-x-1.5 shadow-sm"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        <span>Call Now</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Lead Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xl p-4">
          <div className="w-full max-w-lg glass-strong overflow-hidden">
            <div className="p-6 border-b border-[var(--glass-border)] flex items-center justify-between">
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Add New Business Lead</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-muted hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddLead} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">Contact Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Doe"
                    value={newLead.name}
                    onChange={(e) => setNewLead({...newLead, name: e.target.value})}
                    className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">Company Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Acme Corp"
                    value={newLead.company}
                    onChange={(e) => setNewLead({...newLead, company: e.target.value})}
                    className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="+1 (416) 555-0199"
                    value={newLead.phone}
                    onChange={(e) => setNewLead({...newLead, phone: e.target.value})}
                    className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="john@acmecorp.com"
                    value={newLead.email}
                    onChange={(e) => setNewLead({...newLead, email: e.target.value})}
                    className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">Country</label>
                  <select
                    value={newLead.country}
                    onChange={(e) => setNewLead({...newLead, country: e.target.value})}
                    className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white"
                  >
                    <option value="Canada">Canada</option>
                    <option value="USA">USA</option>
                    <option value="Egypt">Egypt</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">Region / State</label>
                  <input
                    type="text"
                    placeholder="Ontario (Toronto)"
                    value={newLead.region}
                    onChange={(e) => setNewLead({...newLead, region: e.target.value})}
                    className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">Business Size</label>
                  <select
                    value={newLead.size}
                    onChange={(e) => setNewLead({...newLead, size: e.target.value})}
                    className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white"
                  >
                    <option value="Small">Small</option>
                    <option value="Medium">Medium</option>
                    <option value="Large">Large</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">IT Solution Interest</label>
                  <select
                    value={newLead.solution}
                    onChange={(e) => setNewLead({...newLead, solution: e.target.value})}
                    className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white"
                  >
                    <option value="Website">Website</option>
                    <option value="Web Portal">Web Portal</option>
                    <option value="Mobile App">Mobile App</option>
                  </select>
                </div>
                <div>
                  <label className="block z-0 block text-xs font-semibold uppercase tracking-wider text-muted mb-1">Est. Value ($ USD/CAD)</label>
                  <input
                    type="number"
                    value={newLead.value}
                    onChange={(e) => setNewLead({...newLead, value: Number(e.target.value)})}
                    className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">Initial Notes</label>
                <textarea
                  rows="3"
                  placeholder="Notes about business needs..."
                  value={newLead.notes}
                  onChange={(e) => setNewLead({...newLead, notes: e.target.value})}
                  className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white resize-none"
                ></textarea>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-[var(--glass-border)]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 glass-soft text-[var(--text-primary)]/80 rounded-xl text-sm font-medium hover:bg-white/15 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium shadow-md transition-all"
                >
                  Save Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

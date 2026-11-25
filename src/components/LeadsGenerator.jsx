import React, { useState, useEffect, useRef } from 'react';
import { searchLeadsAcrossMarkets } from '../lib/leads';
import { LEAD_MARKETS, planAreaSearch } from '../lib/lead-markets.mjs';
import { isWhatsAppLead, leadChannels } from '../lib/contact-channels';
import { nonProspectReason } from '../lib/lead-filters.mjs';
import { deleteSharedLeads, restoreSharedLeads } from '../lib/leads-api';
import {
  Users,
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
  ExternalLink,
  MessageCircle,
  Trash2,
  Undo2
} from 'lucide-react';

// A bulk delete is easy to trigger by accident, so a deleted batch stays in hand briefly
const UNDO_WINDOW_MS = 30000;

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
  // Most generated listings publish only a switchboard landline, so the list can be narrowed to
  // the channels outreach can actually use
  const [channelFilter, setChannelFilter] = useState('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isFetchingLive, setIsFetchingLive] = useState(false);
  const [fetchMessage, setFetchMessage] = useState('');
  const [fetchCategory, setFetchCategory] = useState('offices');
  // Picking a country can pre-select the category that country's listings are richest in, but
  // only until the agent chooses a category themselves
  const [categoryChosenByAgent, setCategoryChosenByAgent] = useState(false);
  const [emailBusy, setEmailBusy] = useState({});
  const [emailLookupMessage, setEmailLookupMessage] = useState('');
  // Deleting is an admin action, and it applies to the whole team's list
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  // The batch just deleted, and the moment its undo stops being offered
  const [deletedBatch, setDeletedBatch] = useState(null);
  const [undoSeconds, setUndoSeconds] = useState(0);
  const [isRestoring, setIsRestoring] = useState(false);
  const undoDeadline = useRef(0);

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

  // Which areas each country searches next. The sweep continues across sessions, so a country is
  // covered region by region instead of every search landing in the same city.
  const AREA_CURSOR_KEY = 'omnisales_country_area_cursors';
  const readAreaCursors = () => {
    try {
      return JSON.parse(localStorage.getItem(AREA_CURSOR_KEY) || '{}');
    } catch (err) {
      return {};
    }
  };
  const saveAreaCursors = (cursors) => {
    try {
      localStorage.setItem(AREA_CURSOR_KEY, JSON.stringify(cursors));
    } catch (err) {
      // A browser with storage disabled still gets its search; only the sweep position is lost
    }
  };

  // Each search walks a little further through the provider's results, otherwise a second
  // search in the same area only ever sees businesses that are already in the list.
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

  // Pull real businesses from OpenStreetMap's Overpass API, falling back to Geoapify. Every fetch
  // sweeps a couple of areas in each selected country and advances a cursor, so repeated searches
  // spread the list across the whole country instead of pinning one city to each market.
  const handleFetchLiveLeads = async () => {
    const countries = countryFilter === 'All' ? LEAD_MARKETS.map(market => market.country) : [countryFilter];
    const mixed = countries.length > 1;
    const categoryLabel = CATEGORY_OPTIONS.find(option => option.value === fetchCategory)?.label || 'businesses';

    const plan = planAreaSearch(countries, readAreaCursors());
    saveAreaCursors(plan.nextCursors);

    // Egyptian listings are richest in shops and restaurants, so the sweep uses the same default
    // the country picker applies, unless the agent chose a category themselves.
    const markets = plan.markets.map(market => ({
      ...market,
      category: market.country === 'Egypt' && !categoryChosenByAgent ? EGYPT_SEARCH_CATEGORY : fetchCategory
    }));

    // Every area walks its own results, so the second sweep does not repeat the first
    const offsets = {};
    for (const market of markets) offsets[market.city] = nextSearchOffset(market.city, market.category);

    setIsFetchingLive(true);
    setFetchMessage(`Searching ${markets.map(market => market.city).join(', ')} for ${categoryLabel.toLowerCase()}…`);

    try {
      // Places already saved never need their details bought again, so the search is told
      // which ids are on file before it spends anything
      const data = await searchLeadsAcrossMarkets({
        markets,
        category: fetchCategory,
        limit: 6,
        offsets,
        knownIds: new Set(leads.map(lead => lead.id)),
        // A business saved from OpenStreetMap comes back with a Geoapify id, so its name and
        // position travel too and it is recognised before its details are bought
        knownPlaces: leads.map(lead => ({ name: lead.name || lead.company, lat: lead.lat, lon: lead.lon })),
        // A saved number identifies the same business even when its name reaches us differently
        knownPhones: new Set(leads.map(lead => lead.phone).filter(Boolean)),
      });

      const fetched = Array.isArray(data.leads) ? data.leads : [];

      // A single-country sweep keeps its specific error, because that is the one thing the agent
      // can act on (a rejected key, a busy map server, thin coverage)
      if (!mixed && data.markets.every(market => market.error)) {
        throw new Error(data.markets[0].error);
      }

      if (fetched.length === 0 && data.allKnown) {
        setFetchMessage(
          'Every result in these areas is already in your list, so no credits were spent. Search again to sweep the next areas.' +
            (data.areaLimited ? ' The map was queried around each city centre to keep it fast.' : '')
        );
        setTimeout(() => setFetchMessage(''), 10000);
        return;
      }
      if (fetched.length === 0) {
        const details = data.markets
          .map(market =>
            `${market.city}${market.error ? `: ${market.error}` : market.allKnown ? ': all results already saved' : ': none with contact details'}`
          )
          .join(' · ');
        setFetchMessage(`No new leads this time — ${details}. Try another category.`);
        return;
      }

      // Businesses that publish an email but no phone have no number to compare, so the email
      // stands in for it when deciding what is already in the list
      const leadKey = (lead) => (lead.phone ? `phone:${lead.phone}` : `email:${String(lead.email || '').toLowerCase()}`);
      const existingKeys = new Set(leads.map(leadKey));
      const fresh = fetched.filter(lead => !existingKeys.has(leadKey(lead)));
      const skipped = fetched.length - fresh.length + (data.skippedKnown || 0);

      if (fresh.length > 0) {
        setLeads(prev => [...fresh, ...prev]);
        // A fresh list is mostly phone-only until each business's own site is read, so it is read
        // straight away instead of waiting for the agent to press the button afterwards
        enrichMany(fresh).then(result => {
          if (result.checked === 0) return;
          setEmailLookupMessage(
            `Read ${result.checked} website${result.checked === 1 ? '' : 's'}: added ${result.emails} email${result.emails === 1 ? '' : 's'}, ` +
              `${result.socials} social page${result.socials === 1 ? '' : 's'} and ${result.whatsapp} WhatsApp number${result.whatsapp === 1 ? '' : 's'}.`
          );
          setTimeout(() => setEmailLookupMessage(''), 12000);
        });
      }

      const areaNote = data.areaLimited ? ' The map was queried around the city centre to keep it fast — try a district name for another part of the city.' : '';

      const byCountry = fresh.reduce((counts, lead) => {
        const key = lead.country || 'Other';
        counts[key] = (counts[key] || 0) + 1;
        return counts;
      }, {});
      const spread = countries.map(country => `${country} ${byCountry[country] || 0}`).join(' · ');
      const failedMarkets = data.markets.filter(market => market.error);
      // Consulates, government offices and landmarks publish a switchboard number like a business
      // does, so the fetch drops them and says how many it left out
      const nonProspects = data.skippedNonProspects || 0;
      const nonProspectsNote = nonProspects > 0
        ? ` ${nonProspects} consulate, government or landmark listing${nonProspects === 1 ? '' : 's'} kept out.`
        : '';
      const searched = markets.map(market => market.city).join(', ');

      setFetchMessage(
        fresh.length > 0
          ? `Added ${fresh.length} real business lead${fresh.length === 1 ? '' : 's'} ` +
              (mixed ? `across ${spread}` : `in ${countries[0]}`) +
              ` (searched ${searched}).` +
              (skipped ? ` ${skipped} already in your list were skipped.` : '') +
              (failedMarkets.length
                ? ` Could not search ${failedMarkets.map(market => `${market.city} (${market.error})`).join(', ')}.`
                : '') +
              areaNote +
              nonProspectsNote
          : `No new businesses this time: all ${skipped} results are already in your list. Search again to sweep the next areas, or switch category.`
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

  // Reads the contact details published on the lead's own website: an address, the social pages
  // and a WhatsApp link. The fetch runs on the server because a page on another domain cannot be
  // read from the browser.
  const lookupContacts = async (website) => {
    const response = await fetch('/api/find-email', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ website })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'That website could not be read.');
    return {
      emails: Array.isArray(data.emails) ? data.emails : [],
      socials: data.socials && typeof data.socials === 'object' ? data.socials : {},
      whatsapp: typeof data.whatsapp === 'string' ? data.whatsapp : ''
    };
  };

  // One website read can add three channels at once, and nothing already on file is replaced
  const applyLookup = (lead, result) => {
    const socials = result?.socials || {};
    const emails = result?.emails || [];
    return {
      ...lead,
      email: lead.email || emails[0] || '',
      altEmails: lead.altEmails?.length ? lead.altEmails : emails.slice(1),
      facebook: lead.facebook || socials.facebook || '',
      instagram: lead.instagram || socials.instagram || '',
      linkedin: lead.linkedin || socials.linkedin || '',
      whatsapp: lead.whatsapp || result?.whatsapp || ''
    };
  };

  const handleFindEmail = async (lead) => {
    if (!lead.website || emailBusy[lead.id]) return;
    setEmailBusy(prev => ({ ...prev, [lead.id]: true }));
    try {
      const result = await lookupContacts(lead.website);
      const next = applyLookup(lead, result);
      const gained = [
        next.email && !lead.email ? next.email : '',
        next.whatsapp && !lead.whatsapp ? 'a WhatsApp number' : '',
        next.facebook && !lead.facebook ? 'a Facebook page' : '',
        next.instagram && !lead.instagram ? 'an Instagram page' : '',
        next.linkedin && !lead.linkedin ? 'a LinkedIn page' : ''
      ].filter(Boolean);

      if (gained.length === 0) {
        setEmailLookupMessage(`${lead.company} publishes no email, social page or WhatsApp link on ${lead.website}.`);
      } else {
        setLeads(prev => prev.map(item => (item.id === lead.id ? applyLookup(item, result) : item)));
        setEmailLookupMessage(`Added ${gained.join(', ')} for ${lead.company}.`);
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

  // Reads each lead's website once and merges whatever it publishes: an address, social pages
  // and a WhatsApp link. Three at a time, because every read is a real page fetch.
  const enrichMany = async (targets, { announce = true } = {}) => {
    const queue = targets.filter(lead => lead.website).slice(0, 12);
    if (queue.length === 0) return { emails: 0, socials: 0, whatsapp: 0, checked: 0 };

    if (announce) {
      setEmailLookupMessage(`Reading ${queue.length} website${queue.length === 1 ? '' : 's'} for emails, social pages and WhatsApp numbers…`);
    }

    let emails = 0;
    let socials = 0;
    let whatsapp = 0;
    let checked = 0;

    for (let i = 0; i < queue.length; i += 3) {
      const chunk = queue.slice(i, i + 3);
      const results = await Promise.all(
        chunk.map(async (lead) => {
          try {
            return { lead, result: await lookupContacts(lead.website) };
          } catch (err) {
            return { lead, result: null };
          }
        })
      );

      const merged = new Map();
      for (const { lead, result } of results) {
        if (!result) continue;
        const next = applyLookup(lead, result);
        if (next.email && !lead.email) emails += 1;
        if (
          (next.facebook && !lead.facebook) ||
          (next.instagram && !lead.instagram) ||
          (next.linkedin && !lead.linkedin)
        ) {
          socials += 1;
        }
        if (next.whatsapp && !lead.whatsapp) whatsapp += 1;
        merged.set(lead.id, next);
      }

      if (merged.size > 0) setLeads(prev => prev.map(item => merged.get(item.id) || item));
      checked += chunk.length;
      if (announce) {
        setEmailLookupMessage(
          `Checked ${checked} of ${queue.length} websites — ${emails} email${emails === 1 ? '' : 's'}, ` +
            `${socials} social page${socials === 1 ? '' : 's'} and ${whatsapp} WhatsApp number${whatsapp === 1 ? '' : 's'} found.`
        );
      }
    }

    return { emails, socials, whatsapp, checked };
  };

  // The bulk button covers the whole visible list, not only the leads a search just added
  const handleFindMissingEmails = async () => {
    const targets = visibleLeads.filter(
      lead => lead.website && (!lead.email || !(lead.facebook || lead.instagram || lead.linkedin))
    );
    if (targets.length === 0) {
      setEmailLookupMessage('Every lead with a website already has an email or a social page.');
      return;
    }

    const result = await enrichMany(targets);
    setEmailLookupMessage(
      `Finished: added ${result.emails} email${result.emails === 1 ? '' : 's'}, ${result.socials} social ` +
        `page${result.socials === 1 ? '' : 's'} and ${result.whatsapp} WhatsApp number${result.whatsapp === 1 ? '' : 's'} ` +
        `from ${result.checked} website${result.checked === 1 ? '' : 's'}.`
    );
    setTimeout(() => setEmailLookupMessage(''), 12000);
  };

  // The list is shared, so everyone works from the same leads: an employee can see that a
  // colleague already emailed a business instead of writing to it twice
  const isAdmin = currentUser.role === 'Admin' || currentUser.permissions.admin;

  const selectedLeads = leads.filter(lead => selectedLeadIds.includes(String(lead.id)));

  const toggleLeadSelection = (id) => {
    const key = String(id);
    setSelectedLeadIds(prev => (prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]));
  };

  const handleDeleteSelected = async () => {
    if (!isAdmin || selectedLeads.length === 0 || isDeleting) return;

    const label = selectedLeads.length === 1 ? `“${selectedLeads[0].name}”` : `${selectedLeads.length} leads`;
    if (!window.confirm(`Delete ${label}? It is removed from the team's list for everyone.`)) return;

    setIsDeleting(true);
    try {
      await deleteSharedLeads(selectedLeads);
      undoDeadline.current = Date.now() + UNDO_WINDOW_MS;
      setDeletedBatch(selectedLeads);
      const gone = new Set(selectedLeads.map(lead => String(lead.id)));
      setLeads(prev => prev.filter(lead => !gone.has(String(lead.id))));
      setSelectedLeadIds([]);
      setFetchMessage(`Deleted ${selectedLeads.length} lead${selectedLeads.length === 1 ? '' : 's'}.`);
      setTimeout(() => setFetchMessage(''), 8000);
    } catch (err) {
      setFetchMessage(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Rows fetched before the filter existed are still in the list. A stored lead keeps no map tags,
  // so the name, and the website when one is on file, are what is checked; the removal goes through
  // the same server call and the same undo window as a manual delete.
  const handleCleanupNonProspects = async () => {
    if (!isAdmin || isDeleting) return;

    const targets = leads.filter(lead =>
      nonProspectReason({ name: lead.name || lead.company || '', website: lead.website || '' })
    );
    if (targets.length === 0) {
      setFetchMessage('No consulates, government offices or landmarks in the list.');
      setTimeout(() => setFetchMessage(''), 8000);
      return;
    }

    const label = `${targets.length} consulate, government office or landmark listing${targets.length === 1 ? '' : 's'}`;
    if (!window.confirm(`Remove ${label} from the team's list for everyone?`)) return;

    setIsDeleting(true);
    try {
      await deleteSharedLeads(targets);
      undoDeadline.current = Date.now() + UNDO_WINDOW_MS;
      // A batch already waiting to be undone stays undoable: the two are offered together
      setDeletedBatch(prev => (prev ? [...prev, ...targets] : targets));
      const gone = new Set(targets.map(lead => String(lead.id)));
      setLeads(prev => prev.filter(lead => !gone.has(String(lead.id))));
      setSelectedLeadIds(prev => prev.filter(id => !gone.has(id)));
      setFetchMessage(`Removed ${label} that are not sales prospects.`);
      setTimeout(() => setFetchMessage(''), 8000);
    } catch (err) {
      setFetchMessage(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // The window closes on its own; the strip disappears instead of lingering as a stale offer.
  // The interval clears itself at zero rather than re-rendering this screen every second while
  // the undo strip is already gone.
  useEffect(() => {
    if (!deletedBatch) return undefined;
    let timer = null;
    let done = false;
    const tick = () => {
      const left = Math.max(0, Math.ceil((undoDeadline.current - Date.now()) / 1000));
      setUndoSeconds(left);
      if (left === 0) {
        done = true;
        if (timer) clearInterval(timer);
        timer = null;
        setDeletedBatch(null);
      }
    };
    tick();
    if (!done) timer = setInterval(tick, 1000);
    return () => {
      done = true;
      if (timer) clearInterval(timer);
    };
  }, [deletedBatch]);

  const handleUndoDelete = async () => {
    if (!deletedBatch || isRestoring) return;

    const batch = deletedBatch;
    setIsRestoring(true);
    try {
      await restoreSharedLeads(batch);
      setLeads(prev => {
        const known = new Set(prev.map(lead => String(lead.id)));
        const add = batch.filter(lead => !known.has(String(lead.id)));
        return add.length ? [...add, ...prev] : prev;
      });
      setDeletedBatch(null);
      setUndoSeconds(0);
      setFetchMessage(`Restored ${batch.length} lead${batch.length === 1 ? '' : 's'} for the team.`);
      setTimeout(() => setFetchMessage(''), 8000);
    } catch (err) {
      setFetchMessage(err.message);
    } finally {
      setIsRestoring(false);
    }
  };
  const visibleLeads = leads;

  // What the one-click cleanup would remove, so the button never invites a click that does nothing
  const nonProspectLeads = visibleLeads.filter(lead =>
    nonProspectReason({ name: lead.name || lead.company || '', website: lead.website || '' })
  );

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
    // The channel filter is the answer to "show me only leads I can actually message"
    const matchesChannel =
      channelFilter === 'All' || Boolean(leadChannels(lead)[channelFilter.toLowerCase()]);

    return (
      matchesSearch &&
      matchesCountry &&
      matchesSize &&
      matchesSolution &&
      matchesStatus &&
      matchesWebsite &&
      matchesEmail &&
      matchesContact &&
      matchesChannel
    );
  });

  // Select-all covers exactly what the filters show, so a country or channel can be cleaned up
  // without touching the rest of the team's list
  const allFilteredSelected =
    filteredLeads.length > 0 && filteredLeads.every(lead => selectedLeadIds.includes(String(lead.id)));

  const toggleSelectAllVisible = () => {
    if (allFilteredSelected) {
      const visibleIds = new Set(filteredLeads.map(lead => String(lead.id)));
      setSelectedLeadIds(prev => prev.filter(id => !visibleIds.has(id)));
      return;
    }
    setSelectedLeadIds(prev => [...new Set([...prev, ...filteredLeads.map(lead => String(lead.id))])]);
  };

  // The employees who have contacted someone in this list, so the filter only offers real names
  const contactedByNames = [...new Set(visibleLeads.map(lead => lead.contactedBy).filter(Boolean))].sort();

  const noWebsiteCount = visibleLeads.filter(lead => !lead.website).length;
  const emailCount = visibleLeads.filter(lead => lead.email).length;
  const whatsappCount = visibleLeads.filter(isWhatsAppLead).length;
  const socialCount = visibleLeads.filter(lead => lead.facebook || lead.instagram || lead.linkedin).length;
  const missingContactCount = visibleLeads.filter(
    lead => lead.website && (!lead.email || !(lead.facebook || lead.instagram || lead.linkedin))
  ).length;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Deal Completed':
        return <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-semibold flex items-center w-max"><CheckCircle className="w-3 h-3 mr-1" /> Deal Completed</span>;
      case 'Replied':
        return <span className="px-2.5 py-1 bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 rounded-full text-xs font-semibold flex items-center w-max"><MessageCircle className="w-3 h-3 mr-1" /> Replied</span>;
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
          {isAdmin && (
            <button
              onClick={handleCleanupNonProspects}
              disabled={isDeleting || nonProspectLeads.length === 0}
              title="Remove the consulates, government offices and landmarks already in the team's list"
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white font-medium rounded-xl shadow-md transition-all flex items-center space-x-2 text-sm"
            >
              <Building2 className="w-4 h-4" />
              <span>Clean Up Consulates &amp; Landmarks ({nonProspectLeads.length})</span>
            </button>
          )}
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
            disabled={missingContactCount === 0}
            title="Read each lead's own website for an email address, social pages and a WhatsApp link"
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-xl shadow-md transition-all flex items-center space-x-2 text-sm"
          >
            <AtSign className="w-4 h-4" />
            <span>Find Emails &amp; Socials ({missingContactCount})</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-md transition-all flex items-center space-x-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Lead Manually</span>
          </button>
          {isAdmin && (
            <button
              onClick={handleDeleteSelected}
              disabled={selectedLeads.length === 0 || isDeleting}
              title="Delete the selected leads from the team's list"
              className="px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-medium rounded-xl shadow-md transition-all flex items-center space-x-2 text-sm"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isDeleting ? 'Deleting…' : `Delete Selected (${selectedLeads.length})`}</span>
            </button>
          )}
        </div>

        {countryFilter === 'All' && (
          <p className="text-[11px] text-muted">
            Each search sweeps two areas across <span className="font-semibold text-[var(--text-primary)]">Canada</span>,
            the <span className="font-semibold text-[var(--text-primary)]">USA</span> and
            {' '}<span className="font-semibold text-[var(--text-primary)]">Egypt</span>, rotating through regions all over
            each country, and merges the results. Search again to sweep the next areas; pick a country to sweep only that one.
          </p>
        )}

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

      {deletedBatch && (
        <div className="p-4 rounded-2xl border border-amber-300/60 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20 text-xs flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
            <Undo2 className="w-4 h-4" />
            Deleted {deletedBatch.length} lead{deletedBatch.length === 1 ? '' : 's'} for the whole team.
            Undo available for {undoSeconds}s.
          </span>
          <button
            onClick={handleUndoDelete}
            disabled={isRestoring}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold"
          >
            {isRestoring ? 'Restoring…' : 'Undo delete'}
          </button>
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
              <option value="All">All Countries (mixed search)</option>
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

          {/* Channel filter: hides the switchboard-only listings outreach cannot use */}
          <div>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="w-full py-2.5 px-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:text-white"
            >
              <option value="All">Any Contact Channel</option>
              <option value="Whatsapp">WhatsApp number on file</option>
              <option value="Email">Has an email</option>
              <option value="Social">Has a social page</option>
              <option value="Website">Has a website</option>
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
            <span className="text-emerald-500/90"> · <strong>{whatsappCount}</strong> on WhatsApp</span>
            <span className="text-blue-500/90"> · <strong>{socialCount}</strong> with a social page</span>
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
                {isAdmin && (
                  <th className="py-3.5 px-3 w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAllVisible}
                      aria-label="Select all leads shown"
                      title="Select every lead the current filters show"
                      className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                    />
                  </th>
                )}
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
                  <td colSpan={isAdmin ? 7 : 6} className="text-center py-12 text-muted">
                    No leads found matching your filters. Click "Fetch Live Business Leads (API)" to ingest live leads.
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="row-hover transition-colors">
                    {isAdmin && (
                      <td className="py-4 px-3 align-top">
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.includes(String(lead.id))}
                          onChange={() => toggleLeadSelection(lead.id)}
                          aria-label={`Select ${lead.name}`}
                          className="mt-1 h-4 w-4 rounded accent-blue-600 cursor-pointer"
                        />
                      </td>
                    )}
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
                      {(lead.facebook || lead.instagram || lead.linkedin) && (
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
                          {lead.linkedin && (
                            <a
                              href={lead.linkedin.startsWith('http') ? lead.linkedin : `https://${lead.linkedin}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Open the LinkedIn page — decision makers can be reached there"
                              className="text-sky-500 hover:underline inline-flex items-center"
                            >
                              <ExternalLink className="w-3 h-3 mr-0.5" /> LinkedIn
                            </a>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-mono text-xs font-medium text-[var(--text-primary)]">{lead.displayPhone || lead.phone}</div>
                      {isWhatsAppLead(lead) && (
                        <span
                          title={`This number was published as a mobile or WhatsApp line — message it on WhatsApp${lead.whatsapp ? ` (${lead.whatsapp})` : ''}`}
                          className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-400/15 text-emerald-300 border border-emerald-400/30"
                        >
                          <MessageCircle className="w-3 h-3" /> WhatsApp
                        </span>
                      )}
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

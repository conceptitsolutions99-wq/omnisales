import React, { useState } from 'react';
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
  Database
} from 'lucide-react';

const CATEGORY_OPTIONS = [
  { value: 'offices', label: 'Offices' },
  { value: 'professional', label: 'Professional services' },
  { value: 'retail', label: 'Retail & shops' },
  { value: 'food', label: 'Restaurants & cafés' },
  { value: 'health', label: 'Health & dental' },
  { value: 'trades', label: 'Trades & repair' },
];

export default function LeadsGenerator({ leads, setLeads, setActiveTab, onSelectLeadForCall, currentUser, callLogs }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [countryFilter, setCountryFilter] = useState('All');
  const [sizeFilter, setSizeFilter] = useState('All');
  const [solutionFilter, setSolutionFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isFetchingLive, setIsFetchingLive] = useState(false);
  const [fetchMessage, setFetchMessage] = useState('');
  const [fetchCity, setFetchCity] = useState('Toronto');
  const [fetchCategory, setFetchCategory] = useState('offices');

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

  // Pull real businesses (with a published phone number) from OpenStreetMap's Overpass API
  const handleFetchLiveLeads = async () => {
    const city = fetchCity.trim();
    const categoryLabel = CATEGORY_OPTIONS.find(option => option.value === fetchCategory)?.label || 'businesses';

    if (city.length < 2) {
      setFetchMessage('Enter a city or region to search, for example Toronto or Dallas.');
      return;
    }

    setIsFetchingLive(true);
    setFetchMessage(`Searching OpenStreetMap for ${categoryLabel} in ${city}…`);

    try {
      const params = new URLSearchParams({
        city,
        category: fetchCategory,
        limit: '30',
        country: countryFilter === 'All' ? '' : countryFilter,
      });

      const response = await fetch(`/api/leads?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Lead search failed (${response.status}).`);

      const fetched = Array.isArray(data.leads) ? data.leads : [];
      if (fetched.length === 0) {
        setFetchMessage(`No ${categoryLabel.toLowerCase()} with a published phone number were found in ${city}. Try another city or category.`);
        return;
      }

      const existingPhones = new Set(leads.map(lead => lead.phone));
      const fresh = fetched.filter(lead => !existingPhones.has(lead.phone));
      const skipped = fetched.length - fresh.length;

      if (fresh.length > 0) setLeads(prev => [...fresh, ...prev]);

      setFetchMessage(
        `Added ${fresh.length} real business leads from ${city} (${data.attribution || '© OpenStreetMap contributors'}).` +
          (skipped ? ` ${skipped} already in your list were skipped.` : '')
      );
      setTimeout(() => setFetchMessage(''), 10000);
    } catch (err) {
      setFetchMessage(
        err.message === 'Failed to fetch'
                      ? 'Cannot reach the lead service. Check your connection and try again.'
          : err.message
      );
    } finally {
      setIsFetchingLive(false);
    }
  };

  // Role-based filtering: Admin sees all leads, employees see only leads they've called
  const isAdmin = currentUser.role === 'Admin' || currentUser.permissions.admin;
  const userLeadIds = new Set(callLogs.filter(log => log.caller === currentUser.name).map(log => log.leadId));
  const visibleLeads = isAdmin ? leads : leads.filter(l => userLeadIds.has(l.id));

  // Filter logic
  const filteredLeads = visibleLeads.filter(lead => {
    const matchesSearch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          lead.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          lead.phone.includes(searchTerm) ||
                          lead.region.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCountry = countryFilter === 'All' || lead.country === countryFilter;
    const matchesSize = sizeFilter === 'All' || lead.size === sizeFilter;
    const matchesSolution = solutionFilter === 'All' || lead.solution === solutionFilter;
    const matchesStatus = statusFilter === 'All' || lead.status === statusFilter;

    return matchesSearch && matchesCountry && matchesSize && matchesSolution && matchesStatus;
  });

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
              ? 'Admin View: All company leads in Canada and USA for IT solutions (Websites, Web Portals, Mobile Apps).'
              : `Personal View: Showing only leads you've contacted. Logged in as ${currentUser.name}.`}
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
              placeholder="City (e.g. Toronto)"
              className="w-44 pl-8 pr-3 py-2.5 glass-input rounded-xl text-sm"
            />
          </div>
          <select
            value={fetchCategory}
            onChange={(e) => setFetchCategory(e.target.value)}
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
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-md transition-all flex items-center space-x-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Lead Manually</span>
          </button>
        </div>
      </div>

      {fetchMessage && (
        <div className="p-4 accent-pill border border-blue-200 dark:border-blue-900 rounded-2xl text-xs text-blue-800 dark:text-blue-300 font-medium flex items-center space-x-2">
          <Database className="w-4 h-4 text-blue-600 animate-pulse" />
          <span>{fetchMessage}</span>
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
              onChange={(e) => setCountryFilter(e.target.value)}
              className="w-full py-2.5 px-3 glass-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:text-white"
            >
              <option value="All">All Countries (USA & CA)</option>
              <option value="Canada">Canada</option>
              <option value="USA">USA</option>
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
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[var(--glass-border)] text-xs text-muted">
          <span>
            Showing <strong>{filteredLeads.length}</strong> of <strong>{visibleLeads.length}</strong> leads
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
                        <span className="text-[10px] text-muted">no website listed</span>
                      )}
                    </td>
                    <td className="py-4 px-4 font-semibold text-[var(--text-primary)]">
                      {lead.value ? `$${lead.value.toLocaleString()}` : <span className="text-muted font-normal">—</span>}
                    </td>
                    <td className="py-4 px-4">
                      {getStatusBadge(lead.status)}
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

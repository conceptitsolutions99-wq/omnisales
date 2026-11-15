// One rule for "this lead has been reached", used by every way of contacting a lead, so an
// email sent from the dialler and a quote sent from the requirements panel agree.
// A lead that is further along (qualified, considering, closed) is never pushed back to Contacted.
export const CONTACTED = 'Contacted';

const isUntouched = (lead) => !lead.status || lead.status === 'New';

export const markLeadContacted = (setLeads, { leadId, email, by } = {}) => {
  if (!setLeads) return;

  const address = String(email || '').trim().toLowerCase();
  const hasId = leadId !== null && leadId !== undefined;
  if (!hasId && !address) return;

  setLeads(prev => {
    let changed = false;
    const next = prev.map(lead => {
      const matchesId = hasId && String(lead.id) === String(leadId);
      const matchesEmail = Boolean(address) && String(lead.email || '').toLowerCase() === address;
      if (!(matchesId || matchesEmail) || !isUntouched(lead)) return lead;

      changed = true;
      const at = new Date().toISOString();
      return {
        ...lead,
        status: CONTACTED,
        contactedAt: at,
        contactedBy: by || lead.contactedBy || '',
        statusBy: by || lead.statusBy || '',
        statusAt: at,
        updatedAt: at
      };
    });
    return changed ? next : prev;
  });
};

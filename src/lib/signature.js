// One signature block for every customer-facing email, so a quote closes the same way as an
// outreach note. The disclosure and the opt-out are the last lines of this block, so a message
// ends with a single sign-off rather than a second one. The postal address is deliberately absent.
export const SIGNATURE_SERVICE_LINE = 'Websites · Web Portals · Mobile Apps';

// A single reference so every customer email points back to the company's own site
export const COMPANY_SITE = 'https://company-website-n9ba.vercel.app';

export const buildSignature = (agent = {}, company = {}) => {
  const lines = [
    'Best regards,',
    agent.name || 'Concept IT Solutions Team',
    agent.title || agent.role || 'Sales Agent',
    `Concept IT Solutions — ${SIGNATURE_SERVICE_LINE}`,
    `Our own site: ${COMPANY_SITE}`
  ];

  if (company.disclosure && company.optOut) lines.push(`${company.disclosure} ${company.optOut}`);
  else if (company.optOut) lines.push(company.optOut);

  return lines.join('\n');
};

// The requirements forms an email carries. Each ticked form gets its own link, because a link is
// one record the customer fills in, and one email can ask about a website, an app and a desktop
// tool at once. Several forms are listed by name so the customer opens the right one per project.
const requirementsStore = require('./requirements-store');

// A single ticked type and a list of them mean the same thing, and an unknown or repeated value is
// not a form that exists
const cleanTypes = (value) => [
  ...new Set(
    (Array.isArray(value) ? value : [value])
      .map((type) => String(type || '').trim())
      .filter((type) => requirementsStore.TYPES.includes(type))
  )
];

const requirementsSection = (links = []) => {
  if (!Array.isArray(links) || links.length === 0) return '';

  const single = links.length === 1;
  const heading = single ? 'Project requirements form' : 'Project requirements forms';
  const ask = single
    ? 'Tell us exactly what you need - open the link, tick the options and send it back:'
    : 'Tell us exactly what you need - open the link for each project, tick the options and send it back:';
  const lines = links
    .map((link) => (single ? link.url : `${link.label || requirementsStore.labelFor(link.type)}: ${link.url}`))
    .join('\n');

  return `\n\n---\n${heading}\n${ask}\n${lines}\n\nIf you prefer, reply to this email with your answers and we will fill it in for you.\n`;
};

module.exports = { cleanTypes, requirementsSection };

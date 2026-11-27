// Every WhatsApp contact with a customer carries screenshots of the conversation, so the admin
// and the analyst can review what was actually sent. Screenshots are large, so each contact is
// its own key/value row and a small index holds only the metadata the review list needs.
const kv = require('./kv-store');

const INDEX_KEY = 'omnisales:whatsapp';
const PROOF_PREFIX = 'omnisales:whatsapp:';
const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 700000; // roughly 500 KB of image once base64 is decoded
const MAX_TOTAL_CHARS = 3000000;
const MAX_INDEX = 1000;

const IMAGE_PATTERN = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;

const badRequest = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

const readIndex = async () => {
  try {
    const rows = await kv.read(INDEX_KEY, []);
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error('Could not read the WhatsApp proof index:', err.message);
    return [];
  }
};

// The review list needs who/when/which lead, not the images themselves
const metadataOf = (proof) => {
  const { images, ...rest } = proof;
  return rest;
};

const listProofs = async () => readIndex();

const getProof = async (id) => {
  const key = String(id || '').trim();
  if (!/^wa-[A-Za-z0-9-]{4,64}$/.test(key)) return null;
  try {
    const proof = await kv.read(`${PROOF_PREFIX}${key}`, null);
    return proof && Array.isArray(proof.images) ? proof : null;
  } catch (err) {
    console.error('Could not read a WhatsApp proof:', err.message);
    return null;
  }
};

const addProof = async (input = {}, actor = {}) => {
  const rawImages = Array.isArray(input.images) ? input.images : [];
  if (rawImages.length === 0) {
    throw badRequest('Attach at least one screenshot of the WhatsApp conversation before saving.');
  }
  if (rawImages.length > MAX_IMAGES) {
    throw badRequest(`Attach at most ${MAX_IMAGES} screenshots per WhatsApp contact.`);
  }

  let total = 0;
  const images = rawImages.map((image) => {
    const value = String(image || '');
    if (!IMAGE_PATTERN.test(value)) {
      throw badRequest('Only PNG, JPEG or WebP screenshots can be attached.');
    }
    if (value.length > MAX_IMAGE_CHARS) {
      throw badRequest('One screenshot is too large. Retake it at a smaller size and attach it again.');
    }
    total += value.length;
    return value;
  });
  if (total > MAX_TOTAL_CHARS) {
    throw badRequest('Those screenshots add up to too much. Attach fewer, or smaller, images.');
  }

  const proof = {
    id: `wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    leadId: input.leadId ?? null,
    leadName: String(input.leadName || '').slice(0, 160),
    company: String(input.company || '').slice(0, 160),
    phone: String(input.phone || '').slice(0, 40),
    note: String(input.note || '').slice(0, 1000),
    agent: actor.name || '',
    agentEmail: actor.email || '',
    imageCount: images.length,
    createdAt: new Date().toISOString(),
    images
  };

  await kv.write(`${PROOF_PREFIX}${proof.id}`, proof);

  // The newest entries stay listed; the images themselves are never copied into the index. The
  // index is merged under its row lock, so two proofs saved at the same moment both get listed.
  const metadata = metadataOf(proof);
  await kv.update(INDEX_KEY, [], (current) => {
    const index = Array.isArray(current) ? current : [];
    return [metadata, ...index.filter((entry) => entry.id !== proof.id)].slice(0, MAX_INDEX);
  });

  return metadata;
};

module.exports = { addProof, listProofs, getProof, MAX_IMAGES };

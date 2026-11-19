// Client side of the WhatsApp proof trail: compress a screenshot in the browser, then store it
// on the server so the admin and analyst can review it from any device.

export const MAX_PROOF_IMAGES = 4;

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });

const loadImage = (source) =>
  new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('That image could not be opened — use a PNG or JPEG screenshot.'));
    element.src = source;
  });

// Phone screenshots are several megabytes; the review copy only has to be legible, so every
// image is re-encoded to a bounded JPEG before it is uploaded.
export const compressScreenshot = async (file, { maxSize = 1400, quality = 0.72 } = {}) => {
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('Only image files can be attached.');
  }

  const source = await readAsDataUrl(file);
  const image = await loadImage(source);

  const scale = Math.min(1, maxSize / Math.max(image.width || 1, image.height || 1));
  const width = Math.max(1, Math.round((image.width || maxSize) * scale));
  const height = Math.max(1, Math.round((image.height || maxSize) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  // JPEG has no alpha, and a screenshot of a dark chat should not turn black-on-black
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const encoded = canvas.toDataURL('image/jpeg', quality);
  return encoded.length > 900000 ? canvas.toDataURL('image/jpeg', 0.55) : encoded;
};

const parse = async (pending) => {
  const response = await pending;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `WhatsApp proof request failed (${response.status}).`);
  return data;
};

export const listWhatsAppProofs = async () => {
  const data = await parse(fetch('/api/whatsapp-proofs', { credentials: 'same-origin' }));
  return Array.isArray(data.proofs) ? data.proofs : [];
};

export const getWhatsAppProof = async (id) => {
  const data = await parse(
    fetch(`/api/whatsapp-proofs?id=${encodeURIComponent(id)}`, { credentials: 'same-origin' })
  );
  return data.proof || null;
};

export const saveWhatsAppProof = async (payload) => {
  const data = await parse(
    fetch('/api/whatsapp-proofs', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  );
  return data.proof;
};

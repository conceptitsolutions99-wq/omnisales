// Every send response reports both log copies in the same four fields, whichever branch produced
// it: `logged`/`logError` for the shared log, `localLogged`/`localError` for the local file.
// The shared log exists on both targets; the local file only on the self-hosted server, so where
// there is no local copy its fields are null rather than a value that would claim a write happened.
const report = (delivery = {}) => ({
  logged: delivery.logged === true,
  logError: delivery.error || null,
  localLogged: delivery.localLogged === undefined ? null : Boolean(delivery.localLogged),
  localError: delivery.localError || null
});

module.exports = { report };

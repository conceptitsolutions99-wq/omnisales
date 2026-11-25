// A sweep returns everything the map has tagged with a phone number, and a large part of that is
// not a sales prospect: consulates and embassies, ministries and city halls, police stations and
// courthouses, museums and monuments. They publish a switchboard number and often a website, so
// every existing check treats them as a lead. They are removed here — by tag first, because the
// tag is the strongest signal, then by the provider's category, and by name last, for listings
// that carry no useful tag at all.
//
// The filter is deliberately about institutions and sights, not about sectors: a school, a place
// of worship or an art gallery can still be a customer, so those are left in.

const CONSULATE_OFFICES = new Set(['diplomatic']);
const GOVERNMENT_OFFICES = new Set(['government', 'political_party', 'administrative']);
const PUBLIC_SERVICE_OFFICES = new Set([
  'association', 'charity', 'ngo', 'foundation', 'educational_institution', 'university',
  'college', 'school', 'research', 'religion', 'religious', 'international_organization',
  'public_institution', 'quango'
]);

const CONSULATE_AMENITIES = new Set(['embassy']);
const GOVERNMENT_AMENITIES = new Set(['townhall', 'courthouse', 'police', 'fire_station', 'prison', 'customs', 'border_control']);
const PUBLIC_SERVICE_AMENITIES = new Set([
  'public_building', 'post_office', 'library', 'community_centre', 'social_facility',
  'immigration', 'ranger_station'
]);

const GOVERNMENT_BUILDINGS = new Set(['government']);
const PUBLIC_SERVICE_BUILDINGS = new Set(['public', 'civic']);

const LANDMARK_TOURISM = new Set(['attraction', 'museum', 'information', 'artwork', 'viewpoint', 'theme_park', 'zoo', 'aquarium']);

// Geoapify reports its own taxonomy, which names the same institutions with dotted keys
const CATEGORY_RULES = [
  ['consulate', /(^|\.)office\.diplomatic|(^|\.)amenity\.embassy/],
  ['government', /(^|\.)office\.government|(^|\.)office\.political_party|(^|\.)building\.government|(^|\.)amenity\.(townhall|courthouse|police|fire_station|prison|post_office)/],
  ['public-service', /(^|\.)office\.(association|charity|ngo|foundation|educational_institution|university|research|religion)|(^|\.)amenity\.(library|community_centre|public_building)/],
  ['landmark', /(^|\.)tourism\.(attraction|museum|information|artwork|viewpoint|theme_park|zoo|aquarium|sights)|(^|\.)heritage/]
];

// Names carry the signal when the tags are thin. "Embassy Suites" is a hotel and "Ministry Coffee
// Roasters" is a café, so the patterns ask for the phrase that only an institution uses.
const NAME_RULES = [
  ['consulate', /\b(consulate|consulat|consulado)\b|\bhigh commission\b/i],
  ['consulate', /\b(embassy|ambassade|embajada)\b(?!\s+(suites|inn|hotel|grand|convention|centre|center|banquet))/i],
  ['government', /\b(ministry (of|for)|ministère de|ministere de|ministerio de)\b/i],
  ['government', /\b(city hall|town hall|hôtel de ville|hotel de ville|municipal hall|municipal office|municipal building|municipal court|municipality of|municipalité de|governorate)\b/i],
  ['government', /\b(parliament|national assembly|assemblée nationale|legislature|senate of)\b/i],
  ['public-service', /\b(police (station|service|department)|gendarmerie|fire (station|department|hall)|courthouse|court house|palais de justice|post office|bureau de poste)\b/i],
  ['public-service', /\b(united nations|unesco|world bank|international monetary fund)\b/i],
  ['landmark', /\b(museum|musée|musee|museo)\b/i],
  ['landmark', /\b(monument|statue|landmark|historic site|national historic site|memorial (monument|park|plaza|square|hall))\b/i],
  ['landmark', /\b(tourist information|visitor cent(er|re)|welcome cent(er|re)|art gallery of|national gallery)\b/i]
];

// Arabic has no ASCII word boundary, so these are matched without one
const ARABIC_RULES = [
  ['consulate', /(قنصلية|سفارة)/],
  ['government', /(وزارة|محافظة|مجلس المدينة|مجلس النواب)/],
  ['public-service', /(محكمة|نيابة|قسم شرطة|مكتب بريد|مديرية)/],
  ['landmark', /(متحف|نصب تذكاري)/]
];

const ALL_NAME_RULES = [...NAME_RULES, ...ARABIC_RULES];

const lower = (value) => String(value || '').toLowerCase();

const tagReasonFor = (tags) => {
  const office = lower(tags.office);
  const amenity = lower(tags.amenity);
  const tourism = lower(tags.tourism);
  const building = lower(tags.building);

  if (CONSULATE_OFFICES.has(office) || CONSULATE_AMENITIES.has(amenity)) return 'consulate';
  if (tags.diplomatic) return 'consulate';

  if (GOVERNMENT_OFFICES.has(office) || GOVERNMENT_AMENITIES.has(amenity)) return 'government';
  if (tags.government || GOVERNMENT_BUILDINGS.has(building)) return 'government';

  // A landmark is checked before the softer institutions, because a museum tagged as an
  // association is still a museum
  if (LANDMARK_TOURISM.has(tourism) || tags.historic || tags.memorial) return 'landmark';

  if (PUBLIC_SERVICE_OFFICES.has(office) || PUBLIC_SERVICE_AMENITIES.has(amenity)) return 'public-service';
  if (PUBLIC_SERVICE_BUILDINGS.has(building)) return 'public-service';

  return '';
};

const categoryReasonFor = (categories) => {
  const list = Array.isArray(categories) ? categories : [categories];
  for (const category of list) {
    const value = lower(category);
    if (!value) continue;
    for (const [reason, pattern] of CATEGORY_RULES) {
      if (pattern.test(value)) return reason;
    }
  }
  return '';
};

// '' means the listing is a prospect. The reason is returned so a caller can say what it dropped.
export const nonProspectReason = ({ name = '', tags = {}, categories = [] } = {}) => {
  const tagReason = tagReasonFor(tags || {});
  if (tagReason) return tagReason;

  const categoryReason = categoryReasonFor(categories);
  if (categoryReason) return categoryReason;

  const text = String(name || '');
  if (!text) return '';
  for (const [reason, pattern] of ALL_NAME_RULES) {
    if (pattern.test(text)) return reason;
  }
  return '';
};

export const isProspect = (listing) => nonProspectReason(listing) === '';

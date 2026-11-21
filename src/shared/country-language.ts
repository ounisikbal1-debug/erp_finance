const ENGLISH_COUNTRY_CODES = new Set([
  'AG', 'AU', 'BB', 'BZ', 'BW', 'CA', 'DM', 'FJ', 'FM', 'GB', 'GD', 'GH', 'GM',
  'GY', 'IE', 'IN', 'JM', 'KE', 'KI', 'KN', 'LC', 'LR', 'LS', 'MH', 'MT', 'MU',
  'MW', 'NA', 'NG', 'NR', 'NZ', 'PK', 'PH', 'PW', 'SB', 'SC', 'SD', 'SG', 'SL',
  'SS', 'SZ', 'TO', 'TT', 'TV', 'TZ', 'UG', 'US', 'VC', 'VU', 'WS', 'ZA', 'ZM', 'ZW',
]);

const FRENCH_COUNTRY_CODES = new Set([
  'BE', 'BF', 'BI', 'BJ', 'CD', 'CF', 'CG', 'CI', 'CM', 'DJ', 'DZ', 'FR', 'GA',
  'GF', 'GN', 'GP', 'GQ', 'HT', 'KM', 'LU', 'MA', 'MC', 'MG', 'ML', 'MQ', 'NC',
  'NE', 'PF', 'PM', 'RE', 'RW', 'SC', 'SN', 'TD', 'TG', 'TN', 'VU', 'WF', 'YT',
]);

const AMBIGUOUS_LANGUAGE_COUNTRY_CODES = new Set(['CA', 'SC', 'VU']);

export function getCountryInterpretationLanguage(countryCode: string): 'fr' | 'en' | null {
  const normalizedCode = countryCode.trim().toUpperCase();
  if (AMBIGUOUS_LANGUAGE_COUNTRY_CODES.has(normalizedCode)) return null;
  const isEnglish = ENGLISH_COUNTRY_CODES.has(normalizedCode);
  const isFrench = FRENCH_COUNTRY_CODES.has(normalizedCode);
  if (isEnglish === isFrench) return null;
  if (isEnglish) return 'en';
  if (isFrench) return 'fr';
  return null;
}

export const TZ_STORAGE_KEY = 'efi_timezone';
export const DEFAULT_TIMEZONE = 'America/Los_Angeles';

export const TIMEZONE_OPTIONS = [
  { value: 'America/Los_Angeles', label: 'Pacific (PST/PDT)' },
  { value: 'America/Denver', label: 'Mountain (MST/MDT)' },
  { value: 'America/Chicago', label: 'Central (CST/CDT)' },
  { value: 'America/New_York', label: 'Eastern (EST/EDT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKST/AKDT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET/CEST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
];

let cachedTz: string | null = null;

export function getUserTimezone(): string {
  if (typeof window === 'undefined') return DEFAULT_TIMEZONE;
  if (cachedTz) return cachedTz;
  try {
    cachedTz = localStorage.getItem(TZ_STORAGE_KEY) || DEFAULT_TIMEZONE;
  } catch {
    cachedTz = DEFAULT_TIMEZONE;
  }
  return cachedTz;
}

export function setUserTimezone(tz: string) {
  cachedTz = tz;
  try { localStorage.setItem(TZ_STORAGE_KEY, tz); } catch { /* ignore */ }
}

let patched = false;

// Makes every date/time formatted without an explicit timeZone use the member's timezone.
export function installUserTimezone() {
  if (typeof window === 'undefined' || patched) return;
  patched = true;

  const withTz = (opts?: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions =>
    opts && opts.timeZone ? opts : { ...(opts || {}), timeZone: getUserTimezone() };

  // Display-only formatters: the app hardcodes the US market zones when rendering labels,
  // so those are swapped for the member's choice. toLocaleString and Intl.DateTimeFormat
  // with an explicit zone are left alone because session logic parses their output.
  const MARKET_ZONES = new Set(['America/Los_Angeles', 'America/New_York']);
  const withDisplayTz = (opts?: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions =>
    opts && opts.timeZone && !MARKET_ZONES.has(opts.timeZone) ? opts : { ...(opts || {}), timeZone: getUserTimezone() };

  const proto = Date.prototype as any;
  for (const fn of ['toLocaleString', 'toLocaleTimeString', 'toLocaleDateString']) {
    const orig = proto[fn];
    const pick = fn === 'toLocaleString' ? withTz : withDisplayTz;
    proto[fn] = function (locales?: any, opts?: Intl.DateTimeFormatOptions) {
      return orig.call(this, locales, pick(opts));
    };
  }

  const OrigDTF = Intl.DateTimeFormat;
  const Patched: any = function (this: unknown, locales?: any, opts?: Intl.DateTimeFormatOptions) {
    return new OrigDTF(locales, withTz(opts));
  };
  Patched.prototype = OrigDTF.prototype;
  Patched.supportedLocalesOf = OrigDTF.supportedLocalesOf.bind(OrigDTF);
  (Intl as any).DateTimeFormat = Patched;
}

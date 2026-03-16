/**
 * Schedule timezone options for teams. Used when setting availability and when
 * searching for scrims - times are interpreted in the team's chosen timezone.
 * IANA timezone IDs used for proper DST handling (EST/EDT, PST/PDT).
 */
export const SCHEDULE_TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC', iana: 'UTC' },
  { value: 'America/New_York', label: 'EST / East Coast', iana: 'America/New_York' },
  { value: 'America/Los_Angeles', label: 'PST / West Coast', iana: 'America/Los_Angeles' }
];

// For filter dropdowns
export const SCHEDULE_TIMEZONE_FILTER_OPTIONS = [
  { value: 'All', label: 'All Timezones' },
  ...SCHEDULE_TIMEZONE_OPTIONS.map(t => ({ value: t.value, label: t.label }))
];

/** Get timezone abbreviation for a date (e.g. EST, EDT, PST, PDT, UTC) */
export function getTimezoneAbbrev(date, ianaTimezone = 'America/New_York') {
  if (!ianaTimezone || ianaTimezone === 'UTC') return 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaTimezone,
      timeZoneName: 'short'
    }).formatToParts(date);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    return tzPart ? tzPart.value : ianaTimezone;
  } catch {
    return ianaTimezone;
  }
}

/** Get display label for a team's schedule timezone */
export function getScheduleTimezoneDisplay(team) {
  const tz = team?.scheduleTimezone;
  if (!tz) return null;
  const opt = SCHEDULE_TIMEZONE_OPTIONS.find(o => o.value === tz);
  return opt ? opt.label : tz;
}

/**
 * Conference link detection — extracts Zoom, Google Meet, Teams, Discord, and Twitch
 * links from event descriptions or locations.
 */

const CONFERENCE_PATTERNS = [
  { name: 'Zoom', pattern: /https?:\/\/[\w.-]*zoom\.us\/[^\s>)\]]+/gi },
  { name: 'Google Meet', pattern: /https?:\/\/meet\.google\.com\/[^\s>)\]]+/gi },
  { name: 'Microsoft Teams', pattern: /https?:\/\/teams\.microsoft\.com\/[^\s>)\]]+/gi },
  { name: 'Discord', pattern: /https?:\/\/discord\.gg\/[^\s>)\]]+/gi },
  { name: 'Twitch', pattern: /https?:\/\/(?:www\.)?twitch\.tv\/[^\s>)\]]+/gi },
  { name: 'YouTube', pattern: /https?:\/\/(?:www\.)?(?:youtube\.com\/live|youtu\.be)\/[^\s>)\]]+/gi },
];

/**
 * Extract conference/streaming links from text.
 * Returns array of { name, url } objects.
 */
export function extractConferenceLinks(text) {
  if (!text) return [];
  const links = [];
  const seen = new Set();
  for (const { name, pattern } of CONFERENCE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      for (const url of matches) {
        if (!seen.has(url)) {
          seen.add(url);
          links.push({ name, url });
        }
      }
    }
  }
  return links;
}

/**
 * Format conference links as a readable string for embeds.
 */
export function formatConferenceLinks(links) {
  if (!links?.length) return null;
  return links.map(l => `[${l.name}](${l.url})`).join(' | ');
}

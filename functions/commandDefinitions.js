import { SlashCommandBuilder } from 'discord.js';

/**
 * Generate date choices for the next 14 days (used for schedule-scrim).
 * Labels: "Today", "Tomorrow", or "Weekday Mon DD".
 */
function getScheduleScrimDateChoices() {
  const choices = [];
  // Use US Eastern time to generate the choices since that's the most common baseline
  // This ensures "Today" aligns with the US calendar day
  const now = new Date();
  const estDateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const [y, m, d] = estDateStr.split('-').map(Number);
  
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  for (let i = 0; i < 14; i++) {
    // Create date at noon EST to safely add days without DST shifting issues
    const targetDate = new Date(y, m - 1, d + i, 12, 0, 0);
    const ymd = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${dayNames[targetDate.getDay()]} ${monthNames[targetDate.getMonth()]} ${targetDate.getDate()}`;
    choices.push({ name: label, value: ymd });
  }
  return choices;
}

/**
 * Time choices for scrims: 6:00 PM to 11:30 PM in 30-minute increments.
 * Values are HH:mm (24h). Shared by `/schedule-scrim` and `/list-available-scrims`.
 */
export const SCRIM_SLOT_TIME_CHOICES = [
  { name: '6:00 PM', value: '18:00' },
  { name: '6:30 PM', value: '18:30' },
  { name: '7:00 PM', value: '19:00' },
  { name: '7:30 PM', value: '19:30' },
  { name: '8:00 PM', value: '20:00' },
  { name: '8:30 PM', value: '20:30' },
  { name: '9:00 PM', value: '21:00' },
  { name: '9:30 PM', value: '21:30' },
  { name: '10:00 PM', value: '22:00' },
  { name: '10:30 PM', value: '22:30' },
  { name: '11:00 PM', value: '23:00' },
  { name: '11:30 PM', value: '23:30' },
];

/** Hours 00–23 for `/add-event` (pair with minute; Discord max 25 choices per option). */
export const CALENDAR_HOUR_CHOICES = Array.from({ length: 24 }, (_, i) => {
  const v = String(i).padStart(2, '0');
  return { name: v, value: v };
});

/** Minute marks for `/add-event` (15-minute steps). */
export const CALENDAR_MINUTE_CHOICES = [
  { name: '00', value: '00' },
  { name: '15', value: '15' },
  { name: '30', value: '30' },
  { name: '45', value: '45' },
];

/**
 * Overwatch 2 team average rank for slash commands.
 * Discord allows at most 25 choices per string option; full ranks are 8×5 = 40, so we use tier + division.
 * Division 1 = highest within the tier, 5 = lowest (matches website `OVERWATCH_RANK_OPTIONS`).
 */
export const OW_RANK_TIER_CHOICES = [
  { name: 'Champion', value: 'Champion' },
  { name: 'Grandmaster', value: 'Grandmaster' },
  { name: 'Master', value: 'Master' },
  { name: 'Diamond', value: 'Diamond' },
  { name: 'Platinum', value: 'Platinum' },
  { name: 'Gold', value: 'Gold' },
  { name: 'Silver', value: 'Silver' },
  { name: 'Bronze', value: 'Bronze' },
];

export const OW_RANK_DIVISION_CHOICES = [
  { name: '1 (highest in tier)', value: '1' },
  { name: '2', value: '2' },
  { name: '3', value: '3' },
  { name: '4', value: '4' },
  { name: '5 (lowest in tier)', value: '5' },
];

/** Time windows for `/request-availability` (dropdown). Value is stored on the request and shown to players. */
export const AVAILABILITY_REQUEST_PERIOD_CHOICES = [
  { name: 'This week', value: 'This week' },
  { name: 'Next week', value: 'Next week' },
  { name: 'This weekend', value: 'This weekend' },
  { name: 'Next weekend', value: 'Next weekend' },
  { name: 'Today', value: 'Today' },
  { name: 'Tomorrow', value: 'Tomorrow' },
  { name: 'Next 7 days', value: 'Next 7 days' },
  { name: 'Next 14 days', value: 'Next 14 days' },
];

/**
 * Slash command definitions for Discord.
 * Register with Discord: from `functions/`, run `npm run register-commands` (needs .env with token + client id).
 */
export const commands = [
  new SlashCommandBuilder()
    .setName('request-availability')
    .setDescription('Post a channel poll: weekday reactions sync to team availability')
    .addStringOption(option =>
      option.setName('period')
        .setDescription('Time window you are asking about')
        .setRequired(true)
        .addChoices(...AVAILABILITY_REQUEST_PERIOD_CHOICES))
    .addStringOption(option =>
      option.setName('players')
        .setDescription('Mention players (@player1 @player2) or type "all" for all players')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('list-players')
    .setDescription('List all players in your team with their Discord status'),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show help message with all available commands'),
  new SlashCommandBuilder()
    .setName('verify-discord')
    .setDescription('Verify and link your Discord account (use from web app)')
    .addStringOption(option =>
      option.setName('code')
        .setDescription('Verification code from web app')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('upload-scrim')
    .setDescription('Upload a ScrimTime CSV log file')
    .addAttachmentOption(option =>
      option.setName('logfile')
        .setDescription('The ScrimTime CSV or TXT file')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('my-availability')
    .setDescription('Set your availability for scrims (opens DM)'),
  new SlashCommandBuilder()
    .setName('my-team')
    .setDescription('View your team info and schedule (opens DM)'),
  new SlashCommandBuilder()
    .setName('add-player')
    .setDescription('Add a Discord server member to your team (Manager only)')
    .addUserOption(option =>
      option.setName('player')
        .setDescription('The Discord user to add to your team')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('role')
        .setDescription('The role(s) they play')
        .setRequired(true)
        .addChoices(
          { name: 'Tank', value: 'Tank' },
          { name: 'DPS', value: 'DPS' },
          { name: 'Support', value: 'Support' },
          { name: 'Flex (All Roles)', value: 'Tank, DPS, Support' },
          { name: 'Tank / DPS', value: 'Tank, DPS' },
          { name: 'Tank / Support', value: 'Tank, Support' },
          { name: 'DPS / Support', value: 'DPS, Support' }
        )),
  new SlashCommandBuilder()
    .setName('verify-sr')
    .setDescription('Verify Overwatch Skill Rating using BattleTag')
    .addStringOption(option =>
      option.setName('battletag')
        .setDescription('Your BattleTag (e.g., Player#1234 or Player-1234)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('platform')
        .setDescription('Platform (pc, xbl, psn)')
        .setRequired(true)
        .addChoices(
          { name: 'PC', value: 'pc' },
          { name: 'Xbox', value: 'xbl' },
          { name: 'PlayStation', value: 'psn' }
        ))
    .addStringOption(option =>
      option.setName('region')
        .setDescription('Region (us, eu, kr, cn, global)')
        .setRequired(true)
        .addChoices(
          { name: 'US', value: 'us' },
          { name: 'EU', value: 'eu' },
          { name: 'KR', value: 'kr' },
          { name: 'CN', value: 'cn' },
          { name: 'Global', value: 'global' }
        )),
  new SlashCommandBuilder()
    .setName('remove-player')
    .setDescription('Remove a player from your team (Manager only)')
    .addUserOption(option =>
      option.setName('player')
        .setDescription('The player to remove')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('schedule-scrim')
    .setDescription('Schedule a scrim and poll team availability (Manager only)')
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Select the scrim date')
        .setRequired(true)
        .addChoices(...getScheduleScrimDateChoices()))
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Select the scrim time (6pm onwards)')
        .setRequired(true)
        .addChoices(...SCRIM_SLOT_TIME_CHOICES))
    .addStringOption(option =>
      option.setName('notes')
        .setDescription('Optional notes about the scrim')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('find-time')
    .setDescription('Find best times based on team availability (Manager only)')
    .addStringOption(option =>
      option.setName('period')
        .setDescription('Time period to analyze')
        .setRequired(false)
        .addChoices(
          { name: 'Next 7 days', value: 'week' },
          { name: 'Next 14 days', value: 'two-weeks' },
          { name: 'This week only', value: 'this-week' }
        )),
  new SlashCommandBuilder()
    .setName('team-stats')
    .setDescription('View team availability statistics and analytics (Manager only)'),
  new SlashCommandBuilder()
    .setName('upcoming-scrims')
    .setDescription('View all upcoming scheduled scrims for your team'),
  new SlashCommandBuilder()
    .setName('event-summary')
    .setDescription('View upcoming calendar events for your team(s) (next 7 days)'),
  new SlashCommandBuilder()
    .setName('my-timezone')
    .setDescription('Set your timezone for event reminders (e.g. America/New_York)')
    .addStringOption(option =>
      option.setName('timezone')
        .setDescription('IANA timezone (e.g. America/New_York, Europe/London)')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('find-free-agents')
    .setDescription('Browse free agents looking for teams (Managers)')
    .addStringOption(option =>
      option.setName('role')
        .setDescription('Filter by preferred role')
        .setRequired(false)
        .addChoices(
          { name: 'Tank', value: 'Tank' },
          { name: 'DPS', value: 'DPS' },
          { name: 'Support', value: 'Support' },
          { name: 'Flex', value: 'Flex' }
        ))
    .addStringOption(option =>
      option.setName('region')
        .setDescription('Filter by region')
        .setRequired(false)
        .addChoices(
          { name: 'NA', value: 'NA' },
          { name: 'EU', value: 'EU' },
          { name: 'OCE', value: 'OCE' },
          { name: 'Asia', value: 'Asia' },
          { name: 'SA', value: 'SA' }
        ))
    .addIntegerOption(option =>
      option.setName('min_sr')
        .setDescription('Minimum skill rating')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get the link to add the Swiss Play bot to your Discord server'),
  new SlashCommandBuilder()
    .setName('create-team')
    .setDescription('Create a new team (requires linked Discord account)')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Team name')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('abbreviation')
        .setDescription('Team abbreviation (e.g. NFC)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('region')
        .setDescription('Region')
        .setRequired(true)
        .addChoices(
          { name: 'NA', value: 'NA' },
          { name: 'EU', value: 'EU' },
          { name: 'OCE', value: 'OCE' },
          { name: 'Asia', value: 'Asia' },
          { name: 'SA', value: 'SA' }
        ))
    .addStringOption(option =>
      option.setName('rank-tier')
        .setDescription('Average rank — tier (e.g. Champion)')
        .setRequired(true)
        .addChoices(...OW_RANK_TIER_CHOICES))
    .addStringOption(option =>
      option.setName('rank-division')
        .setDescription('Division within tier: 1 = top, 5 = bottom')
        .setRequired(true)
        .addChoices(...OW_RANK_DIVISION_CHOICES))
    .addStringOption(option =>
      option.setName('faceit-div')
        .setDescription('FaceIT division')
        .setRequired(true)
        .addChoices(
          { name: 'OWCS', value: 'OWCS' },
          { name: 'Masters', value: 'Masters' },
          { name: 'Advanced', value: 'Advanced' },
          { name: 'Expert', value: 'Expert' },
          { name: 'Open', value: 'Open' }
        )),
  new SlashCommandBuilder()
    .setName('list-available-scrims')
    .setDescription('List teams with an open scrim slot on a chosen day and time (from SwissPlay schedules)')
    .addStringOption(option =>
      option.setName('day')
        .setDescription('Day of week')
        .setRequired(true)
        .addChoices(
          { name: 'Monday', value: 'Monday' },
          { name: 'Tuesday', value: 'Tuesday' },
          { name: 'Wednesday', value: 'Wednesday' },
          { name: 'Thursday', value: 'Thursday' },
          { name: 'Friday', value: 'Friday' },
          { name: 'Saturday', value: 'Saturday' },
          { name: 'Sunday', value: 'Sunday' }
        ))
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Start time for the scrim slot')
        .setRequired(true)
        .addChoices(...SCRIM_SLOT_TIME_CHOICES))
    .addStringOption(option =>
      option.setName('region')
        .setDescription('Filter by region')
        .setRequired(false)
        .addChoices(
          { name: 'All', value: 'All' },
          { name: 'NA', value: 'NA' },
          { name: 'EU', value: 'EU' },
          { name: 'OCE', value: 'OCE' },
          { name: 'Asia', value: 'Asia' },
          { name: 'SA', value: 'SA' }
        ))
    .addStringOption(option =>
      option.setName('division')
        .setDescription('Filter by FaceIT division')
        .setRequired(false)
        .addChoices(
          { name: 'All', value: 'All' },
          { name: 'OWCS', value: 'OWCS' },
          { name: 'Masters', value: 'Masters' },
          { name: 'Advanced', value: 'Advanced' },
          { name: 'Expert', value: 'Expert' },
          { name: 'Open', value: 'Open' }
        )),
  new SlashCommandBuilder()
    .setName('find-scrims')
    .setDescription('Find teams whose schedule overlaps yours (same logic as Find Scrims on the website)')
    .addStringOption(option =>
      option
        .setName('team')
        .setDescription('Your team (type to search, then pick from the list)')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option =>
      option
        .setName('division')
        .setDescription('Filter opponents by FaceIT division')
        .setRequired(false)
        .addChoices(
          { name: 'Any', value: 'All' },
          { name: 'OWCS', value: 'OWCS' },
          { name: 'Masters', value: 'Masters' },
          { name: 'Expert', value: 'Expert' },
          { name: 'Advanced', value: 'Advanced' },
          { name: 'Open', value: 'Open' }
        ))
    .addStringOption(option =>
      option
        .setName('region')
        .setDescription('Filter opponents by region')
        .setRequired(false)
        .addChoices(
          { name: 'Any', value: 'All' },
          { name: 'NA', value: 'NA' },
          { name: 'EU', value: 'EU' },
          { name: 'OCE', value: 'OCE' },
          { name: 'Asia', value: 'Asia' },
          { name: 'SA', value: 'SA' }
        ))
    .addStringOption(option =>
      option
        .setName('timezone')
        .setDescription('Filter by opponent schedule timezone (website setting)')
        .setRequired(false)
        .addChoices(
          { name: 'Any', value: 'All' },
          { name: 'UTC', value: 'UTC' },
          { name: 'EST / East Coast', value: 'America/New_York' },
          { name: 'PST / West Coast', value: 'America/Los_Angeles' }
        ))
    .addStringOption(option =>
      option
        .setName('day')
        .setDescription('Only opponents with availability on this day')
        .setRequired(false)
        .addChoices(
          { name: 'Monday', value: 'Monday' },
          { name: 'Tuesday', value: 'Tuesday' },
          { name: 'Wednesday', value: 'Wednesday' },
          { name: 'Thursday', value: 'Thursday' },
          { name: 'Friday', value: 'Friday' },
          { name: 'Saturday', value: 'Saturday' },
          { name: 'Sunday', value: 'Sunday' }
        )),
  new SlashCommandBuilder()
    .setName('send-scrim-request')
    .setDescription('Send a scrim request to another team (Manager only)')
    .addStringOption(option =>
      option.setName('day')
        .setDescription('Day of week')
        .setRequired(true)
        .addChoices(
          { name: 'Monday', value: 'Monday' },
          { name: 'Tuesday', value: 'Tuesday' },
          { name: 'Wednesday', value: 'Wednesday' },
          { name: 'Thursday', value: 'Thursday' },
          { name: 'Friday', value: 'Friday' },
          { name: 'Saturday', value: 'Saturday' },
          { name: 'Sunday', value: 'Sunday' }
        ))
    .addIntegerOption(option =>
      option.setName('hour')
        .setDescription('Hour (0-23)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(23))
    .addStringOption(option =>
      option.setName('region')
        .setDescription('Filter target teams by region')
        .setRequired(false)
        .addChoices(
          { name: 'All', value: 'All' },
          { name: 'NA', value: 'NA' },
          { name: 'EU', value: 'EU' },
          { name: 'OCE', value: 'OCE' },
          { name: 'Asia', value: 'Asia' },
          { name: 'SA', value: 'SA' }
        ))
    .addStringOption(option =>
      option.setName('division')
        .setDescription('Filter by FaceIT division')
        .setRequired(false)
        .addChoices(
          { name: 'All', value: 'All' },
          { name: 'OWCS', value: 'OWCS' },
          { name: 'Masters', value: 'Masters' },
          { name: 'Advanced', value: 'Advanced' },
          { name: 'Expert', value: 'Expert' },
          { name: 'Open', value: 'Open' }
        )),
  new SlashCommandBuilder()
    .setName('drop-scrim')
    .setDescription('Cancel an accepted scrim (Manager only)'),
  new SlashCommandBuilder()
    .setName('add-event')
    .setDescription('Add a calendar event (Manager only)')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Event title')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Date (YYYY-MM-DD)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('start-hour')
        .setDescription('Start hour (24h)')
        .setRequired(true)
        .addChoices(...CALENDAR_HOUR_CHOICES))
    .addStringOption(option =>
      option.setName('start-minute')
        .setDescription('Start minutes')
        .setRequired(true)
        .addChoices(...CALENDAR_MINUTE_CHOICES))
    .addStringOption(option =>
      option.setName('end-hour')
        .setDescription('End hour (24h)')
        .setRequired(true)
        .addChoices(...CALENDAR_HOUR_CHOICES))
    .addStringOption(option =>
      option.setName('end-minute')
        .setDescription('End minutes')
        .setRequired(true)
        .addChoices(...CALENDAR_MINUTE_CHOICES))
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Event type')
        .setRequired(false)
        .addChoices(
          { name: 'Scrim', value: 'scrim' },
          { name: 'Practice', value: 'practice' },
          { name: 'Tournament', value: 'tournament' },
          { name: 'Meetup', value: 'meetup' },
          { name: 'Custom', value: 'custom' }
        ))
    .addStringOption(option =>
      option.setName('recurrence')
        .setDescription('Recurrence')
        .setRequired(false)
        .addChoices(
          { name: 'None', value: 'none' },
          { name: 'Weekly', value: 'weekly' },
          { name: 'Daily', value: 'daily' }
        )),
  new SlashCommandBuilder()
    .setName('edit-event')
    .setDescription('Edit a calendar event (Manager only)'),
  new SlashCommandBuilder()
    .setName('delete-event')
    .setDescription('Delete a calendar event (Manager only)'),
  new SlashCommandBuilder()
    .setName('find-ringers')
    .setDescription('Browse ringers looking for ring opportunities (Managers)')
    .addStringOption(option =>
      option.setName('role')
        .setDescription('Filter by preferred role')
        .setRequired(false)
        .addChoices(
          { name: 'Tank', value: 'Tank' },
          { name: 'DPS', value: 'DPS' },
          { name: 'Support', value: 'Support' },
          { name: 'Flex', value: 'Flex' }
        ))
    .addStringOption(option =>
      option.setName('region')
        .setDescription('Filter by region')
        .setRequired(false)
        .addChoices(
          { name: 'NA', value: 'NA' },
          { name: 'EU', value: 'EU' },
          { name: 'OCE', value: 'OCE' },
          { name: 'Asia', value: 'Asia' },
          { name: 'SA', value: 'SA' }
        ))
    .addIntegerOption(option =>
      option.setName('min_sr')
        .setDescription('Minimum skill rating')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('edit-profile')
    .setDescription('Update your profile (display name, username, bio, SR)')
    .addStringOption(option =>
      option.setName('display-name')
        .setDescription('Display name')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Username (3+ chars, a-z 0-9 _)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('bio')
        .setDescription('Bio')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('skill-rating')
        .setDescription('Skill rating (SR)')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('schedule-carryover')
    .setDescription('Toggle whether team schedule carries over to next week (Manager only)')
    .addStringOption(option =>
      option.setName('enabled')
        .setDescription('Carry schedule to next week? (On = keep + Discord reminder; Off = clear each week)')
        .setRequired(true)
        .addChoices(
          { name: 'On (default) - keep schedule, get weekly reminder', value: 'on' },
          { name: 'Off - clear schedule each week', value: 'off' }
        )),
  new SlashCommandBuilder()
    .setName('team-settings')
    .setDescription('Update team settings (Manager only)')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Team name')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('region')
        .setDescription('Region')
        .setRequired(false)
        .addChoices(
          { name: 'NA', value: 'NA' },
          { name: 'EU', value: 'EU' },
          { name: 'OCE', value: 'OCE' },
          { name: 'Asia', value: 'Asia' },
          { name: 'SA', value: 'SA' }
        ))
    .addStringOption(option =>
      option.setName('rank-tier')
        .setDescription('Average rank — tier (both tier + division to update rank)')
        .setRequired(false)
        .addChoices(...OW_RANK_TIER_CHOICES))
    .addStringOption(option =>
      option.setName('rank-division')
        .setDescription('Division: 1 = top of tier, 5 = bottom (use with rank-tier)')
        .setRequired(false)
        .addChoices(...OW_RANK_DIVISION_CHOICES))
    .addStringOption(option =>
      option.setName('faceit-div')
        .setDescription('FaceIT division')
        .setRequired(false)
        .addChoices(
          { name: 'OWCS', value: 'OWCS' },
          { name: 'Masters', value: 'Masters' },
          { name: 'Advanced', value: 'Advanced' },
          { name: 'Expert', value: 'Expert' },
          { name: 'Open', value: 'Open' }
        )),
  new SlashCommandBuilder()
    .setName('submit-review')
    .setDescription('Submit a team review after a scrim (Manager only)')
    .addIntegerOption(option =>
      option.setName('rating')
        .setDescription('Rating 1-5')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(5))
    .addStringOption(option =>
      option.setName('comment')
        .setDescription('Optional comment')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('set-summary-channel')
    .setDescription('Configure automatic daily/weekly event summaries in a channel (Manager only)')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to post summaries in')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('frequency')
        .setDescription('How often to post')
        .setRequired(true)
        .addChoices(
          { name: 'Daily (every morning)', value: 'daily' },
          { name: 'Weekly (every Monday)', value: 'weekly' },
          { name: 'Off (disable)', value: 'off' }
        )),
  new SlashCommandBuilder()
    .setName('set-reminder-channel')
    .setDescription('Set a channel for event reminder announcements (Manager only)')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel for reminder messages (leave empty to disable)')
        .setRequired(false)),
].map(c => c.toJSON());

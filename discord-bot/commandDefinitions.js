import { SlashCommandBuilder } from 'discord.js';

/**
 * Generate date choices for the next 14 days (used for schedule-scrim).
 * Labels: "Today", "Tomorrow", or "Weekday Mon DD".
 */
function getScheduleScrimDateChoices() {
  const choices = [];
  const now = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const ymd = d.toISOString().split('T')[0];
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${dayNames[d.getDay()]} ${monthNames[d.getMonth()]} ${d.getDate()}`;
    choices.push({ name: label, value: ymd });
  }
  return choices;
}

/**
 * Time choices for scrims: 6:00 PM to 11:30 PM in 30-minute increments.
 * Values are HH:mm (24h) for parseFlexibleTime compatibility.
 */
const SCHEDULE_SCRIM_TIME_CHOICES = [
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

/**
 * Slash command definitions. Shared by index.js (bot) and register-commands.js (one-time registration).
 * When using Firebase Functions only, run: node register-commands.js
 */
export const commands = [
  new SlashCommandBuilder()
    .setName('request-availability')
    .setDescription('Request availability from specific players or all players')
    .addStringOption(option =>
      option.setName('period')
        .setDescription('Specific time period (e.g., this weekend, March 15-20)')
        .setRequired(true))
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
        .addChoices(...SCHEDULE_SCRIM_TIME_CHOICES))
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
      option.setName('sr')
        .setDescription('Average rank')
        .setRequired(false)
        .addChoices(
          { name: 'Champion 1', value: 'Champion 1' },
          { name: 'Grandmaster 1', value: 'Grandmaster 1' },
          { name: 'Master 1', value: 'Master 1' },
          { name: 'Diamond 1', value: 'Diamond 1' },
          { name: 'Platinum 1', value: 'Platinum 1' }
        ))
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
      option.setName('start-time')
        .setDescription('Start time (HH:mm, 24h)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('end-time')
        .setDescription('End time (HH:mm, 24h)')
        .setRequired(true))
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
      option.setName('sr')
        .setDescription('Average rank')
        .setRequired(false)
        .addChoices(
          { name: 'Champion 1', value: 'Champion 1' },
          { name: 'Grandmaster 1', value: 'Grandmaster 1' },
          { name: 'Master 1', value: 'Master 1' },
          { name: 'Diamond 1', value: 'Diamond 1' }
        ))
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
        .setRequired(false))
].map(c => c.toJSON());

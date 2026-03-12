# SwissPlay Discord Bot - Complete User Guide

## 🎮 DM-First Bot Experience

The SwissPlay bot is designed to make team management as easy as possible, with **most interactions happening in Discord DMs**. Players rarely need to visit the website—managers handle team setup there, and everything else flows through Discord.

---

## Quick Start

### For Players
1. **Get added to a team**: Your manager runs `/add-player @you` in Discord
2. **Set availability**: Run `/my-availability` and tell the bot when you can play
3. **View team info**: Run `/my-team` anytime
4. **Respond to scrims**: When a scrim is scheduled, you'll get a DM—just click ✅/❌/⏰

### For Managers
1. **Create team on website**: Go to solaris-cd166.firebaseapp.com and create your team
2. **Verify Discord**: In Team Management → Settings, click "VERIFY DISCORD (MANAGERS)" button
3. **Add players**: Run `/add-player @player` in your Discord server
4. **Schedule scrims**: Run `/schedule-scrim date:tomorrow time:7pm`
5. **Find best times**: Run `/find-time` to see when most players are available

---

## Player Commands (DM-Based)

### `/my-availability`
Set your availability via DM conversation.

**How it works:**
1. Run `/my-availability` in any server or DM
2. Bot DMs you asking when you're available
3. Reply naturally: "Weekdays 6-10pm" or "Mon/Wed/Fri 7-9pm"
4. Bot confirms and saves to your team

**Examples of what you can say:**
- "Weekdays after 6pm"
- "Monday Wednesday Friday 7-10pm"
- "Weekends anytime"
- "Tuesday Thursday 8-11pm"
- "Anytime" (available every day)

**Privacy:** Your availability is only visible to your team manager.

---

### `/my-team`
View your team roster, schedule, and availability in a DM.

**What you'll see:**
- Your current availability setting
- Upcoming scheduled scrims
- Full team roster
- Who's set their availability

---

### `/upcoming-scrims`
See all scheduled scrims for your team(s).

**What you'll see:**
- All active scrims with dates/times
- Your response status for each (✅/❌/⏰/❓)
- How many teammates confirmed
- Scrim notes from your manager

---

### Responding to Scrim Polls

When your manager schedules a scrim, you'll receive a DM like:

```
📅 Scrim Scheduled!
manager123 scheduled a scrim for Team A

Date: 2024-03-15
Time: 19:00

Can you make it?
[✅ Yes] [❌ No] [⏰ Maybe]
```

**Just click a button!** Your manager is notified immediately.

**Reminders:**
- 24 hours before: You'll get a reminder DM
- 1 hour before: Another reminder for confirmed players

---

## Manager Commands

### Team Setup

#### `/add-player @user`
Add a Discord server member to your team.

**How it works:**
1. Run `/add-player @username` in your server
2. If you manage multiple teams, pick which team to add them to
3. Player is added as a "Player" role
4. They immediately get a welcome DM
5. They can use `/my-availability` and `/my-team` right away

**Requirements:**
- You must be verified (website → Settings → "Verify Discord" button)
- Player must be in the same Discord server
- Player can't already be on another team

---

#### `/remove-player @user`
Remove a player from your team.

**Safety features:**
- Can't remove the last owner (transfer ownership first)
- Player is notified via DM
- Immediate effect (updates Firebase + website)

---

### Scheduling & Availability

#### `/schedule-scrim date:tomorrow time:7pm notes:Optional notes`
Schedule a scrim and poll your entire team.

**Flow:**
1. You run the command
2. If you manage multiple teams, pick which team
3. Bot DMs **all team members** with a poll
4. You get a summary showing how many were reached
5. As players respond, you get real-time DM updates
6. Bot automatically sends **24-hour** and **1-hour** reminders

**Date formats:**
- "today", "tomorrow"
- "monday", "tuesday", etc. (next occurrence)
- "2024-03-15" (ISO date)

**Time formats:**
- "7pm", "19:00"
- "7:30pm", "19:30"

**Example:**
```
/schedule-scrim date:friday time:8pm notes:Practice scrimmage vs Team X
```

---

#### `/find-time`
Analyze team availability and get suggestions for best scrim times.

**What you'll see:**
```
📊 Best Times for Team A

1. Wednesday 20:00 - 22:00
   6/6 players (100%)

2. Monday 19:00 - 21:00
   5/6 players (83%)

3. Friday 20:00 - 22:00
   5/6 players (83%)
```

**Options:**
- No option = Next 7 days
- `period:week` = Next 7 days
- `period:two-weeks` = Next 14 days
- `period:this-week` = This week only

**Tip:** Use this before scheduling scrims to pick times when most players are available!

---

#### `/team-stats`
View detailed analytics about your team.

**What you'll see:**
- Team size
- How many players set their availability (%)
- Average poll response rate
- Day-by-day availability breakdown:
  - 🟢 High coverage (70%+ players)
  - 🟡 Medium coverage (40-70%)
  - 🔴 Low coverage (<40%)

**Example output:**
```
📊 Team Analytics: Team A

Team Size: 6 members
Availability Set: 5/6 (83%)
Avg. Poll Response: 92%

Daily Availability:
🟢 Monday: 5/6 (83%)
🟢 Wednesday: 6/6 (100%)
🟡 Tuesday: 3/6 (50%)
🔴 Saturday: 2/6 (33%)
```

---

### Roster Management

#### `/list-players`
See all players in your team with availability status.

**What you'll see:**
- Discord username
- Whether they've set availability
- Their availability text (e.g., "Weekdays 6-10pm")
- Discord link status

---

## Website Integration

### For Managers

**Team Management → Settings Page:**

1. **Verify Discord (Managers)**
   - Click "VERIFY DISCORD (MANAGERS)" button
   - Check your Discord DMs
   - Click "✅ Confirm" in the DM
   - ✅ You're now verified and can use all manager commands

2. **View Team Roster**
   - See all members with Discord status
   - See who's set their availability
   - Real-time updates as players link/join

3. **Pending Invitations**
   - See who you've invited
   - Track invitation status
   - Resend if needed

**Why website verification?**
- Security: Prevents unauthorized users from managing your team
- You only need to do it once per Discord account

---

### For Players

**Good news:** You almost never need the website!

Everything you need is in Discord:
- `/my-availability` - Set schedule
- `/my-team` - View team
- `/upcoming-scrims` - See scrims
- Scrim polls come via DM

**Optional:** Visit the website to see:
- Team public profile
- Historical scrim logs
- Full team schedule

---

## Command Reference

### Everyone

| Command | Description | Where to run |
|---------|-------------|--------------|
| `/my-availability` | Set your availability | Anywhere (DM opens) |
| `/my-team` | View team info | Anywhere (DM opens) |
| `/upcoming-scrims` | See scheduled scrims | Anywhere (DM opens) |
| `/help` | Show help | Anywhere |

---

### Managers Only

| Command | Description | Where to run |
|---------|-------------|--------------|
| `/add-player @user` | Add player to team | Server |
| `/remove-player @user` | Remove player | Server |
| `/schedule-scrim` | Schedule scrim + poll team | Server |
| `/find-time` | Find best available times | Anywhere |
| `/team-stats` | View team analytics | Anywhere |
| `/list-players` | List all players | Anywhere |
| `/upload-scrim` | Upload CSV log | Server |

---

## Data Flow

### Availability Updates
```
Player: /my-availability
  ↓
Bot DMs player
  ↓
Player replies: "Weekdays 6-10pm"
  ↓
Bot parses → Firebase
  ↓
Website updates instantly
  ↓
Manager sees availability in /team-stats
```

### Scrim Scheduling
```
Manager: /schedule-scrim date:friday time:8pm
  ↓
Bot creates poll in Firebase
  ↓
Bot DMs all team members
  ↓
Players click ✅/❌/⏰
  ↓
Manager gets real-time DM updates
  ↓
24h before: Reminders to confirmed players
1h before: Final reminder
  ↓
Scrim shows on website schedule
```

---

## Privacy & Security

### Player Privacy
- Availability is **only visible to your team manager**
- Scrim responses are private DMs
- Other players can't see your schedule
- Website shows aggregated data only

### Manager Verification
- Managers must verify before using management commands
- Verification links your Discord → website account
- Prevents unauthorized team modifications
- One-time setup

### Data Storage
- All data in Firebase (encrypted at rest)
- Discord IDs + availability stored per-team
- No message content is logged
- Verification codes expire in 10-15 minutes

---

## Troubleshooting

### "The application did not respond"
**Cause:** Bot didn't acknowledge in time (usually fixed now)

**Solutions:**
1. Wait a moment and try again
2. Check if bot is online (green status in Discord)
3. Make sure bot has DM permissions enabled

---

### "You are not a verified manager"
**Cause:** You haven't verified your Discord account for manager privileges

**Solutions:**
1. Go to website → Team Management → Settings
2. Click "VERIFY DISCORD (MANAGERS)" button
3. Check Discord DMs and click "✅ Confirm"

---

### "No teams found for this server"
**Cause:** No manager has verified their Discord for this server yet

**Solutions:**
1. Manager needs to verify Discord on the website (Team Management → Settings → "Verify Discord")
2. Invite the bot to your Discord server
3. Then managers can add players via `/add-player`

---

### Player can't set availability
**Possible causes:**
1. Not on a team yet → Ask manager to run `/add-player @you`
2. DMs disabled → Enable DMs from server members
3. Bot blocked → Unblock the bot in Discord settings

---

### Scrim poll not received
**Check:**
1. DMs from server members enabled
2. Bot not blocked
3. You're actually on the team (`/my-team` to verify)
4. Manager scheduled for correct team

---

## Best Practices

### For Managers
1. **Verify first** - Do website verification before anything else
2. **Add players early** - Add everyone at once so they can set availability
3. **Use `/find-time`** - Check availability before scheduling scrims
4. **Schedule in advance** - Give players 24+ hours notice
5. **Check `/team-stats`** - Monitor engagement weekly

### For Players
1. **Set availability immediately** - Run `/my-availability` as soon as you join
2. **Update regularly** - If your schedule changes, update it!
3. **Respond to polls quickly** - Manager gets notified in real-time
4. **Use natural language** - "Weekdays 6-10pm" works better than trying to be technical

---

## Advanced Features

### Natural Language Parsing

The bot understands many availability formats:

| You say | Bot understands |
|---------|-----------------|
| "Weekdays after 6pm" | Mon-Fri 18:00-23:00 |
| "Monday Wednesday Friday 7-9pm" | Mon/Wed/Fri 19:00-21:00 |
| "Weekends anytime" | Sat/Sun 00:00-23:00 |
| "Tuesday Thursday 8-11pm" | Tue/Thu 20:00-23:00 |
| "Anytime" | Every day, all hours |

---

### Automated Reminders

Confirmed players (✅ Yes) automatically receive:
- **24-hour reminder**: "Scrim tomorrow at 7pm!"
- **1-hour reminder**: "Scrim starting in 1 hour!"

**No spam:** Only confirmed players get reminders.

---

### Real-Time Manager Updates

When players respond to scrim polls, you instantly get a DM:

```
📝 Scrim Poll Response
player123 responded: Available

Scrim: 2024-03-15 at 19:00

Response Summary:
✅ Yes: 4 | ❌ No: 1 | ⏰ Maybe: 0

Total Responses: 5 player(s)
```

---

### Multi-Team Support

**Managers with multiple teams:**
- All commands work across all your teams
- When adding players or scheduling, you pick which team
- `/team-stats` and `/find-time` show all your teams

**Players on multiple teams:**
- `/my-team` shows all your teams
- `/my-availability` updates all teams at once
- Scrim polls are team-specific

---

## Technical Details

### Data Synchronization
- **Instant sync**: Discord ↔ Firebase ↔ Website
- **Real-time**: Changes appear immediately everywhere
- **Reliable**: Offline-tolerant, retries on failure

### Firestore Collections Used
- `teams` - Team roster and data
- `scrimPolls` - Active scrim polls
- `pendingAvailabilityUpdates` - Temporary: tracks ongoing availability conversations
- `discordVerifications` - Manager verification codes
- `addPlayerSessions` - Temporary: team picker for `/add-player`
- `scheduleScrimSessions` - Temporary: team picker for `/schedule-scrim`

### Availability Data Structure
```javascript
{
  availability: [
    { day: 'Monday', startHour: 18, endHour: 22 },
    { day: 'Wednesday', startHour: 19, endHour: 23 }
  ],
  availabilityText: "Monday Wednesday 6-11pm"
}
```

---

## FAQs

### Can players see other players' availability?
**No.** Only managers can see individual availability via `/list-players` or website.

### Do players need a website account?
**No.** Players only interact with Discord. Website is optional for viewing team profiles.

### Can I manage multiple teams?
**Yes.** Verify once, manage all your teams. Commands show pickers when needed.

### What if a player doesn't have Discord?
They won't be able to use bot features. They can still be added to the team on the website, but won't get availability requests or scrim polls.

### Can I schedule scrims without polling?
Not yet, but you can manually add scrims to the website team schedule.

### How long do verification codes last?
- Manager verification: 10 minutes
- Invite codes: 10 minutes
- Link sessions: 15 minutes

### Can I cancel a scheduled scrim?
Currently you need to message players manually. We'll add `/cancel-scrim` in a future update.

---

## Support & Feedback

### Getting Help
1. **In Discord:** Type "help" in a DM with the bot
2. **Command help:** Run `/help` to see all commands
3. **Website:** Check Team Management → Settings for verification status

### Report Issues
If something isn't working:
1. Check bot is online (green status)
2. Check logs if you're the bot admin
3. Try the command again (most errors are transient)

### Feature Requests
Want a new feature? Let us know! The bot is actively being improved.

---

## Changelog

### v2.0 (Current) - DM-First Experience
- ✅ `/my-availability` - Natural language availability setting
- ✅ `/my-team` - DM-based team info
- ✅ `/upcoming-scrims` - See all scheduled scrims
- ✅ `/add-player` - Manager adds server members
- ✅ `/remove-player` - Manager removes players
- ✅ `/schedule-scrim` - Schedule + poll team automatically
- ✅ `/find-time` - AI-powered time suggestions
- ✅ `/team-stats` - Detailed analytics
- ✅ Automated 24h and 1h reminders
- ✅ Real-time manager notifications
- ✅ Website verification for managers
- ✅ Multi-team support
- ✅ CPU throttling fix (no more timeouts!)

### v1.0 (Previous) - Basic Features
- `/request-availability` - Manual availability requests
- `/list-players` - View roster
- `/upload-scrim` - CSV upload

---

## Command Cheat Sheet

### Quick Copy-Paste Commands

**For Players:**
```
/my-availability
/my-team  
/upcoming-scrims
```

**For Managers:**
```
/add-player @username
/schedule-scrim date:tomorrow time:7pm
/find-time
/team-stats
```

**Example Availability Responses:**
```
Weekdays 6-10pm
Monday Wednesday Friday 7-9pm
Weekends anytime
Tuesday Thursday 8-11pm
```

---

## Success Story Example

**Manager (Sarah):**
1. Creates "Storm Surge" on website ✅
2. Clicks "Verify Discord" button on website ✅
3. Confirms DM from bot ✅
4. Runs `/add-player @john @jane @mike @lisa @tom @alex` ✅

**Players receive welcome DMs:**
```
🎮 Welcome to Storm Surge!
You've been added by sarah123!

Set Your Availability: /my-availability
View Team Info: /my-team
```

**Each player runs `/my-availability`:**
- John: "Weekdays 7-11pm"
- Jane: "Monday Wednesday Friday 8-10pm"
- Mike: "Weekends anytime"
- Lisa: "Tuesday Thursday 7-10pm"
- Tom: "Weekdays after 6pm"
- Alex: "Anytime"

**Sarah checks best times:**
```
/find-time

📊 Best Times for Storm Surge
1. Monday 20:00 - 22:00 - 5/6 players (83%) ✅
```

**Sarah schedules:**
```
/schedule-scrim date:monday time:8pm notes:Practice vs Team X
```

**All players get DM polls → 5 say ✅, 1 says ❌**

**24 hours before:** 5 players get reminder ⏰

**1 hour before:** 5 players get final reminder ⏰

**Scrim happens!** 🎮

---

## Tips & Tricks

### For Best Results
1. **Have all players set availability within the first week**
2. **Use `/find-time` before scheduling** - save time polling when no one's available
3. **Schedule 24+ hours in advance** - gives players time to see the DM
4. **Respond to polls quickly** - helps managers plan
5. **Update availability when life changes** - takes 30 seconds via DM

### Power User Tips
- **Manager with 2+ teams?** The bot always asks which team when needed
- **Player on 2+ teams?** `/my-team` shows all, `/my-availability` updates all
- **Natural language works!** Don't overthink availability formats
- **Bot remembers:** Once you set availability, it persists until you update it

---

## Roadmap (Future Features)

- `/cancel-scrim` - Cancel a scheduled scrim
- `/reschedule-scrim` - Change time/date
- `/set-role @player Tank` - Assign player roles
- `/team-calendar` - See all team events
- `/substitute @player1 @player2` - Sub players for a scrim
- **AI-powered scheduling** - "Schedule scrims for next month based on availability"
- **Conflict detection** - Warn if scheduling during low-availability times
- **Performance tracking** - Correlate scrim times with win rates

---

*Last updated: February 7, 2026*
*Bot version: 2.0*
*All features tested and deployed ✅*

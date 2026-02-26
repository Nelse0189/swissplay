# Discord Bot DM-First Roadmap

## Vision
Make the bot completely player-friendly with DM-based interactions. Only managers need the website.

---

## Phase 1: Security & Foundation ✅ (Implementing Now)

### 1.1 Website Verification for Managers ✅
**Goal**: Secure manager verification via website button

**Implementation**:
- Add "Verify Discord" button to Settings tab (website)
- Button creates verification code and sends DM to manager
- Manager clicks button in DM to confirm
- Links Discord → Manager account in Firebase
- Prevents unauthorized team modifications

**Security**: Verification required before `/add-player` or team modifications

---

### 1.2 Player Availability DM Flow ✅
**Goal**: Players set availability via DM conversation

**Commands**:
- `/my-availability` - Opens DM conversation
- Bot asks: "What days/times are you available?"
- Player responds naturally: "Weekdays 6-10pm, weekends anytime"
- Bot parses and updates Firebase
- Confirmation: "✅ Availability updated!"

**Data Structure**:
```javascript
{
  availability: [
    { day: 'Monday', startHour: 18, endHour: 22 },
    { day: 'Tuesday', startHour: 18, endHour: 22 },
    ...
  ]
}
```

---

## Phase 2: Manager Team Management (Next Priority)

### 2.1 `/add-player` Command
**Goal**: Manager adds Discord server members to their team

**Flow**:
1. Manager runs `/add-player` in server
2. Bot shows dropdown of server members (not yet on any team)
3. Manager selects player
4. If manager owns multiple teams, bot asks which team
5. Bot creates member entry in Firebase:
   ```javascript
   {
     discordId: '...',
     discordUsername: '...',
     name: '<Discord display name>',
     roles: ['Player'],
     availability: []
   }
   ```
6. Confirmation: "✅ Added @player to Team A"

**Validation**:
- Manager must be verified (Phase 1.1)
- Player not already on a team
- Manager owns the target team

---

### 2.2 `/remove-player` Command
**Goal**: Manager removes player from team

**Flow**:
1. `/remove-player` in server or DM
2. Bot shows dropdown of current team members
3. Manager selects player to remove
4. Confirmation prompt
5. Removes from Firebase
6. "✅ Removed @player from Team A"

---

### 2.3 `/my-team` Command (Player)
**Goal**: Players see their team and schedule via DM

**Response**:
```
📋 Your Team: Team A

👥 Roster:
• @player1 (Tank)
• @player2 (DPS) - You
• @player3 (Support)

📅 Team Schedule:
• Monday 7-9pm (3 players available)
• Wednesday 8-10pm (4 players available)

Your Availability: Weekdays 6-10pm
```

---

### 2.4 `/list-team` Command (Manager)
**Goal**: Managers see full team roster with availability

**Response**:
```
📋 Team A - Full Roster

✅ Available Now (3):
• @player1 - Mon-Fri 6-11pm
• @player2 - Weekends only  
• @player3 - Anytime

⏰ Limited (2):
• @player4 - Tue/Thu only
• @player5 - Weekends 2-6pm

❌ Not Set (1):
• @player6 - No availability set
```

---

## Phase 3: Advanced Scheduling

### 3.1 `/schedule-scrim` Command (Manager)
**Goal**: Manager proposes scrim time, bot polls team

**Flow**:
1. Manager: `/schedule-scrim date:2024-03-15 time:19:00`
2. Bot DMs all team members:
   ```
   📅 Scrim Request from @manager
   
   Date: March 15, 2024
   Time: 7:00 PM
   
   Can you make it?
   [✅ Yes] [❌ No] [⏰ Maybe]
   ```
3. Bot tracks responses
4. Manager gets summary:
   ```
   📊 Scrim Poll Results (5/6 responded):
   ✅ Yes (4): @p1, @p2, @p3, @p4
   ❌ No (1): @p5
   ⏰ Maybe (0):
   ❓ No Response (1): @p6
   ```

**Auto-scheduling**: If 5+ players say yes, bot adds to team schedule

---

### 3.2 `/find-time` Command (Manager)
**Goal**: Bot suggests best times based on team availability

**Flow**:
1. Manager: `/find-time next-week`
2. Bot analyzes all player availability
3. Responds with top 3 times:
   ```
   📊 Best Times (Next 7 Days):
   
   1. Wed 8pm - 6/6 players ✅
   2. Thu 7pm - 5/6 players
   3. Fri 9pm - 5/6 players
   
   Use /schedule-scrim to lock in a time!
   ```

---

### 3.3 `/set-availability` Enhanced (Player)
**Goal**: Natural language availability setting

**Examples**:
- "Weekdays after 6pm"
- "Mon/Wed/Fri 7-10pm"
- "Anytime except Tuesday"
- "Weekends only"

Bot parses with simple regex patterns + fallback to buttons:
```
When are you available?
[Weekdays] [Weekends] [Specific Days] [Custom]
```

---

## Phase 4: Polish & Automation

### 4.1 Scrim Reminders
- 24 hours before: "📅 Scrim tomorrow at 7pm!"
- 1 hour before: "⏰ Scrim starting in 1 hour!"
- Auto-DM to confirmed players

---

### 4.2 Availability Analytics (Manager)
**Command**: `/team-stats`

```
📊 Team A - Availability Report

Average Availability: 4.2 players/day

🟢 High Coverage (5+ players):
• Monday 6-10pm
• Wednesday 7-11pm

🟡 Medium (3-4 players):
• Tuesday evenings
• Thursday evenings

🔴 Low Coverage (<3 players):
• Weekend mornings
• Friday afternoons
```

---

### 4.3 Role Management
**Commands**:
- `/assign-role @player Tank` - Assign player role
- `/my-role Tank` - Player sets their preferred role
- Bot shows roles in team lists

---

## Technical Architecture

### Data Model Updates

**teams collection**:
```javascript
{
  id: 'team123',
  name: 'Team A',
  discordGuildId: '...',
  ownerId: 'firebase-uid',
  managerDiscordIds: ['disc-id-1', 'disc-id-2'],
  members: [
    {
      uid: 'firebase-uid', // optional, only if linked to website
      discordId: 'discord-id',
      discordUsername: 'username',
      name: 'Display Name',
      email: 'optional@email.com',
      roles: ['Player'], // or ['Manager', 'Player']
      gameRole: 'Tank', // optional: Tank/DPS/Support
      availability: [
        { day: 'Monday', startHour: 18, endHour: 22 },
        { day: 'Tuesday', startHour: 18, endHour: 22 }
      ],
      availabilityText: 'Weekdays 6-10pm' // human-readable
    }
  ],
  schedule: [
    {
      date: '2024-03-15',
      time: '19:00',
      type: 'scrim',
      confirmedPlayers: ['disc-id-1', 'disc-id-2'],
      maybeCount: 1,
      noCount: 0
    }
  ]
}
```

**discordVerifications collection** (for manager verification):
```javascript
{
  id: 'verification-code',
  discordUserId: 'discord-id',
  discordUsername: 'username',
  userUid: 'firebase-uid',
  userEmail: 'manager@email.com',
  teamId: 'team-id',
  status: 'pending', // pending | confirmed | denied
  createdAt: timestamp,
  verifiedAt: timestamp // when manager clicked button
}
```

---

## Security Model

1. **Manager Verification Required**:
   - `/add-player`, `/remove-player`, `/schedule-scrim` check:
     ```javascript
     const team = await getTeamByManagerDiscordId(interaction.user.id);
     if (!team) {
       return error('You must verify your manager account on the website first');
     }
     ```

2. **Player Commands (No Verification)**:
   - `/my-availability`, `/my-team`, `/my-role` work for anyone
   - Bot auto-creates player entry if not in system

3. **DM Privacy**:
   - Availability settings = DM only (private)
   - Team polls = DM only
   - Managers can't see individual DM conversations

---

## Implementation Priority

**Week 1** (Phase 1):
- [x] Website verification button
- [x] Basic DM availability flow
- [x] Firebase sync

**Week 2** (Phase 2):
- [ ] `/add-player` command
- [ ] `/remove-player` command
- [ ] `/my-team` command

**Week 3** (Phase 3):
- [ ] `/schedule-scrim` with polling
- [ ] `/find-time` analytics

**Week 4** (Phase 4):
- [ ] Reminders
- [ ] Stats/analytics
- [ ] Polish

---

## Current Status

✅ `/link` - Self-serve team joining
✅ `/list-players` - View team roster
✅ `/request-availability` - Availability requests (existing)
✅ CPU throttling disabled
✅ Verification DM flow

🚧 **Now Implementing**: Phase 1 (Verification + Player DMs)

---

## Notes

- Keep all player interactions in DMs (privacy)
- Managers can use server commands + DMs
- Website is read-only for players (they see team schedule)
- Website is read-write for managers (full team management)

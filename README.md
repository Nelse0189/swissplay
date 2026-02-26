# SwissPlay - Overwatch Scrim Finder

A React + Vite web application for Overwatch teams to find and schedule scrims. Teams can input member availability, generate schedules, and request scrims with other teams.

## Features

- **Team Management**: Create teams and input individual member availability
- **Schedule Generation**: Automatically generates common available time slots for all team members
- **Scrim Finder**: Find teams with matching availability and request scrims
- **Scrim Requests**: Manage incoming and outgoing scrim requests

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Firebase Configuration

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Authentication (Email/Password)
3. Create a Firestore database
4. Copy your Firebase configuration and update `src/firebase/config.js`:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-auth-domain",
  projectId: "your-project-id",
  storageBucket: "your-storage-bucket",
  messagingSenderId: "your-messaging-sender-id",
  appId: "your-app-id"
};
```

### 3. Firestore Collections

The app uses the following Firestore collections:
- `teams` - Stores team information and schedules
- `scrimRequests` - Stores scrim requests between teams

### 4. Run Development Server

```bash
npm run dev
```

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Header.jsx      # Navigation header
│   ├── Footer.jsx      # Footer component
│   └── DigitalOverlay.jsx  # Background digital overlay effect
├── pages/              # Page components
│   ├── Home.jsx        # Home page
│   ├── Auth.jsx        # Authentication page
│   ├── TeamManagement.jsx  # Team creation and management
│   └── FindScrims.jsx  # Scrim finder and request management
├── firebase/           # Firebase configuration
│   └── config.js       # Firebase setup
└── App.jsx             # Main app component with routing
```

## Usage

1. **Sign Up/Sign In**: Create an account or sign in
2. **Create Team**: Go to Teams > Overwatch to create a team
3. **Add Members**: Add team members and their availability using the time grid
4. **View Schedule**: See automatically generated common available times
5. **Find Scrims**: Go to Find Scrims to see teams with matching availability
6. **Request Scrims**: Request scrims with other teams at matching time slots
7. **Manage Requests**: Accept or reject incoming scrim requests

## Technologies

- React 19
- Vite
- React Router DOM
- Firebase (Authentication & Firestore)
- date-fns

## License

MIT

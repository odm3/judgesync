# JudgeSync Frontend

A Progressive Web App (PWA) for collaborative VEX Robotics judging.

## Features

- **Event Lookup**: Enter a RobotEvents SKU to fetch event details
- **Offline-First**: Works without internet after initial load
- **IndexedDB Caching**: Event data cached locally for 1 hour
- **Responsive Design**: Works on mobile, tablet, and desktop
- **PWA Support**: Install as an app on any device

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A RobotEvents API token (get one from https://www.robotevents.com/api/v2)

### Installation

1. Copy the environment template:
```bash
cp .env.example .env
```

2. Add your RobotEvents API token to `.env`:
```
VITE_ROBOTEVENTS_TOKEN=your_token_here
```

3. Install dependencies:
```bash
npm install
```

4. Start the dev server:
```bash
npm run dev
```

5. Open http://localhost:5173/judgesync in your browser

### Building for Production

```bash
npm run build
```

The built files will be in `../dist/frontend/`

## Usage

1. **Enter Event SKU**: Type a RobotEvents SKU in the format `RE-XXX-XXXX` (e.g., `RE-VRC-23-5434`)
2. **View Event Details**: See event name, date, location, program, and divisions
3. **Begin Setup**: Click "Begin Setup" to start configuring your judging instance (coming soon)

## Technology Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS v4** - Styling
- **Dexie.js** - IndexedDB wrapper for caching
- **robotevents npm package** - RobotEvents API client
- **Lucide React** - Icon library
- **Vite PWA** - Progressive Web App support

## Project Structure

```
src/
├── components/
│   ├── ui/              # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── Alert.tsx
│   │   └── Spinner.tsx
│   ├── EventCard.tsx    # Event details display
│   └── EventSkuInput.tsx # SKU input with validation
├── hooks/
│   └── useEventLookup.ts # Event fetching & caching
├── services/
│   └── robotevents.ts   # RobotEvents API integration
├── lib/
│   └── utils.ts         # Utility functions
├── App.tsx              # Main app component
├── main.tsx             # App entry point
└── index.css            # Global styles
```

## Testing Event Lookup

Try these real RobotEvents SKUs:
- `RE-VRC-23-5434` - VRC event
- `RE-VIQRC-23-1234` - VIQRC event
- Any valid event SKU from robotevents.com

## Next Steps

- [ ] Instance creation and setup flow
- [ ] Team/judge management
- [ ] Judging rubrics configuration
- [ ] Real-time sync with Instance Server
- [ ] Offline judging support
- [ ] Export functionality

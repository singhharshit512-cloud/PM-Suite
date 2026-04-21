# AI Work-OS Platform

## 1. System Architecture Overview
The application is a full-stack unified productivity suite (Work OS) featuring an embedded AI document agent ("Cowork"), an automated meeting note-taker (via Recall.ai), task management, and Google Maps/Calendar/Drive integrations.

**Stack:**
*   **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, `shadcn/ui` (Radix UI primitives).
*   **Backend:** Express (Node.js) acting as an API gateway, proxy solver, and secure integration layer (`server.ts`).
*   **Database & Auth:** Firebase Firestore (NoSQL) & Firebase Auth (Google OAuth).
*   **LLM Engine:** Gemini 2.5 Pro via `@google/genai` (backend) & `generativelanguage.googleapis.com` proxy.
*   **External APIs:** Google Calendar, Google Drive (docs list), Google Docs API (batch edits), Recall.ai (meeting bots).

---

## 2. Product Working & Feature Walkthrough

The platform serves as a central hub (Work OS) for product managers, engineers, and professionals to unify their tasks, meetings, AI assistance, and documentation in a single pane of glass.

### Module 1: Authentication & Onboarding
*   **What it does:** Users log in securely via Google OAuth. During the login flow, they are prompted to authorize the app to access specific scopes (Drive, Docs, Calendar). 
*   **User Flow:** A user clicks "Sign in with Google", authenticates, and is deposited onto the main Dashboard. A dual-token system ensures Firebase maintains their database session, while your backend safely holds tokens to query Google APIs natively on their behalf.

### Module 2: The Dashboard (`/`)
*   **What it does:** The mission control center for the user's day.
*   **User Flow:** Upon logging in, the user sees a high-level aggregate of their day. It instantly fetches their upcoming Google Calendar events to show their schedule snippet, and aggregates open/pending tasks from the internal task database. It provides quick actions to jump into active meetings or to-dos.

### Module 3: Cowork - AI Document Agent (`/cowork`)
*   **What it does:** Cowork is the killer feature. Instead of a generic LLM chat, Cowork is a specialized AI "colleague" directly wired into the user's Google Drive. 
*   **User Flow:** 
    1. The user navigates to the "Cowork" tab.
    2. The UI automatically pulls in a list of their recent Google Docs.
    3. The user selects a document (making it the "Active Document").
    4. The user chats with Cowork (e.g., *"Write a PRD for the new matching feature and put it in this doc"*).
    5. Cowork generates the content according to stringent templates (PRD, Research Doc, SOP, Meeting Notes) and directly uses the **Google Docs API** to physically append/insert the finalized text into the user's actual live document. 

### Module 4: Meeting Notes & Recall.ai Bot (`/notes`)
*   **What it does:** Replaces manual note-taking. Users can dispatch an AI bot to live meetings (Zoom, MS Teams, Google Meet) to passively transcribe and summarize.
*   **User Flow:** 
    1. A user enters a Meeting URL.
    2. The backend sends a request to **Recall.ai**, which provisions a headless video client to join the call.
    3. Once the meeting completes, a webhook fires to the backend.
    4. The backend grabs the raw transcript, runs it through Gemini 2.5 Pro to extract Agendas, Decisions, and Action Items.
    5. The structured notes are appended to the internal `Notes` database for later reference.

### Module 5: Task Management (`/tasks`)
*   **What it does:** A kanban/list hybrid for manual or automated tracking of to-dos.
*   **User Flow:** Users can manually create tasks, set due dates, add descriptions, and toggle them open/closed. Because it is backed by Firebase Firestore, changes sync in real-time across multiple logged-in sessions. Action items derived from meeting bots (Module 4) can flow into this pipeline.

---

## 3. Codebase Map & Directory Structure

```text
/
├── package.json               # Full-stack dependencies + Custom 'dev': 'tsx server.ts' script
├── server.ts                  # [CRITICAL] Core Express Backend Gateway
├── src/
│   ├── firebase.ts            # Client-side Firebase init (auth, db)
│   ├── App.tsx                # React Router topology and theme definitions
│   ├── main.tsx               # Standard React DOM mount
│   ├── contexts/
│   │   └── AuthContext.tsx    # Firebase Auth state & Google OAuth consent (Drive/Docs scopes)
│   ├── lib/
│   │   ├── drive.ts           # Google Drive file fetching helper
│   │   ├── calendar.ts        # Communicates with /api/calendar/events proxy
│   │   ├── types.ts           # Global TypeScript interfaces (Task, Meeting, Note)
│   │   └── gemini.ts          # Client-side Gemini prompt helpers
│   ├── components/
│   │   ├── ui/                # shadcn UI components (button, card, dialog, input, textarea)
│   │   ├── Layout.tsx         # Sidebar navigation + Main content wrapper
│   │   ├── Login.tsx          # Initial entry point handling Google SignIn
│   │   ├── ProtectedRoute.tsx # Route guard checking AuthContext
│   │   └── RichTextEditor.tsx # Tiptap headless editor for internal notes
│   └── pages/
│       ├── Dashboard.tsx      # Unified view: Today's meetings, Open Tasks, Calendar logic
│       ├── Notes.tsx          # Meeting Notes registry + Recall.ai bot controller
│       ├── Tasks.tsx          # Standalone Kanban/List view of Firestore tasks
│       └── Cowork.tsx         # AI Document Agent chat UI interacting with live Google Docs
```

---

## 4. Core Features & Technical Implementation

### A. Authentication & Google Integrations (`AuthContext.tsx` & `/api/auth`)
*   **Dual-Token System:** The app uses Firebase Auth for application identity (DB access) and pure Google OAuth for API access (Docs, Drive, Calendar).
*   **Scope Injection:** `AuthContext.tsx` extends the Firebase Google Provider to forcefully solicit scopes:
    *   `https://www.googleapis.com/auth/calendar.readonly`
    *   `https://www.googleapis.com/auth/drive.readonly`
    *   `https://www.googleapis.com/auth/documents`
*   **Backend Auth Flow:** To secure `refresh_tokens` for server-side processing, `server.ts` hosts:
    *   `/api/auth/url`: Generates a backend consent screen URL.
    *   `/api/auth/callback`: Collects tokens and sends them back via `window.opener.postMessage()`.

### B. Cowork: Embedded Google Docs AI Agent (`Cowork.tsx` & `/api/cowork/chat`)
This is a flagship feature allowing users to converse with an AI that actively reads and writes to their live Google Docs.

*   **Frontend Data Hydration (`Cowork.tsx`):**
    *   Uses `fetchRecentDocs()` which calls the backend `/api/drive/recent` endpoint.
    *   Supplies the `docResults` context directly to the LLM so it is aware of real Google Document IDs owned by the user.
*   **Backend Chat Processing (`server.ts` -> `/api/cowork/chat`):**
    *   System Context is injected per message parsing.
    *   If the AI needs to edit a document, it outputs a strict JSON payload: `{"type": "insertToDoc", "content": "..."}`.
    *   The backend strips this JSON out of the display text and immediately initializes the `googleapis` library.
    *   It uses the auth tokens passed in the request body to execute a `docs.documents.batchUpdate()` using `location: { index: lastIndex }` to physically mutate the Google Doc document natively.

### C. Automated Meeting Notes & Bot (`Notes.tsx` & `/api/bot/*`)
Integrates Recall.ai to send headless clients into Zoom/Meet/Teams calls for transcription.

*   **Bot Dispatch (`/api/bot/join`):** Takes a meeting URL and POSTs to Recall.ai triggering a `gladia_v2_streaming` bot.
*   **Webhook Listener (`/api/bot/webhook`):** Waits for Recall.ai to fire `bot.status_change == 'done'` (ready for transcript pulling).
*   **Data Aggregation (`/api/bot/meeting/:meetingId`):** Fetches the completed transcript and automatically summarizes it via Gemini.
*   **Notes Syncing (`Notes.tsx`):** Saves the AI-generated agenda, decisions, and action items structurally into Firestore (`db: notes collection`).

### D. Tasks & Dashboard (`Tasks.tsx` & `Dashboard.tsx`)
*   **Database:** Bound directly to Firestore's `onSnapshot` real-time listeners.
*   **Tasks schema:** Contains `title`, `description`, `status` (open/closed), `dueDate`, `userId`.
*   **Dashboard view:** Cross-aggregates `Tasks` queries (tasks due today) with Calendar API outputs (meetings fetched from `calendar.ts`).

---

## 5. Backend Express Gateway (`server.ts` detail)
Because the app runs via Vite + Express (Fullstack Development pattern inside AI Studio), the environment variable keys (like `GEMINI_API_KEY`, `GOOGLE_CLIENT_SECRET`, `RECALL_API_KEY`) are protected server-side securely.

#### Endpoints index:
*   `GET /api/auth/url` - Returns Google OAuth consent URL.
*   `GET /api/auth/callback` - OAuth token exchange.
*   `POST /api/calendar/events` - Pass-through to `googleapis` to fetch upcoming user events.
*   `POST /api/drive/recent` - Pass-through to fetch files with `application/vnd.google-apps.document`.
*   `POST /api/gemini/generate` - Server-side explicit Gemini request generator (with specific prompt bounds for error checking, quotas tracking, etc.).
*   `POST /api/cowork/chat` - The advanced multi-turn agent handler. Hardcoded with a stringent System prompt maintaining formatting rules (PRD, Research Doc, Meeting Notes layouts).
*   `POST /api/bot/join` - Recall.ai initialization.
*   `POST /api/bot/webhook` - Recall.ai completion listener.
*   `GET /api/bot/meeting/:meetingId` - Transcript fetching.

---

## 6. Security Constraints & System Variables

*   **Vite Exclusions:** Any token beginning with `VITE_` is client-side. The app explicitly hides `GEMINI_API_KEY` behind the Node backend routes. Do NOT expose `process.env.GEMINI_API_KEY` to Vite.
*   **Firestore Security:** The client queries Firestore directly assuming rules restrict paths based on User ID matching the Auth Token (`where('userId', '==', user.uid)` is strictly appended to all queries in React components).
*   **Error Catching (Cowork Backend):** Look out for `Quota exceeded` logic explicitly mapped in the `/api/cowork/chat` catching mechanism, gracefully decaying the UI if the AI quota limit is hit.

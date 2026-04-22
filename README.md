# ⚡ Live Code Collaboration & Interactive Whiteboard

A real-time collaborative code editor and infinite whiteboard platform built with React, Monaco Editor, and WebSockets. This tool enables seamless remote pair programming, system design discussions, and team communication in a single, unified workspace.

---

## ✨ Features

### 💻 Code Editor

- **Real-time Collaboration**: Code syncs instantly across all users in the room with zero echo-looping.
- **Monaco Editor Integration**: VS Code-like experience with syntax highlighting and auto-completion.
- **Multi-Language Support**: Write and sync code in Python, JavaScript, Java, and C++.
- **Remote Execution Engine**: Run code against standard input and view standard output/errors with execution time tracking.

### 🎨 Miro-Style Whiteboard

- **Infinite Panning**: Smooth grab-and-drag navigation across a dotted infinite graph grid.
- **Zero-Lag Drawing**: Direct-to-context 60fps rendering for smooth pen and eraser strokes.
- **Rich Toolset**: Select, Pen, Eraser, Text, Line, Rectangle, Circle, and Triangle.
- **Interactive Text Tool**: Click to type, click away (or press Enter) to permanently burn the text onto the canvas—fully respecting infinite pan coordinates.
- **Professional History**: Robust Undo/Redo stack that perfectly tracks strokes, shapes, and text, resetting future history automatically on new actions.

### 💬 Communication & Workspace

- **Live Chat**: Integrated chat popup with unread message badges to keep the team synced.
- **Room-Based Architecture**: Create a secure room and share the Room ID for others to join.
- **Avatar System**: Auto-generated custom avatars for users joining the session.
- **Admin Controls**: Session creators can forcefully terminate the workspace for all participants.

---

## 🛠️ Tech Stack

| Layer                  | Technology                                                         |
| ---------------------- | ------------------------------------------------------------------ |
| **Frontend**           | React (Vite/CRA), HTML5 Canvas API, CSS3                           |
| **Editor**             | `@monaco-editor/react`                                             |
| **Real-time Sync**     | WebSockets (`ws`)                                                  |
| **Backend (Expected)** | Node.js/Python WebSocket Server & Code Execution Endpoint (`/run`) |

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- A running WebSocket server and execution backend at `localhost:8000`

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/live-code-collab.git
   cd live-code-collab
   ```

2. **Install dependencies**

   ```bash
   npm install
   # or
   yarn install
   ```

3. **Start the development server**

   ```bash
   npm run dev
   # or
   yarn start
   ```

---

## 🔌 Backend Configuration Requirements

To fully utilize this frontend, ensure your backend exposes the following:

1. **WebSocket Server** at `ws://localhost:8000/ws/{roomId}` handling events:
   `join`, `create`, `chat`, `code`, `language`, `draw`, `undo`, `clear_board`, and `terminate`

2. **REST API** at `POST http://localhost:8000/run` accepting:

   ```json
   { "code": "...", "language": "...", "input": "..." }
   ```

   And returning:

   ```json
   { "output": "...", "error": "...", "time": "...", "status": "..." }
   ```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/bpradeepraj2005/Live-Code-Collab/issues).

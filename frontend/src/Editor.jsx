import { useRef, useState } from "react";
import Editor from "@monaco-editor/react";

export default function EditorPage() {
  const editorRef = useRef(null);
  const socketRef = useRef(null);
  const isRemote = useRef(false);

  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState("");
  const [username, setUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [mode, setMode] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [roomInput, setRoomInput] = useState("");

  const [userList, setUserList] = useState([]);
  const [output, setOutput] = useState("");
  const [language, setLanguage] = useState("python");

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [toast, setToast] = useState("");

  const [programInput, setProgramInput] = useState("");

  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [execTime, setExecTime] = useState(null);
  const [executionStatus, setExecutionStatus] = useState(null); // 🟢 ADD THIS
  const [brushColor, setBrushColor] = useState("#020617"); // Dark ink default

  const [tool, setTool] = useState("pen"); // "pen" or "eraser"
  const undoStack = useRef([]);

  // ---------------- SOCKET ----------------
  function connectSocket(name, roomId, admin) {
    const socket = new WebSocket(`ws://localhost:8000/ws/${roomId}`);
    socketRef.current = socket;

    socket.onopen = () => {
      if (admin) socket.send(JSON.stringify({ type: "create" }));
      socket.send(JSON.stringify({ type: "join", username: name }));
      setConnected(true);
    };

    socket.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.type === "users") {
        setUserList(data.list);
        return;
      }

      if (data.type === "terminate") {
        setToast("Session ended");
        setTimeout(() => window.location.reload(), 1200);
        return;
      }

      if (data.type === "output") {
        setOutput(data.output);
        if (data.time) setExecTime(data.time);
        if (data.status) setExecutionStatus(data.status); // 🟢 ADD THIS
        return;
      }

      if (data.type === "chat") {
        const msg = {
          user: data.user || data.username || "User",
          text: data.text || data.message || "",
          time: data.time || "",
        };

        setChatMessages((prev) => [...prev, msg]);

        if (!chatOpen) {
          setUnread((u) => u + 1);
        }
        return;
      }

      if (data.language) setLanguage(data.language);

      if (data.code && editorRef.current) {
        isRemote.current = true;
        editorRef.current.setValue(data.code);
        isRemote.current = false;
      }
    };
  }

  // ---------------- CREATE ----------------
  function createRoom() {
    const id = Math.random().toString(36).substring(2, 8);
    setRoom(id);
    setUsername(nameInput);
    setIsAdmin(true);
    connectSocket(nameInput, id, true);
  }

  // ---------------- JOIN ----------------
  function joinRoom() {
    setRoom(roomInput);
    setUsername(nameInput);
    connectSocket(nameInput, roomInput, false);
  }

  // ---------------- EDITOR ----------------
  function handleMount(editor) {
    editorRef.current = editor;

    editor.onDidChangeModelContent(() => {
      if (isRemote.current) return;

      socketRef.current.send(
        JSON.stringify({
          code: editor.getValue(),
          language,
        }),
      );
    });
  }

  function toggleChat() {
    setChatOpen((o) => !o);
    setUnread(0);
  }

  // ---------------- RUN ----------------
  async function runCode() {
    setExecTime(null); // Clear the old time while it's loading
    const code = editorRef.current.getValue();

    const res = await fetch("http://localhost:8000/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code,
        language: language,
        input: programInput,
      }),
    });

    const data = await res.json();
    const result = data.output || data.error;

    setOutput(result);
    if (data.time) setExecTime(data.time); // 🟢 THIS CATCHES THE TIME!

    socketRef.current.send(
      JSON.stringify({
        type: "output",
        output: result,
        time: data.time, // 🟢 Send the time to the other users in the room
      }),
    );
  }
  // ---------------- CHAT ----------------
  function sendChat() {
    if (!chatInput.trim()) return;

    const msg = {
      type: "chat",
      text: chatInput,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    socketRef.current.send(JSON.stringify(msg));
    setChatInput("");
  }

  function terminateSession() {
    socketRef.current.send(JSON.stringify({ type: "terminate" }));
  }

  function copyRoom() {
    navigator.clipboard.writeText(room);
    setToast("Room ID copied");
    setTimeout(() => setToast(""), 1500);
  }

  // ---------------- LANDING ----------------
  if (!connected) {
    return (
      <div className="landing">
        <div className="card">
          <h1>⚡ Live Code Collaboration</h1>

          {!mode && (
            <>
              <button onClick={() => setMode("create")}>Create Room</button>
              <button onClick={() => setMode("join")}>Join Room</button>
            </>
          )}

          {mode === "create" && (
            <>
              <div className="avatar-box">
                <img
                  src={`https://api.dicebear.com/7.x/thumbs/svg?seed=${nameInput || "guest"}`}
                  alt="avatar"
                />
              </div>
              <input
                placeholder="Username"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
              />
              <button onClick={createRoom}>Enter</button>
              <button className="secondary" onClick={() => setMode(null)}>
                Back
              </button>
            </>
          )}

          {mode === "join" && (
            <>
              <div className="avatar-box">
                <img
                  src={`https://api.dicebear.com/7.x/thumbs/svg?seed=${nameInput || "guest"}`}
                  alt="avatar"
                />
              </div>
              <input
                placeholder="Username"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
              />
              <input
                placeholder="Room ID"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
              />
              <button onClick={joinRoom}>Join</button>
              <button className="secondary" onClick={() => setMode(null)}>
                Back
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---------------- MAIN UI ----------------
  return (
    <div className="app">
      <div className="topbar">
        <div className="room-info">
          <div className="room-pill">
            <span className="room-label">ROOM</span>
            <span className="room-id">{room}</span>
          </div>

          <div className="users">
            {userList.map((u, i) => (
              <div key={i} className="user-dot" title={u}>
                {u[0].toUpperCase()}
              </div>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div className="admin-actions">
            <button className="btn copy" onClick={copyRoom}>
              📋 <span>Copy Room</span>
            </button>
            <button className="btn end" onClick={terminateSession}>
              ⛔ <span>End Session</span>
            </button>
          </div>
        )}
      </div>

      <div className="workspace">
        {chatOpen && (
          <div className="chat-popup">
            <div className="chat-header">
              💬 Team Chat
              <span onClick={toggleChat} className="close">
                ✖
              </span>
            </div>
            <div className="chat-messages">
              {chatMessages.map((m, i) => (
                <div
                  key={i}
                  className={`chat-row ${m.user === username ? "me" : ""}`}
                >
                  <div className="chat-avatar">
                    {m.user?.[0]?.toUpperCase()}
                  </div>
                  <div className="chat-bubble">
                    <div className="chat-meta">
                      <span className="chat-user">{m.user}</span>
                      <span className="chat-time">{m.time}</span>
                    </div>
                    <div className="chat-text">{m.text}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="chat-input-bar">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="Message team..."
              />
              <button onClick={sendChat}>Send</button>
            </div>
          </div>
        )}

        <div className="editor-area">
          <div className="controls-bar">
            <div className="left-controls">
              <button className="chat-toggle-btn" onClick={toggleChat}>
                💬 Chat {unread > 0 && <span className="badge">{unread}</span>}
              </button>

              {view === "code" && (
                <div className="lang-box">
                  <select
                    value={language}
                    onChange={(e) => {
                      setLanguage(e.target.value);
                      socketRef.current.send(
                        JSON.stringify({
                          type: "language",
                          language: e.target.value,
                        }),
                      );
                    }}
                  >
                    <option value="python">Python</option>
                    <option value="cpp">C++</option>
                    <option value="c">C</option>
                    <option value="java">Java</option>
                    <option value="javascript">JavaScript</option>
                  </select>
                </div>
              )}

              {view === "board" && (
                <div className="board-tools">
                  <input
                    type="color"
                    className="color-picker"
                    value={brushColor}
                    onChange={(e) => setBrushColor(e.target.value)}
                    title="Brush Color"
                  />
                  <button className="btn clear-btn" onClick={clearBoard}>
                    🗑️ Clear Board
                  </button>
                </div>
              )}
            </div>

            {view === "code" && (
              <button className="run-btn" onClick={runCode}>
                ▶ Run Code
              </button>
            )}
          </div>

          {/* CODE EDITOR */}
          <div
            className="editor"
            style={{
              display: view === "code" ? "block" : "none",
              height: "100%",
            }}
          >
            <Editor
              height="100%"
              theme="vs-dark"
              language={language}
              onMount={handleMount}
              options={{ minimap: { enabled: false }, fontSize: 14 }}
            />
          </div>

          {/* 🟢 WHITEBOARD (Now with Miro styling class) */}
          <div
            className="board-container miro-board"
            style={{
              display: view === "board" ? "block" : "none",
              height: "100%",
            }}
          >
            <canvas
              ref={canvasRef}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseOut={onMouseUp}
              style={{ width: "100%", height: "100%", cursor: "crosshair" }}
            />
          </div>
        </div>

        {/* 🟢 SIDE PANEL (Only renders when view is 'code') */}
        {view === "code" && (
          <div className="side-panel">
            <div className="input-panel">
              <div className="panel-header">📝 Standard Input</div>
              <textarea
                className="input-area"
                value={programInput}
                onChange={(e) => setProgramInput(e.target.value)}
                placeholder="Enter program input here..."
              />
            </div>
            <div className="output-panel">
              <div
                className="panel-header"
                style={{ display: "flex", justifyContent: "space-between" }}
              >
                <span>🟢 Execution Output</span>
                {execTime && (
                  <span className="time-badge">⏱ {execTime} ms</span>
                )}
              </div>
              <div
                className="panel-body"
                style={{ display: "flex", flexDirection: "column" }}
              >
                {executionStatus === "running" && (
                  <div className="status-msg running">⏳ Running...</div>
                )}
                {output && (
                  <pre
                    className={executionStatus === "error" ? "error-text" : ""}
                  >
                    {output}
                  </pre>
                )}
                {executionStatus === "success" && (
                  <div className="status-msg success">
                    ✅ Successfully executed
                  </div>
                )}
                {!output &&
                  executionStatus !== "running" &&
                  executionStatus !== "success" && (
                    <div className="empty">Run code to see output...</div>
                  )}
              </div>
            </div>
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

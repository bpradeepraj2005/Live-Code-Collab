import { useRef, useState, useEffect } from "react";
import Editor from "@monaco-editor/react";

export default function EditorPage() {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const socketRef = useRef(null);
  const isRemote = useRef(false);
  const remoteCursors = useRef({});
  const oldDecorations = useRef([]);

  // Whiteboard Refs
  const offset = useRef({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const currentPos = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });

  // Persistent shapes for redrawing during scroll/panning
  const [shapes, setShapes] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

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
  const [executionStatus, setExecutionStatus] = useState(null);

  const [view, setView] = useState("code");
  const [brushColor, setBrushColor] = useState("#020617");
  const [tool, setTool] = useState("pen");
  const [showColors, setShowColors] = useState(false);
  const colors = ["#020617", "#ef4444", "#22c55e", "#3b82f6", "#f59e0b"];

  // 🟢 REDRAW SYSTEM
  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    shapes.forEach((s) => {
      ctx.save();
      ctx.beginPath();

      if (s.tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = 30;
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 4;
      }

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const x0 = s.x0 + offset.current.x;
      const y0 = s.y0 + offset.current.y;
      const x1 = s.x1 + offset.current.x;
      const y1 = s.y1 + offset.current.y;

      if (s.tool === "rect") {
        ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      } else if (s.tool === "circle") {
        const radius = Math.sqrt(Math.pow(x1 - x0, 2) + Math.pow(y1 - y0, 2));
        ctx.arc(x0, y0, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (s.tool === "triangle") {
        ctx.moveTo(x0 + (x1 - x0) / 2, y0);
        ctx.lineTo(x0, y1);
        ctx.lineTo(x1, y1);
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
    });
  };

  useEffect(() => {
    if (view === "board") redrawCanvas();
  }, [view, shapes]);

  useEffect(() => {
    if (view === "board" && canvasRef.current) {
      const canvas = canvasRef.current;
      const parent = canvas.parentElement;
      const resizeCanvas = () => {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        redrawCanvas();
      };
      setTimeout(resizeCanvas, 50);
      window.addEventListener("resize", resizeCanvas);
      return () => window.removeEventListener("resize", resizeCanvas);
    }
  }, [view]);

  // 🟢 CHAT SYNC FIX
  const sendChatMessage = () => {
    if (!chatInput.trim()) return;
    const msgData = {
      type: "chat",
      user: username,
      text: chatInput,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    socketRef.current?.send(JSON.stringify(msgData));
    setChatMessages((prev) => [...prev, msgData]);
    setChatInput("");
  };

  const undo = () => {
    if (shapes.length === 0) return;
    const lastShape = shapes[shapes.length - 1];
    setRedoStack((prev) => [lastShape, ...prev]);
    setShapes((prev) => prev.slice(0, -1));
    socketRef.current?.send(JSON.stringify({ type: "undo" }));
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const nextShape = redoStack[0];
    setRedoStack((prev) => prev.slice(1));
    setShapes((prev) => [...prev, nextShape]);
    socketRef.current?.send(JSON.stringify(nextShape));
  };

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
      if (data.type === "draw") {
        setShapes((prev) => [...prev, data]);
        return;
      }
      if (data.type === "undo") {
        setShapes((prev) => prev.slice(0, -1));
        return;
      }
      if (data.type === "clear_board") {
        setShapes([]);
        setRedoStack([]);
        return;
      }
      if (data.type === "code" && editorRef.current) {
        if (editorRef.current.getValue() !== data.code) {
          isRemote.current = true;
          editorRef.current.setValue(data.code);
          isRemote.current = false;
        }
        return;
      }
      if (data.type === "language") {
        setLanguage(data.language);
        if (editorRef.current && monacoRef.current) {
          monacoRef.current.editor.setModelLanguage(
            editorRef.current.getModel(),
            data.language,
          );
        }
        return;
      }
      if (data.type === "terminate") {
        window.location.reload();
        return;
      }
      if (data.type === "chat") {
        if (data.user !== username) {
          setChatMessages((prev) => [...prev, data]);
          if (!chatOpen) setUnread((u) => u + 1);
        }
        return;
      }
    };
  }

  const onMouseDown = (e) => {
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    if (tool === "select") {
      isPanning.current = true;
      currentPos.current = { x, y };
      return;
    }
    setRedoStack([]);
    isDrawing.current = true;
    startPos.current = { x: x - offset.current.x, y: y - offset.current.y };
    currentPos.current = { x: x - offset.current.x, y: y - offset.current.y };
  };

  const onMouseMove = (e) => {
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    if (isPanning.current) {
      offset.current.x += x - currentPos.current.x;
      offset.current.y += y - currentPos.current.y;
      canvasRef.current.parentElement.style.backgroundPosition = `${offset.current.x}px ${offset.current.y}px`;
      currentPos.current = { x, y };
      redrawCanvas();
      return;
    }
    if (!isDrawing.current) return;
    if (tool === "pen" || tool === "eraser") {
      const newX = x - offset.current.x;
      const newY = y - offset.current.y;
      const dist = Math.hypot(
        newX - currentPos.current.x,
        newY - currentPos.current.y,
      );
      if (dist < 2) return;
      const shape = {
        type: "draw",
        x0: currentPos.current.x,
        y0: currentPos.current.y,
        x1: newX,
        y1: newY,
        color: brushColor,
        tool,
      };
      setShapes((prev) => [...prev, shape]);
      socketRef.current?.send(JSON.stringify(shape));
      currentPos.current = { x: newX, y: newY };
    }
  };

  const onMouseUp = (e) => {
    if (isDrawing.current) {
      const shapeTools = ["line", "rect", "circle", "triangle"];
      if (shapeTools.includes(tool)) {
        const shape = {
          type: "draw",
          x0: startPos.current.x,
          y0: startPos.current.y,
          x1: e.nativeEvent.offsetX - offset.current.x,
          y1: e.nativeEvent.offsetY - offset.current.y,
          color: brushColor,
          tool,
        };
        setShapes((prev) => [...prev, shape]);
        socketRef.current?.send(JSON.stringify(shape));
      }
    }
    isPanning.current = false;
    isDrawing.current = false;
  };

  const clearBoard = () => {
    setShapes([]);
    setRedoStack([]);
    socketRef.current?.send(JSON.stringify({ type: "clear_board" }));
  };

  async function runCode() {
    setExecutionStatus("running");
    const res = await fetch("http://localhost:8000/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: editorRef.current.getValue(),
        language,
        input: programInput,
      }),
    });
    const data = await res.json();
    setOutput(data.output || data.error);
    setExecutionStatus(data.error ? "error" : "success");
    setExecTime(data.time);
  }

  function handleMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.onDidChangeModelContent(() => {
      if (!isRemote.current) {
        socketRef.current?.send(
          JSON.stringify({ type: "code", code: editor.getValue() }),
        );
      }
    });
  }

  function toggleChat() {
    setChatOpen(!chatOpen);
    setUnread(0);
  }

  function copyRoom() {
    navigator.clipboard.writeText(room);
    setToast("Room ID copied to clipboard");
    setTimeout(() => setToast(""), 2000);
  }

  function terminateSession() {
    socketRef.current.send(JSON.stringify({ type: "terminate" }));
  }

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
              <button
                onClick={() => {
                  const id = Math.random().toString(36).substring(2, 8);
                  setRoom(id);
                  setUsername(nameInput);
                  setIsAdmin(true);
                  connectSocket(nameInput, id, true);
                }}
              >
                Enter
              </button>
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
              <button
                onClick={() => {
                  setRoom(roomInput);
                  setUsername(nameInput);
                  connectSocket(nameInput, roomInput, false);
                }}
              >
                Join
              </button>
              <button className="secondary" onClick={() => setMode(null)}>
                Back
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

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
              <div key={i} className="user-dot">
                {u ? u[0].toUpperCase() : "?"}
              </div>
            ))}
          </div>
        </div>
        <div className="view-toggle">
          <button
            className={view === "code" ? "active" : ""}
            onClick={() => setView("code")}
          >
            💻 Code
          </button>
          <button
            className={view === "board" ? "active" : ""}
            onClick={() => setView("board")}
          >
            🎨 Whiteboard
          </button>
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
                  <div className="chat-bubble">
                    <div className="chat-meta">
                      <span>{m.user}</span> <span>{m.time}</span>
                    </div>
                    <div>{m.text}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="chat-input-bar">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
                placeholder="Message team..."
              />
              <button onClick={sendChatMessage}>Send</button>
            </div>
          </div>
        )}

        <div className="editor-area">
          <div className="controls-bar">
            <div className="left-controls">
              <button className="chat-toggle-btn" onClick={toggleChat}>
                💬 {unread > 0 && <span className="badge">{unread}</span>}
              </button>
              {view === "code" ? (
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
                    <option value="c">C</option> {/* 🟢 Added C */}
                    <option value="cpp">C++</option>
                    <option value="java">Java</option>
                    <option value="javascript">JS</option>
                  </select>
                </div>
              ) : (
                <div className="board-tools">
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

          <div
            className="board-container miro-board"
            style={{
              display: view === "board" ? "block" : "none",
              height: "100%",
              position: "relative",
            }}
          >
            <div className="miro-sidebar-container">
              <div className="miro-main-tools">
                <button
                  className={`miro-tool ${tool === "select" ? "active" : ""}`}
                  onClick={() => {
                    setTool("select");
                    setShowColors(false);
                  }}
                >
                  ➤
                </button>
                <button
                  className={`miro-tool ${tool === "rect" ? "active" : ""}`}
                  onClick={() => {
                    setTool("rect");
                    setShowColors(false);
                  }}
                >
                  ▢
                </button>
                <button
                  className={`miro-tool ${tool === "circle" ? "active" : ""}`}
                  onClick={() => {
                    setTool("circle");
                    setShowColors(false);
                  }}
                >
                  ◯
                </button>
                <button
                  className={`miro-tool ${tool === "triangle" ? "active" : ""}`}
                  onClick={() => {
                    setTool("triangle");
                    setShowColors(false);
                  }}
                >
                  △
                </button>
                <button
                  className={`miro-tool ${tool === "pen" ? "active" : ""}`}
                  onClick={() => {
                    if (tool === "pen") setShowColors(!showColors);
                    else {
                      setTool("pen");
                      setShowColors(true);
                    }
                  }}
                >
                  🖊️
                </button>
                <button
                  className={`miro-tool ${tool === "line" ? "active" : ""}`}
                  onClick={() => {
                    setTool("line");
                    setShowColors(false);
                  }}
                >
                  ↗
                </button>
                <button
                  className={`miro-tool ${tool === "eraser" ? "active" : ""}`}
                  onClick={() => {
                    setTool("eraser");
                    setShowColors(false);
                  }}
                >
                  🧼
                </button>
              </div>
              {tool === "pen" && showColors && (
                <div className="miro-color-palette">
                  {colors.map((c) => (
                    <div
                      key={c}
                      className={`color-dot ${brushColor === c ? "active" : ""}`}
                      style={{ backgroundColor: c }}
                      onClick={() => {
                        setBrushColor(c);
                        setShowColors(false);
                      }}
                    />
                  ))}
                </div>
              )}
              <div className="miro-history-tools">
                <button
                  onClick={undo}
                  disabled={shapes.length === 0}
                  title="Undo"
                >
                  ↩
                </button>
                <button
                  onClick={redo}
                  disabled={redoStack.length === 0}
                  title="Redo"
                >
                  ↪
                </button>
              </div>
            </div>
            <canvas
              ref={canvasRef}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseOut={() => (isDrawing.current = false)}
              style={{
                width: "100%",
                height: "100%",
                cursor: tool === "select" ? "grab" : "crosshair",
              }}
            />
          </div>
        </div>

        {view === "code" && (
          <div className="side-panel">
            <div className="input-panel">
              <div className="panel-header">📝 Standard Input</div>
              <textarea
                className="input-area"
                value={programInput}
                onChange={(e) => setProgramInput(e.target.value)}
              />
            </div>
            <div className="output-panel">
              <div
                className="panel-header"
                style={{ display: "flex", justifyContent: "space-between" }}
              >
                <span>🟢 Output</span>{" "}
                {execTime && (
                  <span className="time-badge">⏱ {execTime} ms</span>
                )}
              </div>
              <div className="panel-body">
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
              </div>
            </div>
          </div>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

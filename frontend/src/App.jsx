import { useRef, useState, useEffect } from "react";
import Editor from "@monaco-editor/react";

export default function EditorPage() {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const socketRef = useRef(null);
  const isRemote = useRef(false);
  const codeTimeout = useRef(null);

  // Whiteboard Refs
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const currentPos = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const sizeIndicatorRef = useRef(null);
  const strokeHistory = useRef([]);
  const currentStrokeCount = useRef(0);

  // Stale Closure Refs
  const usernameRef = useRef("");
  const chatOpenRef = useRef(false);

  // INFINITE CANVAS LOGIC
  const [scale, setScale] = useState(1);
  const offset = useRef({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

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

  // 🟢 State for the dropdown members window and separate permissions
  const [showMembers, setShowMembers] = useState(false);
  const [allowedCodeUsers, setAllowedCodeUsers] = useState([]);
  const [allowedBoardUsers, setAllowedBoardUsers] = useState([]);
  const [inviteAlert, setInviteAlert] = useState(null);

  const canEditCode = isAdmin || allowedCodeUsers.includes(username);
  const canEditBoard = isAdmin || allowedBoardUsers.includes(username);

  const toWorld = (x, y) => ({
    x: (x - offset.current.x) / scale,
    y: (y - offset.current.y) / scale,
  });

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = Math.pow(1.1, -e.deltaY / 100);
    const newScale = Math.min(Math.max(scaleRef.current * factor, 0.1), 5);

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newOffset = {
      x: mouseX - (mouseX - offset.current.x) * (newScale / scaleRef.current),
      y: mouseY - (mouseY - offset.current.y) * (newScale / scaleRef.current),
    };

    offset.current = newOffset;
    scaleRef.current = newScale;
    setScale(newScale);

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "sync_view",
          scale: newScale,
          offset: newOffset,
        }),
      );
    }
  };

  const zoomIn = () => setScale((s) => Math.min(s + 0.1, 5));
  const zoomOut = () => setScale((s) => Math.max(s - 0.1, 0.1));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (view === "board" && canvas) {
      canvas.addEventListener("wheel", handleWheel, { passive: false });
      return () => canvas.removeEventListener("wheel", handleWheel);
    }
  }, [view, scale]);

  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        monacoRef.current.editor.setModelLanguage(model, language);
      }
    }
  }, [language]);

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentScale = scaleRef.current;

    ctx.save();
    ctx.translate(offset.current.x, offset.current.y);
    ctx.scale(currentScale, currentScale);
    ctx.setLineDash([]);

    (shapes || []).forEach((s) => {
      ctx.beginPath();
      if (s.tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = 30 / currentScale;
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 4 / currentScale;
      }
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (s.tool === "rect") {
        ctx.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
      } else if (s.tool === "circle") {
        const radius = Math.sqrt(
          Math.pow(s.x1 - s.x0, 2) + Math.pow(s.y1 - s.y0, 2),
        );
        ctx.arc(s.x0, s.y0, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (s.tool === "triangle") {
        ctx.moveTo(s.x0 + (s.x1 - s.x0) / 2, s.y0);
        ctx.lineTo(s.x0, s.y1);
        ctx.lineTo(s.x1, s.y1);
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.moveTo(s.x0, s.y0);
        ctx.lineTo(s.x1, s.y1);
        ctx.stroke();
      }
    });
    ctx.restore();
  };

  useEffect(() => {
    if (view === "board" && canvasRef.current) {
      const canvas = canvasRef.current;
      const parent = canvas.parentElement;
      const resizeCanvas = () => {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        redrawCanvas();
      };
      resizeCanvas();
      window.addEventListener("resize", resizeCanvas);
      return () => window.removeEventListener("resize", resizeCanvas);
    }
  }, [view, shapes, scale]);

  useEffect(() => {
    if (view === "board") redrawCanvas();
  }, [view, shapes, scale]);

  const undo = () => {
    if (shapes.length === 0) return;
    let count =
      strokeHistory.current.length > 0 ? strokeHistory.current.pop() : 1;
    count = Math.min(count, shapes.length);

    let removedShapes = [];
    setShapes((prev) => {
      const newShapes = [...prev];
      removedShapes = newShapes.splice(-count, count);
      return newShapes;
    });

    setRedoStack((prev) => [removedShapes, ...prev]);
    for (let i = 0; i < count; i++) {
      socketRef.current?.send(JSON.stringify({ type: "undo" }));
    }
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const batch = redoStack[0];
    const batchArray = Array.isArray(batch) ? batch : [batch];

    setRedoStack((prev) => prev.slice(1));
    setShapes((prev) => [...prev, ...batchArray]);
    strokeHistory.current.push(batchArray.length);

    batchArray.forEach((shape) => {
      socketRef.current?.send(JSON.stringify(shape));
    });
  };

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function connectSocket(name, roomId, admin) {
    try {
      const socket = new WebSocket(`ws://localhost:8000/ws/${roomId}`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (admin) socket.send(JSON.stringify({ type: "create" }));
        socket.send(JSON.stringify({ type: "join", username: name }));
        setConnected(true);
      };

      socket.onerror = (err) => {
        console.error("Socket Error:", err);
        showToast("Connection failed! Is the backend running?");
      };

      socket.onclose = () => {
        setConnected(false);
      };

      socket.onmessage = (e) => {
        const data = JSON.parse(e.data);

        if (data.type === "sync_view") {
          scaleRef.current = data.scale;
          setScale(data.scale);
          offset.current = data.offset;

          if (canvasRef.current && canvasRef.current.parentElement) {
            const bgPos = `${data.offset.x}px ${data.offset.y}px, ${data.offset.x}px ${data.offset.y}px, ${data.offset.x}px ${data.offset.y}px, ${data.offset.x}px ${data.offset.y}px`;
            canvasRef.current.parentElement.style.backgroundPosition = bgPos;
            canvasRef.current.parentElement.style.backgroundSize = `${20 * data.scale}px ${20 * data.scale}px, ${20 * data.scale}px ${20 * data.scale}px, ${100 * data.scale}px ${100 * data.scale}px, ${100 * data.scale}px ${100 * data.scale}px`;
            redrawCanvas();
          }
          return;
        }

        if (data.type === "users") {
          setUserList(data.list || []);
          return;
        }
        if (data.type === "draw") {
          setShapes((prev) => [...(prev || []), data]);

          if (canvasRef.current && canvasRef.current.parentElement) {
            if (data.scale && data.scale !== scaleRef.current) {
              scaleRef.current = data.scale;
              setScale(data.scale);
            }

            const currentScale = scaleRef.current;
            const rect =
              canvasRef.current.parentElement.getBoundingClientRect();
            const screenX = data.x1 * currentScale + offset.current.x;
            const screenY = data.y1 * currentScale + offset.current.y;
            const margin = 50;

            if (
              screenX < margin ||
              screenX > rect.width - margin ||
              screenY < margin ||
              screenY > rect.height - margin
            ) {
              offset.current = {
                x: rect.width / 2 - data.x1 * currentScale,
                y: rect.height / 2 - data.y1 * currentScale,
              };

              const bgPos = `${offset.current.x}px ${offset.current.y}px, ${offset.current.x}px ${offset.current.y}px, ${offset.current.x}px ${offset.current.y}px, ${offset.current.x}px ${offset.current.y}px`;
              canvasRef.current.parentElement.style.backgroundPosition = bgPos;
              canvasRef.current.parentElement.style.backgroundSize = `${20 * currentScale}px ${20 * currentScale}px, ${20 * currentScale}px ${20 * currentScale}px, ${100 * currentScale}px ${100 * currentScale}px, ${100 * currentScale}px ${100 * currentScale}px`;
              redrawCanvas();
            }
          }
          return;
        }

        if (data.type === "undo") {
          setShapes((prev) => (prev || []).slice(0, -1));
          return;
        }
        if (data.type === "clear_board") {
          setShapes([]);
          setRedoStack([]);
          strokeHistory.current = [];
          return;
        }
        if (data.type === "code" && editorRef.current) {
          const currentCode = editorRef.current.getValue();
          if (currentCode !== data.code) {
            isRemote.current = true;
            const position = editorRef.current.getPosition();
            editorRef.current.setValue(data.code || "");
            if (position) editorRef.current.setPosition(position);
            setTimeout(() => {
              isRemote.current = false;
            }, 50);
          }
          return;
        }
        if (data.type === "language" && data.language) {
          setLanguage(data.language);
          return;
        }

        if (data.type === "invite") {
          console.log("📩 Received invite data:", data);
          const myName = usernameRef.current;
          if (
            (data.to === "ALL" || data.to === myName) &&
            data.from !== myName
          ) {
            setInviteAlert(data.from);
          }
          return;
        }

        if (data.type === "allowed_code_users") {
          setAllowedCodeUsers(data.allowed_code_users);
          return;
        }

        if (data.type === "allowed_board_users") {
          setAllowedBoardUsers(data.allowed_board_users);
          return;
        }

        if (data.type === "terminate") {
          window.location.reload();
          return;
        }
        if (data.type === "chat") {
          if (data.user !== name) {
            setChatMessages((prev) => [...(prev || []), data]);
            if (!chatOpenRef.current) setUnread((u) => u + 1);
          }
          return;
        }

        if (data.type === "init") {
          if (data.code && editorRef.current)
            editorRef.current.setValue(data.code);
          if (data.language) setLanguage(data.language);
          if (data.input) setProgramInput(data.input);

          if (data.allowed_code_users)
            setAllowedCodeUsers(data.allowed_code_users);
          if (data.allowed_board_users)
            setAllowedBoardUsers(data.allowed_board_users);
          return;
        }

        if (data.type === "input") {
          setProgramInput(data.input || "");
          return;
        }

        if (data.type === "run_start") {
          setExecutionStatus("running");
          return;
        }

        if (data.type === "run_end") {
          setOutput(data.output || data.error);
          setExecutionStatus(data.error ? "error" : "success");
          setExecTime(data.time);
          return;
        }
      };
    } catch (err) {
      showToast("Invalid Room ID or connection error.");
    }
  }

  const handleJoinOrCreate = (isCreating) => {
    if (!nameInput.trim()) {
      return showToast("Please enter a Username!");
    }
    if (!isCreating && !roomInput.trim()) {
      return showToast("Please enter a Room ID!");
    }

    const id = isCreating
      ? Math.random().toString(36).substring(2, 8)
      : roomInput.trim();
    setRoom(id);
    setUsername(nameInput.trim());
    usernameRef.current = nameInput.trim();
    setIsAdmin(isCreating);
    connectSocket(nameInput.trim(), id, isCreating);
  };

  const onMouseDown = (e) => {
    if (!canEditBoard && tool !== "select") {
      showToast("🔒 Ask the Admin for edit permissions!");
      return;
    }

    if (tool === "select" || e.button === 1) {
      e.preventDefault();
      isPanning.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const world = toWorld(x, y);
    setRedoStack([]);
    isDrawing.current = true;
    startPos.current = world;
    currentPos.current = world;
    currentStrokeCount.current = 0;
  };

  const onMouseMove = (e) => {
    if (isPanning.current) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;

      offset.current = {
        x: offset.current.x + dx,
        y: offset.current.y + dy,
      };
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      if (canvasRef.current && canvasRef.current.parentElement) {
        const bgPos = `${offset.current.x}px ${offset.current.y}px, ${offset.current.x}px ${offset.current.y}px, ${offset.current.x}px ${offset.current.y}px, ${offset.current.x}px ${offset.current.y}px`;
        canvasRef.current.parentElement.style.backgroundPosition = bgPos;
        redrawCanvas();
      }

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: "sync_view",
            scale: scaleRef.current,
            offset: offset.current,
          }),
        );
      }
      return;
    }

    if (!isDrawing.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const world = toWorld(x, y);

    const shapeTools = ["line", "rect", "circle", "triangle"];

    if (shapeTools.includes(tool)) {
      if (sizeIndicatorRef.current) {
        const w = Math.round(Math.abs(world.x - startPos.current.x));
        const h = Math.round(Math.abs(world.y - startPos.current.y));
        let text = `${w} x ${h}`;
        if (tool === "circle") {
          const r = Math.round(
            Math.sqrt(
              Math.pow(world.x - startPos.current.x, 2) +
                Math.pow(world.y - startPos.current.y, 2),
            ),
          );
          text = `R: ${r}`;
        }
        sizeIndicatorRef.current.style.display = "block";
        sizeIndicatorRef.current.style.left = `${e.clientX - rect.left + 15}px`;
        sizeIndicatorRef.current.style.top = `${e.clientY - rect.top + 15}px`;
        sizeIndicatorRef.current.innerText = text;
      }

      redrawCanvas();

      const ctx = canvasRef.current.getContext("2d");
      ctx.save();
      ctx.translate(offset.current.x, offset.current.y);
      ctx.scale(scale, scale);

      ctx.beginPath();
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([6 / scale, 6 / scale]);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (tool === "rect") {
        ctx.strokeRect(
          startPos.current.x,
          startPos.current.y,
          world.x - startPos.current.x,
          world.y - startPos.current.y,
        );
      } else if (tool === "circle") {
        const radius = Math.sqrt(
          Math.pow(world.x - startPos.current.x, 2) +
            Math.pow(world.y - startPos.current.y, 2),
        );
        ctx.arc(startPos.current.x, startPos.current.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (tool === "triangle") {
        ctx.moveTo(
          startPos.current.x + (world.x - startPos.current.x) / 2,
          startPos.current.y,
        );
        ctx.lineTo(startPos.current.x, world.y);
        ctx.lineTo(world.x, world.y);
        ctx.closePath();
        ctx.stroke();
      } else if (tool === "line") {
        ctx.moveTo(startPos.current.x, startPos.current.y);
        ctx.lineTo(world.x, world.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (tool === "pen" || tool === "eraser") {
      const shape = {
        type: "draw",
        x0: currentPos.current.x,
        y0: currentPos.current.y,
        x1: world.x,
        y1: world.y,
        color: brushColor,
        tool,
        scale: scaleRef.current,
      };
      setShapes((prev) => [...prev, shape]);
      socketRef.current?.send(JSON.stringify(shape));
      currentStrokeCount.current += 1;
      currentPos.current = world;
    }
  };

  const onMouseUp = (e) => {
    if (sizeIndicatorRef.current)
      sizeIndicatorRef.current.style.display = "none";

    if (isPanning.current) {
      isPanning.current = false;
      return;
    }

    if (isDrawing.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const world = toWorld(e.clientX - rect.left, e.clientY - rect.top);
      const shapeTools = ["line", "rect", "circle", "triangle"];

      if (shapeTools.includes(tool)) {
        const shape = {
          type: "draw",
          x0: startPos.current.x,
          y0: startPos.current.y,
          x1: world.x,
          y1: world.y,
          color: brushColor,
          tool,
          scale: scaleRef.current,
        };
        setShapes((prev) => [...prev, shape]);
        socketRef.current?.send(JSON.stringify(shape));
        currentStrokeCount.current += 1;
      }

      if (currentStrokeCount.current > 0) {
        strokeHistory.current.push(currentStrokeCount.current);
      }
    }
    isDrawing.current = false;
  };

  const onMouseOut = () => {
    isDrawing.current = false;
    isPanning.current = false;
    if (sizeIndicatorRef.current)
      sizeIndicatorRef.current.style.display = "none";
  };

  const clearBoard = () => {
    setShapes([]);
    setRedoStack([]);
    strokeHistory.current = [];
    socketRef.current?.send(JSON.stringify({ type: "clear_board" }));
  };

  async function runCode() {
    setExecutionStatus("running");

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "run_start" }));
    }

    try {
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

      const finalOutput = data.output || data.error;
      const finalStatus = data.error ? "error" : "success";

      setOutput(finalOutput);
      setExecutionStatus(finalStatus);
      setExecTime(data.time);

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: "run_end",
            output: data.output,
            error: data.error,
            time: data.time,
          }),
        );
      }
    } catch (err) {
      setOutput("Failed to run code. Is the server online?");
      setExecutionStatus("error");
    }
  }

  function handleMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;

    monaco.editor.setModelLanguage(editor.getModel(), language);

    editor.onDidChangeModelContent(() => {
      if (!isRemote.current) {
        clearTimeout(codeTimeout.current);
        codeTimeout.current = setTimeout(() => {
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(
              JSON.stringify({ type: "code", code: editor.getValue() }),
            );
          }
        }, 300);
      }
    });
  }

  const sendChatMessage = () => {
    if (!chatInput.trim() || !socketRef.current) return;
    const msg = {
      type: "chat",
      user: usernameRef.current,
      text: chatInput,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    socketRef.current.send(JSON.stringify(msg));
    setChatMessages((prev) => [...prev, msg]);
    setChatInput("");
  };

  const togglePermission = (targetUser, type) => {
    if (type === "code") {
      let newAllowed = [...allowedCodeUsers];
      if (newAllowed.includes(targetUser))
        newAllowed = newAllowed.filter((u) => u !== targetUser);
      else newAllowed.push(targetUser);

      setAllowedCodeUsers(newAllowed);
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: "allowed_code_users",
            allowed_code_users: newAllowed,
          }),
        );
      }
    } else if (type === "board") {
      let newAllowed = [...allowedBoardUsers];
      if (newAllowed.includes(targetUser))
        newAllowed = newAllowed.filter((u) => u !== targetUser);
      else newAllowed.push(targetUser);

      setAllowedBoardUsers(newAllowed);
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: "allowed_board_users",
            allowed_board_users: newAllowed,
          }),
        );
      }
    }
  };

  const sendInvite = (target) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "invite",
          from: usernameRef.current,
          to: target,
        }),
      );
      showToast(`Invite sent to ${target === "ALL" ? "everyone" : target}`);
    }
  };

  function toggleChat() {
    chatOpenRef.current = !chatOpenRef.current;
    setChatOpen(chatOpenRef.current);
    if (chatOpenRef.current) setUnread(0);
  }

  function copyRoom() {
    navigator.clipboard.writeText(room);
    showToast("Room ID copied to clipboard");
  }

  function terminateSession() {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "terminate" }));
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } else {
      window.location.reload();
    }
  }

  if (!connected) {
    return (
      <div className="landing">
        <div className="card">
          <h1>⚡ Live Code Collaboration</h1>
          {!mode && (
            <div
              style={{ display: "flex", gap: "10px", flexDirection: "column" }}
            >
              <button onClick={() => setMode("create")}>Create Room</button>
              <button onClick={() => setMode("join")}>Join Room</button>
            </div>
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
              <button onClick={() => handleJoinOrCreate(true)}>Enter</button>
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
              <button onClick={() => handleJoinOrCreate(false)}>Join</button>
              <button className="secondary" onClick={() => setMode(null)}>
                Back
              </button>
            </>
          )}
        </div>
        {toast && <div className="toast">{toast}</div>}
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
            {(userList || []).map((u, i) => (
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
        {/* 🟢 Custom Non-Blocking Invite Modal */}
        {inviteAlert && (
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "#0f172a",
              border: "1px solid #38bdf8",
              padding: "24px",
              borderRadius: "12px",
              zIndex: 999999,
              boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
              textAlign: "center",
            }}
          >
            <h3 style={{ margin: "0 0 10px 0", color: "#e2e8f0" }}>
              👥 Come to the Whiteboard!
            </h3>
            <p
              style={{
                margin: "0 0 20px 0",
                color: "#94a3b8",
                fontSize: "14px",
              }}
            >
              <strong style={{ color: "#38bdf8" }}>{inviteAlert}</strong> wants
              you to look at something.
            </p>
            <div
              style={{ display: "flex", gap: "12px", justifyContent: "center" }}
            >
              <button
                style={{
                  padding: "8px 20px",
                  background: "#38bdf8",
                  color: "#020617",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
                onClick={() => {
                  setView("board");
                  setInviteAlert(null);
                }}
              >
                Join Them
              </button>
              <button
                style={{
                  padding: "8px 20px",
                  background: "transparent",
                  color: "#94a3b8",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
                onClick={() => setInviteAlert(null)}
              >
                Ignore
              </button>
            </div>
          </div>
        )}

        <div className="editor-area" style={{ position: "relative" }}>
          {/* 🟢 MOVED CHAT HERE: Inside the editor-area */}
          {chatOpen && (
            <div className="chat-popup">
              <div className="chat-header">
                💬 Team Chat{" "}
                <span onClick={toggleChat} className="close">
                  ✖
                </span>
              </div>
              <div className="chat-messages">
                {(chatMessages || []).map((m, i) => (
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

          <div className="controls-bar">
            <div className="left-controls">
              <button className="chat-toggle-btn" onClick={toggleChat}>
                💬 {unread > 0 && <span className="badge">{unread}</span>}
              </button>

              {/* 🟢 Team button neatly tucked in the top toolbar */}
              <button
                className="chat-toggle-btn"
                style={{ display: "flex", gap: "6px", alignItems: "center" }}
                onClick={() => setShowMembers(!showMembers)}
              >
                👥 Team
              </button>

              {view === "code" ? (
                <select
                  className="lang-box"
                  value={language}
                  onChange={(e) => {
                    const newLang = e.target.value;
                    setLanguage(newLang);
                    if (socketRef.current?.readyState === WebSocket.OPEN) {
                      socketRef.current.send(
                        JSON.stringify({ type: "language", language: newLang }),
                      );
                    }
                  }}
                >
                  <option value="python">Python</option>
                  <option value="c">C</option>
                  <option value="cpp">C++</option>
                  <option value="java">Java</option>
                  <option value="javascript">JS</option>
                </select>
              ) : (
                <button className="btn clear-btn" onClick={clearBoard}>
                  🗑️ Clear Board
                </button>
              )}
            </div>
            {view === "code" && (
              <button className="run-btn" onClick={runCode}>
                ▶ Run Code
              </button>
            )}
          </div>

          {/* 🟢 The Team Panel drops down cleanly from the toolbar */}
          {showMembers && (
            <div
              style={{
                position: "absolute",
                top: "56px",
                left: "64px",
                width: "340px",
                background: "#020617",
                border: "1px solid #1e293b",
                borderRadius: "12px",
                boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
                zIndex: 1000,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <div
                className="panel-header"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px",
                  background: "#0f172a",
                  borderBottom: "1px solid #1e293b",
                }}
              >
                <span
                  style={{
                    color: "#e2e8f0",
                    fontWeight: "bold",
                    fontSize: "14px",
                  }}
                >
                  👥 Team Members
                </span>
                {isAdmin && (
                  <button
                    style={{
                      padding: "4px 8px",
                      fontSize: "11px",
                      background: "#5865f2",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                    onClick={() => sendInvite("ALL")}
                  >
                    Invite All
                  </button>
                )}
              </div>
              <div
                className="panel-body"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  padding: "12px",
                  maxHeight: "300px",
                  overflowY: "auto",
                }}
              >
                {(userList || []).length <= 1 && (
                  <div
                    style={{
                      color: "#475569",
                      fontSize: "13px",
                      textAlign: "center",
                      padding: "10px 0",
                    }}
                  >
                    Waiting for others to join...
                  </div>
                )}
                {(userList || []).map((u, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "#1e293b",
                      padding: "8px 12px",
                      borderRadius: "8px",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: "600",
                        fontSize: "13px",
                        color: u === username ? "#38bdf8" : "white",
                      }}
                    >
                      {u} {u === username && "(You)"}
                    </span>
                    {isAdmin && u !== username && (
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          style={{
                            background: allowedCodeUsers.includes(u)
                              ? "#ef4444"
                              : "#eab308",
                            color: "white",
                            border: "none",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "10px",
                            fontWeight: "bold",
                          }}
                          onClick={() => togglePermission(u, "code")}
                        >
                          {allowedCodeUsers.includes(u)
                            ? "Revoke Code"
                            : "Allow Code"}
                        </button>
                        <button
                          style={{
                            background: allowedBoardUsers.includes(u)
                              ? "#ef4444"
                              : "#22c55e",
                            color: "white",
                            border: "none",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "10px",
                            fontWeight: "bold",
                          }}
                          onClick={() => togglePermission(u, "board")}
                        >
                          {allowedBoardUsers.includes(u)
                            ? "Revoke Draw"
                            : "Allow Draw"}
                        </button>
                        <button
                          style={{
                            background: "#38bdf8",
                            color: "#020617",
                            border: "none",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "10px",
                            fontWeight: "bold",
                          }}
                          onClick={() => sendInvite(u)}
                        >
                          Invite
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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
              options={{
                readOnly: !canEditCode,
                minimap: { enabled: false },
                fontSize: 14,
              }}
            />
          </div>

          <div
            className="board-container miro-board"
            style={{
              display: view === "board" ? "block" : "none",
              height: "100%",
              position: "relative",
              backgroundPosition: `${offset.current.x}px ${offset.current.y}px, ${offset.current.x}px ${offset.current.y}px, ${offset.current.x}px ${offset.current.y}px, ${offset.current.x}px ${offset.current.y}px`,
              backgroundSize: `${20 * scale}px ${20 * scale}px, ${20 * scale}px ${20 * scale}px, ${100 * scale}px ${100 * scale}px, ${100 * scale}px ${100 * scale}px`,
            }}
          >
            <div
              ref={sizeIndicatorRef}
              className="size-indicator"
              style={{ display: "none" }}
            />

            <div className="zoom-controls">
              <button onClick={zoomOut}>-</button>
              <div className="zoom-badge">{Math.round(scale * 100)}%</div>
              <button onClick={zoomIn}>+</button>
            </div>

            <div className="miro-sidebar-container">
              <div className="miro-main-tools">
                {[
                  "select",
                  "rect",
                  "circle",
                  "triangle",
                  "pen",
                  "line",
                  "eraser",
                ].map((t) => (
                  <button
                    key={t}
                    className={`miro-tool ${tool === t ? "active" : ""}`}
                    onClick={() => {
                      setTool(t);
                      if (t === "pen") setShowColors(!showColors);
                      else setShowColors(false);
                    }}
                  >
                    {t === "select"
                      ? "➤"
                      : t === "rect"
                        ? "▢"
                        : t === "circle"
                          ? "◯"
                          : t === "triangle"
                            ? "△"
                            : t === "pen"
                              ? "🖊️"
                              : t === "line"
                                ? "↗"
                                : "🧼"}
                  </button>
                ))}
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
                <button onClick={undo} disabled={(shapes || []).length === 0}>
                  ↩
                </button>
                <button
                  onClick={redo}
                  disabled={(redoStack || []).length === 0}
                >
                  ↪
                </button>
              </div>
              <button
                className="miro-tool"
                style={{
                  marginTop: "10px",
                  background: "white",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
                onClick={() => {
                  setScale(1);
                  offset.current = { x: 0, y: 0 };
                  if (canvasRef.current && canvasRef.current.parentElement) {
                    canvasRef.current.parentElement.style.backgroundPosition = `0px 0px, 0px 0px, 0px 0px, 0px 0px`;
                  }
                  redrawCanvas();
                }}
              >
                🎯
              </button>
            </div>
            <canvas
              ref={canvasRef}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseOut={onMouseOut}
              style={{
                width: "100%",
                height: "100%",
                cursor:
                  tool === "select"
                    ? isPanning.current
                      ? "grabbing"
                      : "grab"
                    : "crosshair",
              }}
            />
          </div>
        </div>

        {/* The Side Panel for Input/Output is strictly for "Code" view now */}
        {view === "code" && (
          <div className="side-panel">
            <div className="input-panel">
              <div className="panel-header">📝 Standard Input</div>
              <textarea
                className="input-area"
                value={programInput}
                readOnly={!canEditCode}
                onChange={(e) => {
                  const val = e.target.value;
                  setProgramInput(val);
                  if (socketRef.current?.readyState === WebSocket.OPEN) {
                    socketRef.current.send(
                      JSON.stringify({ type: "input", input: val }),
                    );
                  }
                }}
              />
            </div>
            <div className="output-panel">
              <div
                className="panel-header"
                style={{ display: "flex", justifyContent: "space-between" }}
              >
                <span>🟢 Output</span>
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

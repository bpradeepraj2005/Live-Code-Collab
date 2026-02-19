from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List
import subprocess, tempfile, os, json, time

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rooms: Dict[str, List[WebSocket]] = {}
usernames: Dict[WebSocket, str] = {}
admins: Dict[str, WebSocket] = {}
room_state: Dict[str, dict] = {} 

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()

    if room_id not in rooms:
        try:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") != "create":
                await websocket.send_text(json.dumps({"type": "error", "message": "Room does not exist"}))
                await websocket.close()
                return
            rooms[room_id] = []
            admins[room_id] = websocket
            room_state[room_id] = {"code": "", "language": "cpp"}
        except:
            return

    rooms[room_id].append(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            # Broadcast logic for all types
            if msg.get("type") == "join":
                usernames[websocket] = msg["username"]
                await broadcast_users(room_id)
                current = room_state.get(room_id, {"code": "", "language": "cpp"})
                await websocket.send_text(json.dumps({"type": "init", **current}))
                continue

            if msg.get("type") in ["code", "language"]:
                room_state[room_id][msg["type"]] = msg.get(msg["type"])
            
            # Forward drawing, cursor, chat, and code to others
            for ws in rooms[room_id]:
                if ws != websocket:
                    await ws.send_text(data)
            
    except WebSocketDisconnect:
        if websocket in rooms[room_id]:
            rooms[room_id].remove(websocket)
        await broadcast_users(room_id)

async def broadcast_users(room_id: str):
    users = [usernames.get(ws, "User") for ws in rooms[room_id]]
    for ws in rooms[room_id]:
        await ws.send_text(json.dumps({"type": "users", "list": users}))

@app.post("/run")
async def run_code(data: dict = Body(...)):
    code, lang, inp = data.get("code"), data.get("language"), data.get("input", "") + "\n"
    start = time.perf_counter()
    try:
        suffix = {"python": ".py", "cpp": ".cpp", "c": ".c", "javascript": ".js"}.get(lang, ".txt")
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(code.encode()); path = f.name
        
        output, error = "", ""
        if lang == "python":
            r = subprocess.run(["python", path], input=inp, capture_output=True, text=True)
            output, error = r.stdout, r.stderr
        elif lang in ["cpp", "c"]:
            compiler = "g++" if lang == "cpp" else "gcc"
            exe = path + ".exe"
            c = subprocess.run([compiler, path, "-o", exe], capture_output=True, text=True)
            if c.stderr: error = c.stderr
            else:
                r = subprocess.run([exe], input=inp, capture_output=True, text=True)
                output, error = r.stdout, r.stderr
                os.remove(exe)
        elif lang == "javascript":
            r = subprocess.run(["node", path], input=inp, capture_output=True, text=True)
            output, error = r.stdout, r.stderr
        
        os.remove(path)
        return {"output": output, "error": error, "time": round((time.perf_counter()-start)*1000, 2)}
    except Exception as e:
        return {"output": "", "error": str(e)}
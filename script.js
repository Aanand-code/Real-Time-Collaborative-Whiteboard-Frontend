const ws = new WebSocket('wss://real-time-collaborative-whiteboard-cuul.onrender.com');

// Canvas and context setup
const canvas = document.getElementById('canvas');
const tempCanvas = document.getElementById('temp-canvas');
const ctx = canvas.getContext('2d');
const tempCtx = tempCanvas.getContext('2d');

// Tool elements
const pencilButton = document.getElementById('pencil');
const eraserButton = document.getElementById('eraser');
const pointerSize = document.getElementById('pointer-size');
const colorButton = document.getElementById('color');
const rectBtn = document.getElementById('rectangle');
const circleBtn = document.getElementById('circle');
const txtBtn = document.getElementById('text');
const txtSize = document.getElementById('text-size');
const undoBtn = document.getElementById('undo');
const redoBtn = document.getElementById('redo');
const clearBtn = document.getElementById('clear');

// Room elements
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('room-id');
const createRoomBtn = document.getElementById('create-room');
const joinRoomBtn = document.getElementById('join-room');
const roomStatus = document.getElementById('room-status');
const userList = document.getElementById('user-list');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat');
const chatMessages = document.getElementById('chat-messages');

// Drawing state
let isDrawing = false;
let initialX;
let initialY;
let currentTool = 'pencil';
let currentSize = 3;
let textSize = 10;
let currentColor = '#000000';
let drawingStack = [];
let redoStack = [];
let currentStroke = null;

// Room state
let currentRoom;
let usernameClient;
let users = [];
let drawing = [];
let userCount;

// Setup canvases
function setupCanvas() {
  const container = document.getElementById('canvas-container');
  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;

  const dpr = window.devicePixelRatio || 1;

  // Set canvas dimensions
  canvas.width = containerWidth * dpr;
  canvas.height = containerHeight * dpr;
  canvas.style.width = containerWidth + 'px';
  canvas.style.height = containerHeight + 'px';

  // Set temp canvas dimensions
  tempCanvas.width = containerWidth * dpr;
  tempCanvas.height = containerHeight * dpr;
  tempCanvas.style.width = containerWidth + 'px';
  tempCanvas.style.height = containerHeight + 'px';

  // Scale contexts
  ctx.scale(dpr, dpr);
  tempCtx.scale(dpr, dpr);

  // Set default styles
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  tempCtx.lineCap = 'round';
  tempCtx.lineJoin = 'round';
  tempCtx.strokeStyle = 'rgba(0, 0, 255, 0.7)';
  tempCtx.fillStyle = 'rgba(0, 0, 255, 0.1)';
  tempCtx.lineWidth = 2;
}

setupCanvas();
window.addEventListener('resize', setupCanvas);

// Set up event listeners
pencilButton.addEventListener('click', () => setActiveTool('pencil'));
eraserButton.addEventListener('click', () => setActiveTool('eraser'));
rectBtn.addEventListener('click', () => setActiveTool('rectangle'));
circleBtn.addEventListener('click', () => setActiveTool('circle'));
txtBtn.addEventListener('click', () => setActiveTool('text'));
pointerSize.addEventListener('input', (e) => (currentSize = e.target.value));
txtSize.addEventListener('input', (e) => (textSize = e.target.value));
colorButton.addEventListener('input', (e) => (currentColor = e.target.value));
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
clearBtn.addEventListener('click', clearCanvas);

createRoomBtn.addEventListener('click', createRoom);
joinRoomBtn.addEventListener('click', joinRoom);
sendChatBtn.addEventListener('click', sendChat);

canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

// Set initial active tool
setActiveTool('pencil');

// Connection with server
ws.addEventListener('open', () => {
  console.log('Connected to whiteboard server');
  roomStatus.textContent = 'Connected to server';
});

ws.addEventListener('message', (event) => {
  try {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'room_already_exist':
        alert(data.msg);
        break;

      case 'no_room':
        alert(data.msg);
        break;

      case 'user_joined':
        users = data.users || [];
        drawing = data.drawings || [];
        drawing.forEach((drawingObj) => {
          drawCommand(drawingObj);
        });
        updateUsers(data);
        break;

      case 'chat':
        addChatMessage(`${data.username}: ${data.text}`);
        break;

      case 'user_left':
        users = data.users || [];
        updateUsers(data);
        break;

      case 'start':
        ctx.beginPath();
        ctx.moveTo(data.x, data.y);
        ctx.strokeStyle = data.color;
        ctx.lineWidth = data.size;
        break;

      case 'draw':
        ctx.lineTo(data.x, data.y);
        ctx.stroke();
        break;

      case 'text':
        ctx.fillStyle = data.color;
        ctx.font = data.font;
        ctx.fillText(data.text, data.x, data.y);
        saveDrawing();
        break;

      case 'rectangle':
        ctx.beginPath();
        ctx.strokeStyle = data.color;
        ctx.lineWidth = data.size;
        ctx.strokeRect(data.x, data.y, data.width, data.height);
        saveDrawing();
        break;

      case 'circle':
        ctx.beginPath();
        ctx.strokeStyle = data.color;
        ctx.lineWidth = data.size;
        ctx.arc(data.x, data.y, data.radius, 0, Math.PI * 2);
        ctx.stroke();
        saveDrawing();
        break;

      case 'clear':
        clearCanvas();
        break;
    }
  } catch (error) {
    console.error('Error processing message:', error);
  }
});

ws.addEventListener('error', (err) => console.log(err));

ws.addEventListener('close', () => console.log('Conection Closed'));

// Initialize room status
roomStatus.textContent = 'Not connected';

// Set active tool and update UI
function setActiveTool(tool) {
  currentTool = tool;

  // Remove active class from all buttons
  pencilButton.classList.remove('active');
  eraserButton.classList.remove('active');
  rectBtn.classList.remove('active');
  circleBtn.classList.remove('active');
  txtBtn.classList.remove('active');

  // Add active class to current tool
  if (tool === 'pencil') pencilButton.classList.add('active');
  if (tool === 'eraser') eraserButton.classList.add('active');
  if (tool === 'rectangle') rectBtn.classList.add('active');
  if (tool === 'circle') circleBtn.classList.add('active');
  if (tool === 'text') txtBtn.classList.add('active');
}

// Get canvas coordinates from mouse event
function getCanvasCoordinates(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

// Start drawing
function startDrawing(event) {
  if (!currentRoom && currentTool !== 'text') {
    alert('Please join a room first!');
    return;
  }

  isDrawing = true;
  const { x, y } = getCanvasCoordinates(event);
  initialX = x;
  initialY = y;
  ctx.beginPath();
  ctx.moveTo(initialX, initialY);

  if (currentTool === 'text') {
    const text = prompt('Enter the text', 'Hello!');
    if (text) {
      ctx.fillStyle = currentColor;
      ctx.font = `${textSize}px Arial`;
      ctx.fillText(text, initialX, initialY);

      const txtCmd = {
        type: 'text',
        x: initialX,
        y: initialY,
        text: text,
        color: currentColor,
        font: `${textSize}px Arial`,
        roomId: currentRoom,
      };

      drawingStack.push(txtCmd);

      // Simulate sending to server
      ws.send(
        JSON.stringify({
          type: 'text',
          x: initialX,
          y: initialY,
          text: text,
          color: currentColor,
          font: `${textSize}px Arial`,
          roomId: currentRoom,
        })
      );
    }
  } else if (currentTool !== 'rectangle' && currentTool !== 'circle') {
    ctx.moveTo(initialX, initialY);
    ctx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : currentColor;
    ctx.lineWidth = currentSize;

    currentStroke = {
      type: 'stroke',
      points: [{ x, y }],
      color: currentTool === 'eraser' ? '#ffffff' : currentColor,
      size: currentSize,
      roomId: currentRoom,
    };

    // Simulate sending to server
    ws.send(
      JSON.stringify({
        type: 'start',
        x: initialX,
        y: initialY,
        color: currentTool === 'eraser' ? '#ffffff' : currentColor,
        size: currentSize,
        tool: currentTool,
        roomId: currentRoom,
      })
    );
  }
}

// Drawing in progress
function draw(event) {
  if (!isDrawing || !currentRoom) return;

  const { x, y } = getCanvasCoordinates(event);

  // Clear temp canvas
  tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);

  if (currentTool === 'pencil' || currentTool === 'eraser') {
    ctx.lineTo(x, y);
    ctx.stroke();

    if (currentStroke) {
      currentStroke.points.push({ x, y });
    }

    // Simulate sending to server
    ws.send(
      JSON.stringify({
        type: 'draw',
        x: x,
        y: y,
        roomId: currentRoom,
      })
    );
  } else if (currentTool === 'rectangle') {
    // Draw preview on temp canvas
    tempCtx.beginPath();
    tempCtx.strokeRect(initialX, initialY, x - initialX, y - initialY);
    tempCtx.fillRect(initialX, initialY, x - initialX, y - initialY);
  } else if (currentTool === 'circle') {
    const radius = Math.sqrt(
      Math.pow(x - initialX, 2) + Math.pow(y - initialY, 2)
    );

    // Draw preview on temp canvas
    tempCtx.beginPath();
    tempCtx.arc(initialX, initialY, radius, 0, Math.PI * 2);
    tempCtx.stroke();
    tempCtx.fill();
  }
}

// Stop drawing
function stopDrawing(event) {
  if (!isDrawing) return;
  isDrawing = false;

  if (currentStroke) {
    // Save the completed stroke
    drawingStack.push(currentStroke);
    currentStroke = null;
    saveDrawing();
  }
  // Clear temp canvas
  tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);

  if (currentTool === 'rectangle' || currentTool === 'circle') {
    const { x, y } = getCanvasCoordinates(event);

    if (currentTool === 'rectangle') {
      ctx.beginPath();
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentSize;
      ctx.strokeRect(initialX, initialY, x - initialX, y - initialY);

      const rectCmd = {
        type: 'rectangle',
        x: initialX,
        y: initialY,
        width: x - initialX,
        height: y - initialY,
        color: currentColor,
        size: currentSize,
        roomId: currentRoom,
      };

      drawingStack.push(rectCmd);
      saveDrawing();

      // Simulate sending to server
      ws.send(
        JSON.stringify({
          type: 'rectangle',
          x: initialX,
          y: initialY,
          width: x - initialX,
          height: y - initialY,
          color: currentColor,
          size: currentSize,
          roomId: currentRoom,
        })
      );
    } else if (currentTool === 'circle') {
      const radius = Math.sqrt(
        Math.pow(x - initialX, 2) + Math.pow(y - initialY, 2)
      );

      ctx.beginPath();
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentSize;
      ctx.arc(initialX, initialY, radius, 0, Math.PI * 2);
      ctx.stroke();

      const circleCmd = {
        type: 'circle',
        x: initialX,
        y: initialY,
        radius: radius,
        color: currentColor,
        size: currentSize,
        roomId: currentRoom,
      };

      drawingStack.push(circleCmd);
      saveDrawing();

      // Simulate sending to server
      ws.send(
        JSON.stringify({
          type: 'circle',
          x: initialX,
          y: initialY,
          radius: radius,
          color: currentColor,
          size: currentSize,
          roomId: currentRoom,
        })
      );
    }

    saveDrawing();
  } else {
    saveDrawing();
  }
}

// Save current drawing state
function saveDrawing() {
  redoStack = [];
}

// Redraw canvas from history
function redrawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Redraw all commands
  drawingStack.forEach((cmd) => {
    drawCommand(cmd);
  });
}

// Draw a single command
function drawCommand(cmd) {
  switch (cmd.type) {
    case 'stroke':
      ctx.beginPath();
      ctx.moveTo(cmd.points[0].x, cmd.points[0].y);
      for (let i = 1; i < cmd.points.length; i++) {
        ctx.lineTo(cmd.points[i].x, cmd.points[i].y);
      }
      ctx.strokeStyle = cmd.color;
      ctx.lineWidth = cmd.size;
      ctx.stroke();
      break;

    case 'start':
      ctx.beginPath();
      ctx.moveTo(cmd.x, cmd.y);
      ctx.strokeStyle = cmd.color;
      ctx.lineWidth = cmd.size;
      break;

    case 'draw':
      ctx.lineTo(cmd.x, cmd.y);
      ctx.stroke();
      break;

    case 'rectangle':
      ctx.beginPath();
      ctx.strokeStyle = cmd.color;
      ctx.lineWidth = cmd.size;
      ctx.strokeRect(cmd.x, cmd.y, cmd.width, cmd.height);
      break;

    case 'circle':
      ctx.beginPath();
      ctx.strokeStyle = cmd.color;
      ctx.lineWidth = cmd.size;
      ctx.arc(cmd.x, cmd.y, cmd.radius, 0, Math.PI * 2);
      ctx.stroke();
      break;

    case 'text':
      ctx.fillStyle = cmd.color;
      ctx.font = cmd.font;
      ctx.fillText(cmd.text, cmd.x, cmd.y);
      break;
  }
}

// Undo last action
function undo() {
  if (drawingStack.length > 0) {
    redoStack.push(drawingStack.pop());
    redrawCanvas();
  }
}

// Redo last undone action
function redo() {
  if (redoStack.length > 0) {
    let cmd = redoStack.pop();
    drawingStack.push(cmd);
    drawCommand(cmd);
  }
}

// Clear canvas
function clearCanvas() {
  drawingStack = [];
  redoStack = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Simulate sending to server
  if (currentRoom) {
    ws.send(
      JSON.stringify({
        type: 'clear',
        roomId: currentRoom,
      })
    );
  }
} ///////////////////
///////////////////////
///////////////////////
////////////////////////

// Create room
function createRoom() {
  const roomId = roomIdInput.value.trim();
  const username = usernameInput.value.trim();
  currentRoom = roomId;
  usernameClient = username;
  if (!currentRoom || !usernameClient) {
    alert('Please enter both username and room ID');
    return;
  }

  chatMessages.innerHTML = '';
  roomIdInput.value = '';
  usernameInput.value = '';

  // Simulate server response
  ws.send(
    JSON.stringify({
      type: 'create_room',
      roomId: currentRoom,
      username: usernameClient,
    })
  );
}

// Join room
function joinRoom() {
  const roomId = roomIdInput.value.trim();
  const username = usernameInput.value.trim();
  currentRoom = roomId;
  usernameClient = username;
  if (!currentRoom || !usernameClient) {
    alert('Please enter both username and room ID');
    return;
  }

  // Clear chat
  chatMessages.innerHTML = '';
  roomIdInput.value = '';
  usernameInput.value = '';

  // Simulate server response
  ws.send(
    JSON.stringify({
      type: 'join_room',
      roomId: currentRoom,
      username: usernameClient,
    })
  );
}

// Update user list
function updateUsers(data) {
  roomStatus.textContent = `In room: ${data.roomId} (${data.userCount} users)`;
  userList.innerHTML = '';
  users.forEach((user) => {
    const userElem = document.createElement('div');
    userElem.className = 'user';
    userElem.textContent = user;
    userList.appendChild(userElem);
  });
  const message = document.createElement('div');
  message.className = 'msg-user';
  message.textContent = data.message;
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Send chat message
function sendChat() {
  const message = chatInput.value.trim();
  if (!message || !currentRoom) return;

  // Add message to chat
  const messageElem = document.createElement('div');
  messageElem.className = 'send-message';
  messageElem.textContent = message;
  chatMessages.appendChild(messageElem);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Simulate sending to server
  ws.send(
    JSON.stringify({
      type: 'chat',
      text: message,
      roomId: currentRoom,
    })
  );

  chatInput.value = '';
  chatInput.focus();
}

// Add received chat message
function addChatMessage(text) {
  const message = document.createElement('div');
  message.className = 'receive-message';
  message.textContent = text;
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

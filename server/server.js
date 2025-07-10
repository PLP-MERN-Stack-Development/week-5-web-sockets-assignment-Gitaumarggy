// server.js - Main server file for Socket.io chat application

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const chatNamespace = io.of('/chat');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store connected users and messages
const users = {}; // { socketId: { username, id: socketId, room } }
const roomMessages = {}; // { roomName: [messages] }
const messageReads = {}; // { roomName: { messageId: Set(socketId) } }
const messageReactions = {}; // { roomName: { messageId: { reaction: Set(socketId) } } }
const typingUsers = {}; // { roomName: { socketId: username } }

// Socket.io connection handler for /chat namespace
chatNamespace.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle user joining
  socket.on('user_join', (username, room) => {
    users[socket.id] = { username, id: socket.id, room };
    socket.join(room);
    // Initialize room messages, typing users, and read receipts if not exist
    if (!roomMessages[room]) roomMessages[room] = [];
    if (!typingUsers[room]) typingUsers[room] = {};
    if (!messageReads[room]) messageReads[room] = {};
    if (!messageReactions[room]) messageReactions[room] = {};
    // Emit user list and join event only to the room
    chatNamespace.to(room).emit('user_list', Object.values(users).filter(u => u.room === room));
    chatNamespace.to(room).emit('user_joined', { username, id: socket.id });
    console.log(`${username} joined room ${room}`);
  });

  // Handle chat messages
  socket.on('send_message', (messageData) => {
    const user = users[socket.id];
    if (!user) return;
    const { room } = user;
    const message = {
      ...messageData, // message, file, fileName, fileType (if present), tempId
      id: Date.now(),
      sender: user.username || 'Anonymous',
      senderId: socket.id,
      timestamp: new Date().toISOString(),
      room,
      readBy: [socket.id], // sender has read their own message
      reactions: {}, // { reaction: [socketId, ...] }
      tempId: messageData.tempId || undefined, // ensure tempId is always present if sent
    };
    console.log('Broadcasting message:', message);
    roomMessages[room].push(message);
    messageReads[room][message.id] = new Set([socket.id]);
    messageReactions[room][message.id] = {};
    // Limit stored messages per room
    if (roomMessages[room].length > 100) {
      roomMessages[room].shift();
    }
    chatNamespace.to(room).emit('receive_message', message);
  });

  // Handle typing indicator
  socket.on('typing', (isTyping) => {
    const user = users[socket.id];
    if (!user) return;
    const { room, username } = user;
    if (isTyping) {
      typingUsers[room][socket.id] = username;
    } else {
      delete typingUsers[room][socket.id];
    }
    chatNamespace.to(room).emit('typing_users', Object.values(typingUsers[room]));
  });

  // Handle message read receipts
  socket.on('message_read', (messageId) => {
    const user = users[socket.id];
    if (!user) return;
    const { room } = user;
    if (messageReads[room] && messageReads[room][messageId]) {
      messageReads[room][messageId].add(socket.id);
      // Broadcast updated readBy list for this message
      chatNamespace.to(room).emit('message_read_update', {
        messageId,
        readBy: Array.from(messageReads[room][messageId]),
      });
    }
  });

  // Handle message reactions
  socket.on('message_reaction', ({ messageId, reaction }) => {
    const user = users[socket.id];
    if (!user) return;
    const { room } = user;
    if (!messageReactions[room][messageId]) messageReactions[room][messageId] = {};
    if (!messageReactions[room][messageId][reaction]) messageReactions[room][messageId][reaction] = new Set();
    // Toggle reaction: add if not present, remove if already present
    if (messageReactions[room][messageId][reaction].has(socket.id)) {
      messageReactions[room][messageId][reaction].delete(socket.id);
    } else {
      messageReactions[room][messageId][reaction].add(socket.id);
    }
    // Prepare reactions object for broadcast
    const reactions = {};
    for (const [react, set] of Object.entries(messageReactions[room][messageId])) {
      reactions[react] = Array.from(set);
    }
    chatNamespace.to(room).emit('message_reaction_update', {
      messageId,
      reactions,
    });
  });

  // Handle private messages
  socket.on('private_message', ({ to, message }) => {
    const messageData = {
      id: Date.now(),
      sender: users[socket.id]?.username || 'Anonymous',
      senderId: socket.id,
      message,
      timestamp: new Date().toISOString(),
      isPrivate: true,
      to,
    };
    
    socket.to(to).emit('private_message', messageData);
    socket.emit('private_message', messageData);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      const { username, room } = user;
      chatNamespace.to(room).emit('user_left', { username, id: socket.id });
      delete users[socket.id];
      if (typingUsers[room]) {
        delete typingUsers[room][socket.id];
        chatNamespace.to(room).emit('typing_users', Object.values(typingUsers[room]));
      }
      chatNamespace.to(room).emit('user_list', Object.values(users).filter(u => u.room === room));
      console.log(`${username} left room ${room}`);
    }
  });
});

// API routes
app.get('/api/messages', (req, res) => {
  const { room, skip = 0, limit = 20 } = req.query;
  if (room && roomMessages[room]) {
    // Return the most recent messages, paginated
    const all = roomMessages[room];
    const start = Math.max(0, all.length - Number(skip) - Number(limit));
    const end = all.length - Number(skip);
    const paged = all.slice(start, end);
    res.json(paged);
  } else {
    res.json([]);
  }
});

app.get('/api/users', (req, res) => {
  res.json(Object.values(users));
});

// Root route
app.get('/', (req, res) => {
  res.send('Socket.io Chat Server is running');
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running http://localhost:${PORT}`);
});

module.exports = { app, server, io }; 
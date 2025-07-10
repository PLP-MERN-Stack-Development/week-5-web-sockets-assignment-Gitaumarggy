const express = require('express');
const path = require('path');
const Room = require('../models/Room');
const Message = require('../models/Message');
const User = require('../models/user');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Get all rooms for a user
router.get('/rooms', async (req, res) => {
  try {
    const rooms = await Room.find({
      $or: [
        { type: 'public' },
        { 'members.user': req.user._id }
      ]
    })
    .populate('members.user', 'username avatar isOnline status')
    .populate('createdBy', 'username avatar')
    .populate('lastMessage', 'content messageType createdAt sender')
    .sort({ lastActivity: -1 });

    res.json(rooms);
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new room
router.post('/rooms', async (req, res) => {
  try {
    const { name, description, type } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Room name is required' });
    }

    const room = new Room({
      name,
      description,
      type: type || 'public',
      createdBy: req.user._id,
      members: [{
        user: req.user._id,
        role: 'admin'
      }]
    });

    await room.save();
    await room.populate('members.user', 'username avatar isOnline status');
    await room.populate('createdBy', 'username avatar');

    res.status(201).json(room);
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Join a room
router.post('/rooms/:roomId/join', async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.isMember(req.user._id)) {
      return res.status(400).json({ error: 'Already a member of this room' });
    }

    room.addMember(req.user._id);
    await room.save();

    res.json({ message: 'Successfully joined room' });
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Leave a room
router.post('/rooms/:roomId/leave', async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (!room.isMember(req.user._id)) {
      return res.status(400).json({ error: 'Not a member of this room' });
    }

    room.removeMember(req.user._id);
    await room.save();

    res.json({ message: 'Successfully left room' });
  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get messages for a room
router.get('/messages/:roomId', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const roomId = req.params.roomId;

    // Check if user is member of the room
    const room = await Room.findById(roomId);
    if (!room || !room.isMember(req.user._id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await Message.find({ 
      room: roomId,
      isDeleted: false 
    })
    .populate('sender', 'username avatar isOnline status')
    .populate('reactions.user', 'username avatar')
    .populate('readBy.user', 'username avatar')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    res.json(messages.reverse());
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Search messages
router.get('/messages/:roomId/search', async (req, res) => {
  try {
    const { query } = req.query;
    const roomId = req.params.roomId;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // Check if user is member of the room
    const room = await Room.findById(roomId);
    if (!room || !room.isMember(req.user._id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await Message.find({
      room: roomId,
      content: { $regex: query, $options: 'i' },
      isDeleted: false
    })
    .populate('sender', 'username avatar')
    .sort({ createdAt: -1 })
    .limit(50);

    res.json(messages);
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'file';

    res.json({
      fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

// Get online users
router.get('/users/online', async (req, res) => {
  try {
    const users = await User.find({ isOnline: true })
      .select('username avatar status lastSeen')
      .sort({ lastSeen: -1 });

    res.json(users);
  } catch (error) {
    console.error('Get online users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's private chats
router.get('/private-chats', async (req, res) => {
  try {
    const privateRooms = await Room.find({
      type: 'direct',
      'members.user': req.user._id
    })
    .populate('members.user', 'username avatar isOnline status')
    .populate('lastMessage', 'content messageType createdAt sender')
    .sort({ lastActivity: -1 });

    res.json(privateRooms);
  } catch (error) {
    console.error('Get private chats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create or get private chat
router.post('/private-chat', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot create chat with yourself' });
    }

    // Check if private chat already exists
    const existingRoom = await Room.findOne({
      type: 'direct',
      'members.user': { $all: [req.user._id, userId] }
    }).populate('members.user', 'username avatar isOnline status');

    if (existingRoom) {
      return res.json(existingRoom);
    }

    // Create new private chat
    const otherUser = await User.findById(userId);
    if (!otherUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const room = new Room({
      name: `${req.user.username} & ${otherUser.username}`,
      type: 'direct',
      createdBy: req.user._id,
      members: [
        { user: req.user._id, role: 'member' },
        { user: userId, role: 'member' }
      ]
    });

    await room.save();
    await room.populate('members.user', 'username avatar isOnline status');

    res.status(201).json(room);
  } catch (error) {
    console.error('Create private chat error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
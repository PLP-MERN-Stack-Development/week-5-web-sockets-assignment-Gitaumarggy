// socket.js - Socket.io client setup

import { io } from 'socket.io-client';
import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

// Socket.io connection URL
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

// Create socket instance for /chat namespace
export const socket = io(`${SOCKET_URL}/chat`, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// Custom hook for using socket.io
export const useSocket = (currentUsername, currentRoom) => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [lastMessage, setLastMessage] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);

  // Connect to socket server
  const connect = (username, room) => {
    socket.connect();
    if (username && room) {
      socket.emit('user_join', username, room);
    }
  };

  // Disconnect from socket server
  const disconnect = () => {
    socket.disconnect();
  };

  // Send a message with tempId for delivery acknowledgment
  const sendMessage = (message, extra = {}) => {
    const tempId = uuidv4();
    setMessages(prev => [...prev, { ...extra, message, sender: currentUsername, tempId, status: 'sending', timestamp: new Date().toISOString() }]);
    socket.emit('send_message', { ...extra, message, tempId });
  };

  // Send a private message
  const sendPrivateMessage = (to, message) => {
    socket.emit('private_message', { to, message });
  };

  // Set typing status
  const setTyping = (isTyping) => {
    socket.emit('typing', isTyping);
  };

  // Socket event listeners
  useEffect(() => {
    // Connection events
    const onConnect = () => {
      setIsConnected(true);
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    // Message events
    const onReceiveMessage = (message) => {
      setLastMessage(message);
      setMessages(prev => {
        // If this is an ack for a message we sent, update its status
        if (message.tempId && prev.some(m => m.tempId === message.tempId)) {
          return prev.map(m => m.tempId === message.tempId ? { ...message, status: 'delivered' } : m);
        }
        // Otherwise, add the new message
        return [...prev, message];
      });
    };

    const onPrivateMessage = (message) => {
      setLastMessage(message);
      setMessages((prev) => [...prev, message]);
    };

    // User events
    const onUserList = (userList) => {
      setUsers(userList);
    };

    const onUserJoined = (user) => {
      // Only add a system message if the joining user is not you
      if (user.username !== currentUsername) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            system: true,
            message: `${user.username} joined the chat`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    };

    const onUserLeft = (user) => {
      // You could add a system message here
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          system: true,
          message: `${user.username} left the chat`,
          timestamp: new Date().toISOString(),
        },
      ]);
    };

    // Typing events
    const onTypingUsers = (users) => {
      setTypingUsers(users);
    };

    // Register event listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('receive_message', onReceiveMessage);
    socket.on('private_message', onPrivateMessage);
    socket.on('user_list', onUserList);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);
    socket.on('typing_users', onTypingUsers);
    // Handle message reaction updates
    const onMessageReactionUpdate = ({ messageId, reactions }) => {
      setMessages(prevMsgs => prevMsgs.map(m => m.id === messageId ? { ...m, reactions } : m))
    }
    socket.on('message_reaction_update', onMessageReactionUpdate);

    // Clean up event listeners
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('receive_message', onReceiveMessage);
      socket.off('private_message', onPrivateMessage);
      socket.off('user_list', onUserList);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
      socket.off('typing_users', onTypingUsers);
      socket.off('message_reaction_update', onMessageReactionUpdate);
    };
  }, []);

  return {
    socket,
    isConnected,
    lastMessage,
    messages,
    users,
    typingUsers,
    connect,
    disconnect,
    sendMessage,
    sendPrivateMessage,
    setTyping,
  };
};

export default socket; 
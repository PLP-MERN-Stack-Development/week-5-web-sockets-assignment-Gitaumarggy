import { useState, useEffect, useRef } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { useSocket, socket } from './socket/socket'
import axios from 'axios'

const DEFAULT_ROOMS = ['General', 'Sports', 'Tech']
const REACTIONS = ['👍', '❤️', '😂']

function App() {
  const [username, setUsername] = useState('')
  const [input, setInput] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [privateInput, setPrivateInput] = useState('')
  const [selectedUser, setSelectedUser] = useState('')
  const [room, setRoom] = useState('General')
  const [customRoom, setCustomRoom] = useState('')
  const [rooms, setRooms] = useState(DEFAULT_ROOMS)
  const [file, setFile] = useState(null)
  const {
    isConnected,
    connect,
    disconnect,
    messages,
    sendMessage,
    sendPrivateMessage,
    typingUsers,
    setTyping,
    users,
  } = useSocket(username, room)

  // Attach socket instance to window for event usage
  useEffect(() => {
    window.socket = socket
    return () => { window.socket = undefined }
  }, [])

  const myId = users.find(u => u.username === username)?.id
  const filteredPrivateMessages = messages.filter(
    msg => msg.isPrivate && (msg.senderId === myId || msg.to === myId)
  )

  const chatWindowRef = useRef(null)
  const [readStatus, setReadStatus] = useState({}) // { messageId: [socketId, ...] }
  const [showNewMessageBanner, setShowNewMessageBanner] = useState(false)
  const [windowFocused, setWindowFocused] = useState(true)
  const [userEventBanner, setUserEventBanner] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState('connected') // 'connected', 'disconnected', 'reconnecting'
  const [searchTerm, setSearchTerm] = useState('')

  // Track window focus
  useEffect(() => {
    const onFocus = () => setWindowFocused(true)
    const onBlur = () => setWindowFocused(false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // Show banner if new message arrives and not at bottom or not focused
  useEffect(() => {
    if (!isConnected) return
    if (messages.length === 0) return
    const chatDiv = chatWindowRef.current
    if (!chatDiv) return
    const isAtBottom = chatDiv.scrollHeight - chatDiv.scrollTop - chatDiv.clientHeight < 10
    if (!isAtBottom || !windowFocused) {
      setShowNewMessageBanner(true)
      setUnreadCount(c => c + 1)
    }
  }, [messages])

  // Scroll to bottom and clear banner and unread count
  const handleScrollToBottom = () => {
    const chatDiv = chatWindowRef.current
    if (chatDiv) {
      chatDiv.scrollTop = chatDiv.scrollHeight
    }
    setShowNewMessageBanner(false)
    setUnreadCount(0)
  }

  // Hide banner and reset unread count if user scrolls to bottom
  useEffect(() => {
    const chatDiv = chatWindowRef.current
    if (!chatDiv) return
    const onScroll = () => {
      const isAtBottom = chatDiv.scrollHeight - chatDiv.scrollTop - chatDiv.clientHeight < 10
      if (isAtBottom) {
        setShowNewMessageBanner(false)
        setUnreadCount(0)
      }
    }
    chatDiv.addEventListener('scroll', onScroll)
    return () => chatDiv.removeEventListener('scroll', onScroll)
  }, [chatWindowRef])

  // Reset unread count when window is focused
  useEffect(() => {
    if (windowFocused) setUnreadCount(0)
  }, [windowFocused])

  // Update page title with unread count
  useEffect(() => {
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) Chat`
    } else {
      document.title = 'Chat'
    }
  }, [unreadCount])

  useEffect(() => {
    if (!isConnected) return
    // Listen for read receipt updates
    const handleReadUpdate = ({ messageId, readBy }) => {
      setReadStatus(prev => ({ ...prev, [messageId]: readBy }))
    }
    window.socket?.on?.('message_read_update', handleReadUpdate)
    return () => {
      if (window.socket) {
        window.socket.off('message_read_update', handleReadUpdate)
      }
    }
  }, [isConnected])

  // Emit read receipt for visible messages
  useEffect(() => {
    if (!isConnected) return
    messages.filter(msg => !msg.isPrivate).forEach(msg => {
      window.socket?.emit?.('message_read', msg.id)
    })
  }, [messages, isConnected])

  // Show notification when a user joins or leaves
  useEffect(() => {
    if (!isConnected) return
    const handleUserJoined = (user) => {
      if (user.username !== username) {
        setUserEventBanner(`${user.username} joined the room`)
        setTimeout(() => setUserEventBanner(null), 3500)
      }
    }
    const handleUserLeft = (user) => {
      setUserEventBanner(`${user.username} left the room`)
      setTimeout(() => setUserEventBanner(null), 3500)
    }
    window.socket?.on?.('user_joined', handleUserJoined)
    window.socket?.on?.('user_left', handleUserLeft)
    return () => {
      if (window.socket) {
        window.socket.off('user_joined', handleUserJoined)
        window.socket.off('user_left', handleUserLeft)
      }
    }
  }, [isConnected, username])

  const handleReact = (messageId, reaction) => {
    window.socket?.emit?.('message_reaction', { messageId, reaction })
  }

  const handleConnect = () => {
    if (input.trim() && room.trim()) {
      setUsername(input)
      connect(input, room)
      if (!rooms.includes(room)) {
        setRooms(prev => [...prev, room])
      }
    }
  }

  const handleDisconnect = () => {
    disconnect()
    setUsername('')
  }

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) {
      setFile(selectedFile)
    }
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (file) {
      // Read file as base64
      const reader = new FileReader()
      reader.onload = () => {
        const fileData = reader.result
        sendMessage('', {
          file: fileData,
          fileName: file.name,
          fileType: file.type,
        })
        setFile(null)
      }
      reader.readAsDataURL(file)
      setChatInput('')
      return
    }
    if (chatInput.trim()) {
      sendMessage(chatInput)
      setChatInput('')
      setTyping(false)
    }
  }

  const handleInputChange = (e) => {
    setChatInput(e.target.value)
    setTyping(e.target.value.length > 0)
  }

  const handleSendPrivateMessage = (e) => {
    e.preventDefault()
    if (privateInput.trim() && selectedUser) {
      sendPrivateMessage(selectedUser, privateInput)
      setPrivateInput('')
    }
  }

  const handleRoomChange = (e) => {
    setRoom(e.target.value)
    setCustomRoom('')
  }

  const handleCustomRoomChange = (e) => {
    setCustomRoom(e.target.value)
    setRoom(e.target.value)
  }

  // Sound notification for new messages
  const notificationAudio = useRef(null)

  useEffect(() => {
    if (!isConnected) return
    if (messages.length === 0) return
    const chatDiv = chatWindowRef.current
    if (!chatDiv) return
    const isAtBottom = chatDiv.scrollHeight - chatDiv.scrollTop - chatDiv.clientHeight < 10
    if ((!isAtBottom || !windowFocused) && notificationAudio.current) {
      notificationAudio.current.currentTime = 0
      notificationAudio.current.play()
    }
  }, [messages])

  // Request browser notification permission on load
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission()
    }
  }, [])

  // Show browser notification for new messages when not focused
  useEffect(() => {
    if (!isConnected) return
    if (messages.length === 0) return
    if (!windowFocused) {
      const lastMsg = messages[messages.length - 1]
      if (lastMsg && !lastMsg.isPrivate && lastMsg.sender !== username && lastMsg.message) {
        if ("Notification" in window && Notification.permission === "granted") {
          const n = new Notification(`${lastMsg.sender} in ${room}`, {
            body: lastMsg.message,
            icon: '/vite.svg',
          })
          n.onclick = () => window.focus()
        }
      }
    }
  }, [messages, windowFocused, isConnected, username, room])

  // Load more messages (pagination)
  const handleLoadMore = async () => {
    if (!room || loadingMore) return
    setLoadingMore(true)
    try {
      const skip = messages.filter(m => !m.isPrivate).length
      const res = await axios.get(`/api/messages?room=${encodeURIComponent(room)}&skip=${skip}&limit=20`)
      const older = res.data
      if (older.length === 0) setHasMore(false)
      if (older.length > 0) {
        // Prepend older messages
        window.scrollTo(0, 0)
        socket.emit('pause') // optional: pause socket events if needed
        setTimeout(() => {
          socket.emit('resume')
        }, 100)
        // Insert at the start, but keep private messages at the end
        const privates = messages.filter(m => m.isPrivate)
        const newMsgs = [...older, ...messages.filter(m => !m.isPrivate), ...privates]
        socket.emit('replace_messages', newMsgs) // optional: for sync
      }
    } catch (e) {
      setHasMore(false)
    }
    setLoadingMore(false)
  }

  useEffect(() => {
    if (!window.socket) return
    const handleConnect = () => setConnectionStatus('connected')
    const handleDisconnect = () => setConnectionStatus('disconnected')
    const handleReconnectAttempt = () => setConnectionStatus('reconnecting')
    window.socket.on('connect', handleConnect)
    window.socket.on('disconnect', handleDisconnect)
    window.socket.on('reconnect_attempt', handleReconnectAttempt)
    return () => {
      if (window.socket) {
        window.socket.off('connect', handleConnect)
        window.socket.off('disconnect', handleDisconnect)
        window.socket.off('reconnect_attempt', handleReconnectAttempt)
      }
    }
  }, [])

  return (
    <>
      <h1 style={{textAlign: 'center', fontWeight: 700, fontSize: '2.1em', margin: '18px 0 12px 0', letterSpacing: '0.01em'}}>Real Time Chat</h1>
      <div className="card" style={{maxWidth: 800, width: '100%', margin: '0 auto', boxSizing: 'border-box', padding: 24}}>
        {/* Message search bar */}
        <div style={{marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8}}>
          <input
            type="text"
            placeholder="Search messages..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{flex: 1, padding: 6, borderRadius: 4, border: '1px solid #ccc'}}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} style={{padding: '6px 12px', borderRadius: 4, border: 'none', background: '#eee', cursor: 'pointer'}}>Clear</button>
          )}
        </div>
        {connectionStatus !== 'connected' && (
          <div style={{background: connectionStatus === 'reconnecting' ? '#fff3bf' : '#ffa8a8', color: '#222', padding: '6px 12px', borderRadius: 8, marginBottom: 8, fontWeight: 500, textAlign: 'center'}}>
            {connectionStatus === 'disconnected' && 'Disconnected from server. Trying to reconnect...'}
            {connectionStatus === 'reconnecting' && 'Reconnecting to server...'}
          </div>
        )}
        <p>
          Socket connection status: <b>{isConnected ? 'Connected' : 'Disconnected'}</b>
        </p>
        {/* Notification sound */}
        <audio ref={notificationAudio} src="/notification.mp3" preload="auto" />
        {userEventBanner && (
          <div style={{background: '#d0ebff', color: '#1864ab', padding: '6px 12px', borderRadius: 8, marginBottom: 8, fontWeight: 500, textAlign: 'center', transition: 'opacity 0.3s'}}>
            {userEventBanner}
          </div>
        )}
        {showNewMessageBanner && (
          <div style={{background: '#ffe066', color: '#222', padding: '6px 12px', borderRadius: 8, marginBottom: 8, cursor: 'pointer', fontWeight: 500, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8}} onClick={handleScrollToBottom}>
            <span>New message! Click to view</span>
            {unreadCount > 0 && (
              <span style={{background: '#fa5252', color: '#fff', borderRadius: '50%', padding: '2px 8px', fontSize: '0.95em', marginLeft: 4}}>{unreadCount}</span>
            )}
          </div>
        )}
        {isConnected ? (
          <>
            <p>Welcome, {username}! <span style={{color:'#888'}}>Room: <b>{room}</b></span></p>
            <button onClick={handleDisconnect}>Disconnect</button>
            <div style={{ margin: '16px 0', padding: 8, border: '1px solid #eee', background: '#fafbfc', borderRadius: 4 }}>
              <b>Online users ({users.length}):</b>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {users.map((user, idx) => (
                  <li key={user.id || idx} style={{ color: user.username === username ? '#0070f3' : '#222', fontWeight: user.username === username ? 'bold' : 'normal' }}>
                    {user.username} {user.username === username ? '(You)' : ''}
                  </li>
                ))}
              </ul>
            </div>
            <div className="chat-window" ref={chatWindowRef} style={{marginTop: 20, maxHeight: 500, minHeight: 220, overflowY: 'auto', border: '1px solid #ccc', padding: 18, background: '#fff', borderRadius: 8, fontSize: '1.08em', boxSizing: 'border-box', width: '100%'}}>
              {hasMore && (
                <button onClick={handleLoadMore} disabled={loadingMore} style={{marginBottom: 8, width: '100%', background: '#e9ecef', border: 'none', borderRadius: 4, padding: 6, fontWeight: 500, cursor: 'pointer'}}>
                  {loadingMore ? 'Loading...' : 'Load more'}
                </button>
              )}
              {messages.length === 0 ? (
                <p style={{color: '#888'}}>No messages yet.</p>
              ) : (
                messages.filter(msg => !msg.isPrivate)
                  .filter(msg =>
                    !searchTerm ||
                    (msg.message && msg.message.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (msg.sender && msg.sender.toLowerCase().includes(searchTerm.toLowerCase()))
                  )
                .map((msg, idx) => {
                  const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                  const allRead = readStatus[msg.id]?.length === users.length
                  const isMine = msg.sender === username
                  return (
                    <div key={msg.id || msg.tempId || idx} style={{marginBottom: 16, position: 'relative'}} className="chat-message">
                      <div style={{display: 'flex', alignItems: 'center'}}>
                        <b>{msg.sender || (msg.system ? 'System' : 'Unknown')}</b>
                        {time && <span style={{ color: '#888', marginLeft: 8, fontSize: '0.85em' }}>{time}</span>}
                        : <span style={searchTerm && msg.message && msg.message.toLowerCase().includes(searchTerm.toLowerCase()) ? { background: '#ffe066' } : {}}>{msg.message}</span>
                        {isMine && msg.status === 'sending' && (
                          <span style={{ color: '#888', marginLeft: 8, fontSize: '0.85em' }}>Sending…</span>
                        )}
                        {isMine && msg.status === 'delivered' && (
                          <span style={{ color: 'green', marginLeft: 8, fontSize: '1.1em' }}>✓</span>
                        )}
                        {allRead && (
                          <span style={{ color: 'green', marginLeft: 8, fontSize: '0.85em' }}>✓ Read</span>
                        )}
                      </div>
                      {msg.file && (
                        <div style={{marginTop: 4}}>
                          {msg.fileType && msg.fileType.startsWith('image') ? (
                            <img src={msg.file} alt={msg.fileName} style={{maxWidth: 200, maxHeight: 200, display: 'block', marginTop: 4}} />
                          ) : (
                            <a href={msg.file} download={msg.fileName} target="_blank" rel="noopener noreferrer">
                              {msg.fileName || 'Download file'}
                            </a>
                          )}
                        </div>
                      )}
                      {/* Reaction bubble */}
                      {Object.entries(msg.reactions || {}).filter(([_, arr]) => arr && arr.length > 0).length > 0 && (
                        <div style={{
                          display: 'flex',
                          gap: 4,
                          background: '#f1f1f1',
                          borderRadius: 16,
                          padding: '2px 8px',
                          fontSize: '1.1em',
                          position: 'relative',
                          float: 'right',
                          marginTop: 4,
                          width: 'fit-content',
                          marginLeft: 'auto'
                        }}>
                          {Object.entries(msg.reactions || {}).map(([r, arr]) =>
                            arr && arr.length > 0 ? (
                              <span key={r} style={{marginRight: 4}}>{r} {arr.length}</span>
                            ) : null
                          )}
                        </div>
                      )}
                      {/* Reaction buttons (always visible) */}
                      <div style={{display: 'flex', gap: 4, marginTop: 2, opacity: 0.8, fontSize: '1.1em'}} className="reaction-buttons">
                        {REACTIONS.map(r => (
                          <button
                            key={r}
                            type="button"
                            style={{background: 'none', border: 'none', cursor: 'pointer', padding: 2}}
                            onClick={() => handleReact(msg.id, r)}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {typingUsers.length > 0 && (
              <div style={{ color: '#888', fontStyle: 'italic', marginTop: 4 }}>
                {typingUsers.length === 1
                  ? `${typingUsers[0]} is typing...`
                  : 'Several people are typing...'}
              </div>
            )}
            <form onSubmit={handleSendMessage} style={{marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap'}}>
              <input
                type="text"
                placeholder="Type a message..."
                value={chatInput}
                onChange={handleInputChange}
                style={{flex: 2, minWidth: 0, fontSize: '1em', padding: 8, borderRadius: 4, border: '1px solid #ccc'}}
                disabled={!isConnected}
              />
              <input
                type="file"
                onChange={handleFileChange}
                style={{flex: 1, minWidth: 0}}
                disabled={!isConnected}
              />
              <button type="submit" disabled={(!chatInput.trim() && !file) || !isConnected} style={{padding: '8px 16px', borderRadius: 4, border: 'none', background: '#228be6', color: '#fff', fontWeight: 500, fontSize: '1em', cursor: 'pointer'}}>
                Send
              </button>
            </form>
            {/* Private Messaging Section */}
            <div style={{marginTop: 32, borderTop: '1px solid #eee', paddingTop: 16}}>
              <b>Private Message</b>
              <form onSubmit={handleSendPrivateMessage} style={{display: 'flex', gap: 8, marginTop: 8}}>
                <select
                  value={selectedUser}
                  onChange={e => setSelectedUser(e.target.value)}
                  style={{flex: 1}}
                >
                  <option value="">Select user...</option>
                  {users.filter(u => u.username !== username).map(u => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Type a private message..."
                  value={privateInput}
                  onChange={e => setPrivateInput(e.target.value)}
                  style={{flex: 2}}
                  disabled={!selectedUser}
                />
                <button type="submit" disabled={!privateInput.trim() || !selectedUser}>
                  Send
                </button>
              </form>
              <div style={{marginTop: 12, maxHeight: 120, overflowY: 'auto', border: '1px solid #ccc', padding: 8, background: '#f9f9f9'}}>
                {filteredPrivateMessages.length === 0 ? (
                  <p style={{color: '#888'}}>No private messages yet.</p>
                ) : (
                  filteredPrivateMessages.map((msg, idx) => {
                    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    return (
                      <div key={msg.id || idx} style={{marginBottom: 8}}>
                        <b>{msg.sender || 'You'}</b>
                        {time && <span style={{ color: '#888', marginLeft: 8, fontSize: '0.85em' }}>{time}</span>}
                        : {msg.message}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <input
              type="text"
              placeholder="Enter username"
              value={input}
              onChange={e => setInput(e.target.value)}
            />
            <div style={{margin: '12px 0'}}>
              <b>Select or create a room:</b>
              <select value={room} onChange={handleRoomChange} style={{marginLeft: 8}}>
                {rooms.map((r, idx) => (
                  <option key={r + idx} value={r}>{r}</option>
                ))}
              </select>
              <span style={{margin: '0 8px'}}>or</span>
              <input
                type="text"
                placeholder="New room name"
                value={customRoom}
                onChange={handleCustomRoomChange}
                style={{width: 120}}
              />
            </div>
            <button onClick={handleConnect} disabled={!input.trim() || !room.trim()}>
              Connect
            </button>
          </>
        )}
      </div>
      <p className="read-the-docs" style={{fontSize: '0.95em', textAlign: 'center', marginTop: 24}}>
        Click on the Vite and React logos to learn more
      </p>
      <style>{`
        @media (max-width: 600px) {
          .card {
            max-width: 100vw !important;
            padding: 4vw !important;
          }
          .chat-window {
            max-height: 50vh !important;
            min-height: 120px !important;
            font-size: 0.98em !important;
          }
          .reaction-buttons button {
            font-size: 1.3em !important;
            padding: 8px !important;
          }
          input, button {
            font-size: 1em !important;
          }
        }
      `}</style>
    </>
  )
}

export default App

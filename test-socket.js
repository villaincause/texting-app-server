import { io } from 'socket.io-client';

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjMsInVzZXJuYW1lIjoicHJpbmNlX3YxIiwiaWF0IjoxNzkwMjY4OTI0LCJleHAiOjE3OTA4NzM3MjR9.-Kg725C_NW5BWCIT3Zr9jZbneGsP8vUvRvyr7kKXGGs';

const socket = io('http://localhost:5000', {
  auth: {
    token: TOKEN
  },
  extraHeaders: {
    Authorization: `Bearer ${TOKEN}`
  }
});

socket.on('connect', () => {
  console.log('✅ Connected to Socket.IO server!');
  console.log('Socket ID:', socket.id);
  
  // Test pinging the server
  socket.emit('ping', { message: 'Hello Server' });
});

socket.on('connect_error', (err) => {
  console.error('❌ Connection Error:', err.message);
  process.exit(1);
});

socket.on('disconnect', (reason) => {
  console.log('⚠️ Disconnected:', reason);
});

// Catch custom server events if your backend emits any on connect
socket.onAny((eventName, ...args) => {
  console.log(`📩 Received event "${eventName}":`, args);
});
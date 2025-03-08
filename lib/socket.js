// lib/socket.js (client-side)
import { io } from 'socket.io-client';

let socket;

export const initSocket = async () => {
  // Make sure socket server is initialized
  await fetch('/api/socket');
  
  if (!socket) {
    socket = io();
  }
  
  return socket;
};

export const joinDocument = (documentId, userId) => {
  if (socket) {
    socket.emit('join-document', { documentId, userId });
  }
};

export const updateCursor = (documentId, userId, range) => {
  if (socket) {
    socket.emit('cursor-change', { documentId, userId, range });
  }
};

export const sendTextChange = (documentId, delta, userId) => {
  if (socket) {
    socket.emit('text-change', { documentId, delta, userId });
  }
};

export const saveDocument = (documentId, content, userId) => {
  if (socket) {
    socket.emit('save-document', { documentId, content, userId });
  }
};
export const leaveDocument = (documentId,  userId,userName) => {
  if (socket) {
    socket.emit('leave-document', { documentId, userId,userName });
  }
};
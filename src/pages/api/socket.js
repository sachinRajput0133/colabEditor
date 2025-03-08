import { Server } from 'socket.io';
import Document from '@models/Document';
import Version from '@models/Version';
import dbConnect from '@lib/db';

export const config = {
  api: {
    bodyParser: false,
  },
};

const SocketHandler = async (req, res) => {
  // Check if socket server is already running
  if (res.socket.server.io) {
    console.log('Socket server already running');
    res.end();
    return;
  }

  // Connect to database
  await dbConnect();

  console.log('Setting up socket server...');
  
  // Initialize socket server
  const io = new Server(res.socket.server, {
    path: '/api/socket',
    cors: {
      origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });
  
  // Store socket instance on server
  res.socket.server.io = io;

  // Handle socket connections
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Join document room
    socket.on('join-document', async ({ documentId, userId, userName }) => {
      socket.join(documentId);
      console.log(`User ${userId} (${userName}) joined document: ${documentId}`);

      try {
        // Find document
        const document = await Document.findById(documentId);
        
        if (document) {
          // Send document data to the client
          socket.emit('load-document', document.content);
          
          // Notify others that a user has joined
          socket.to(documentId).emit('user-joined', {
            userId,
            userName,
            socketId: socket.id,
          });
        }
      } catch (error) {
        console.error('Error loading document:', error);
        socket.emit('error', { message: 'Error loading document' });
      }
    });

    // Handle document changes
    socket.on('send-changes', ({ documentId, delta, userId }) => {
      // Broadcast changes to all clients in the room except sender
      socket.to(documentId).emit('receive-changes', {
        delta,
        userId,
      });
    });

    // Handle cursor position updates
    socket.on('cursor-position', ({ documentId, position, userId, userName }) => {
      socket.to(documentId).emit('cursor-update', {
        userId,
        userName,
        position,
      });
    });

    // Save document (auto-save)
    socket.on('save-document', async ({ documentId, content, userId }) => {
      try {
        // Update document in database
        const document = await Document.findByIdAndUpdate(
          documentId,
          { 
            content, 
            lastModifiedBy: userId 
          },
          { new: true }
        );

        // Create new version every 5 saves or significant changes
        const versionsCount = await Version.countDocuments({ documentId });
        
        if (versionsCount % 5 === 0) {
          await Version.create({
            documentId,
            content,
            createdBy: userId,
            versionNumber: versionsCount + 1,
          });
        }

        // Notify clients that document was saved
        io.to(documentId).emit('document-saved', {
          savedAt: new Date().toISOString(),
        });
        
      } catch (error) {
        console.error('Error saving document:', error);
        socket.emit('save-error', { error: 'Failed to save document' });
      }
    });

    // Leave document
    socket.on('leave-document', ({ documentId, userId, userName }) => {
      socket.leave(documentId);
      socket.to(documentId).emit('user-left', { userId, userName });
      console.log(`User ${userId} (${userName}) left document: ${documentId}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  console.log('Socket server initialized');
  res.end();
};

export default SocketHandler;
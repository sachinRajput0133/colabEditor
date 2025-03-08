import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import debounce from 'lodash.debounce';
import { format } from 'date-fns';
// import 'quill/dist/quill.snow.css';
import 'react-quill/dist/quill.snow.css';
import {
  initSocket,
  joinDocument,
  leaveDocument,
  sendChanges,
  updateCursorPosition,
  saveDocument,
} from '../../lib/socket';
import ShareModal from './ShareModal';
import VersionHistoryModal from './VersionHistory';

// Import Quill dynamically to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill'), {
  ssr: false,
  loading: () => <div className="h-screen flex items-center justify-center">Loading editor...</div>,
});

// Random colors for user cursors
const CURSOR_COLORS = [
  '#FF5733', '#33FF57', '#3357FF', '#FF33A8', 
  '#33A8FF', '#A833FF', '#FFB533', '#33FFE0'
];

const DocumentEditor = ({ documentId, initialDocument }) => {
  const { data: session } = useSession();
  const router = useRouter();
  const [title, setTitle] = useState(initialDocument?.title || 'Untitled Document');
  const [content, setContent] = useState(initialDocument?.content || { ops: [] });
  const [socket, setSocket] = useState(null);
  const [activeUsers, setActiveUsers] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  
  const quillRef = useRef(null);
  const editorRef = useRef(null);
  const cursorsModule = useRef(null);

  // Initialize editor permissions
  useEffect(() => {
    if (session && initialDocument) {
      // Admin can edit any document
      if (session.user.role === 'admin') {
        setCanEdit(true);
        return;
      }
      
      // Owner can edit their documents
      if (initialDocument.owner === session.user.id) {
        setCanEdit(true);
        return;
      }
      
      // Check collaborator permissions
      const collaborator = initialDocument.collaborators.find(
        c => c.user._id === session.user.id
      );
      
      if (collaborator && collaborator.permission === 'can_edit') {
        setCanEdit(true);
      } else {
        setCanEdit(false);
      }
    }
  }, [session, initialDocument]);

  // Initialize socket connection
  useEffect(() => {
    const setupSocket = async () => {
      const socketInstance = await initSocket();
      setSocket(socketInstance);
      
      return () => {
        if (socketInstance && documentId) {
          leaveDocument(documentId, session?.user?.id, session?.user?.name);
        }
      };
    };
    
    if (session?.user) {
      setupSocket();
    }
    
    return () => {
      if (socket && documentId) {
        leaveDocument(documentId, session?.user?.id, session?.user?.name);
      }
    };
  }, [session]);

  // Join document room when socket is ready
  useEffect(() => {
    if (socket && session?.user && documentId) {
      joinDocument(documentId, session.user.id, session.user.name);
      
      // Load document content
      socket.on('load-document', (docContent) => {
        setContent(docContent);
        if (editorRef.current) {
          editorRef.current.setContents(docContent);
        }
      });
      
      // Handle receiving changes from other users
      socket.on('receive-changes', ({ delta, userId }) => {
        if (editorRef.current && userId !== session.user.id) {
          editorRef.current.updateContents(delta);
        }
      });
      
      // Handle cursor updates
      socket.on('cursor-update', ({ userId, userName, position }) => {
        if (cursorsModule.current && userId !== session.user.id) {
          // Get a color for this user based on their ID
          const colorIndex = userId.charCodeAt(0) % CURSOR_COLORS.length;
          const color = CURSOR_COLORS[colorIndex];
          
          cursorsModule.current.createCursor(userId, userName, color);
          cursorsModule.current.moveCursor(userId, position);
        }
      });
      
      // Track users joining
      socket.on('user-joined', ({ userId, userName }) => {
        setActiveUsers(prev => ({
          ...prev,
          [userId]: { id: userId, name: userName }
        }));
      });
      
      // Track users leaving
      socket.on('user-left', ({ userId }) => {
        setActiveUsers(prev => {
          const newUsers = { ...prev };
          delete newUsers[userId];
          return newUsers;
        });
        
        // Remove cursor
        if (cursorsModule.current) {
          cursorsModule.current.removeCursor(userId);
        }
      });
      
      // Handle document save confirmation
      socket.on('document-saved', ({ savedAt }) => {
        setIsSaving(false);
        setLastSaved(new Date(savedAt));
      });
      
      return () => {
        socket.off('load-document');
        socket.off('receive-changes');
        socket.off('cursor-update');
        socket.off('user-joined');
        socket.off('user-left');
        socket.off('document-saved');
      };
    }
  }, [socket, session, documentId]);

  // Setup Quill editor
  useEffect(() => {
    // This function is called when the Quill component mounts
    const initializeEditor = () => {
      // if (quillRef.current) {
      //   // Get the actual editor instance
      //   const editor = quillRef.current.getEditor();
        
      //   // Store the editor for later use
      //   editorRef.current = editor;
        
      //   // Get cursors module
      //   cursorsModule.current = editor.getModule('cursors');
        
      //   // Set up selection change handler for cursor tracking
      //   editor.on('selection-change', (range, oldRange, source) => {
      //     if (range && socket && session?.user) {
      //       updateCursorPosition(
      //         documentId, 
      //         range, 
      //         session.user.id, 
      //         session.user.name
      //       );
      //     }
      //   });
      // }
    };

    // Try to initialize editor when component mounts or Quill ref changes
    initializeEditor();
  }, [quillRef.current, socket, session, documentId]);

  // Handle document changes
  const handleChange = useCallback((content, delta, source, editor) => {
    if (source === 'user' && socket && session?.user) {
      sendChanges(documentId, delta, session.user.id);
      debouncedSave(editor.getContents());
    }
  }, [socket, session, documentId]);

  // Debounced auto-save (every 5 seconds)
  const debouncedSave = useCallback(
    debounce((content) => {
      if (socket && session?.user && documentId) {
        setIsSaving(true);
        saveDocument(documentId, content, session.user.id);
      }
    }, 5000),
    [socket, session, documentId]
  );

  // Handle title change
  const handleTitleChange = async (e) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    
    try {
      await fetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });
    } catch (error) {
      console.error('Error updating title:', error);
    }
  };

  // Manual save
  const handleManualSave = () => {
    if (editorRef.current && socket && session?.user) {
      const content = editorRef.current.getContents();
      
      setIsSaving(true);
      saveDocument(documentId, content, session.user.id);
    }
  };

  // Quill modules configuration
  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      [{ 'indent': '-1' }, { 'indent': '+1' }],
      [{ 'align': [] }],
      ['link', 'image'],
      ['clean']
    ],
    cursors: true,
    history: {
      userOnly: true
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-white">
        <div className="flex-1">
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            className="text-2xl font-semibold outline-none w-full"
            disabled={!canEdit}
          />
          <div className="text-sm text-gray-500">
            {lastSaved && `Last saved: ${format(new Date(lastSaved), 'MMM d, yyyy h:mm a')}`}
            {isSaving && ' • Saving...'}
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Active users */}
          <div className="flex items-center">
            <span className="mr-2 text-sm text-gray-600">
              {Object.keys(activeUsers).length + 1} active
            </span>
            <div className="flex -space-x-2">
              {/* Current user avatar */}
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm border-2 border-white">
                {session?.user?.name?.[0] || 'U'}
              </div>
              
              {/* Other users avatars */}
              {Object.values(activeUsers).map((user) => (
                <div 
                  key={user.id}
                  className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white text-sm border-2 border-white"
                  title={user.name}
                >
                  {user.name?.[0] || 'U'}
                </div>
              ))}
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="flex space-x-2">
            {canEdit && (
              <button
                onClick={handleManualSave}
                className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm"
              >
                Save
              </button>
            )}
            
            <button
              onClick={() => setShowVersionHistory(true)}
              className="px-3 py-1 bg-purple-600 text-white rounded-md text-sm"
            >
              History
            </button>
            
            <button
              onClick={() => setShowShareModal(true)}
              className="px-3 py-1 bg-green-600 text-white rounded-md text-sm"
            >
              Share
            </button>
          </div>
        </div>
      </div>
      
      {/* Editor */}
      <div className="flex-grow relative">
        {!canEdit && (
          <div className="absolute top-0 left-0 right-0 bg-yellow-100 text-yellow-800 px-4 py-2 text-sm">
            You have read-only access to this document.
          </div>
        )}
        
        {/* <ReactQuill
          ref={quillRef}
          value={content}
          onChange={handleChange}
          modules={modules}
          readOnly={!canEdit}
          className="h-full"
        /> */}
      </div>
      
      {/* Share Modal */}
      {showShareModal && (
        <ShareModal
          documentId={documentId}
          onClose={() => setShowShareModal(false)}
        />
      )}
      
      {/* Version History Modal */}
      {showVersionHistory && (
        <VersionHistoryModal
          documentId={documentId}
          onClose={() => setShowVersionHistory(false)}
          onRestore={(version) => {
            if (editorRef.current && canEdit) {
              editorRef.current.setContents(version.content);
              handleManualSave();
            }
          }}
        />
      )}
    </div>
  )
}

export default DocumentEditor;
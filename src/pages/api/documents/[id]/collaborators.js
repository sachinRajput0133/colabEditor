import { getSession } from 'next-auth/react';
import dbConnect from '../../../../lib/db';
import Document from '../../../../models/Document';
import User from '../../../../models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  await dbConnect();
  
  const { id } = req.query;
  
  // Handle different HTTP methods
  switch (req.method) {
    case 'GET':
      return getCollaborators(req, res, session, id);
    case 'POST':
      return addCollaborator(req, res, session, id);
    default:
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }
}

// Get all collaborators of a document
async function getCollaborators(req, res, session, id) {
  try {
    const document = await Document.findById(id)
      .populate('collaborators.user', 'name email')
      .populate('owner', 'name email');
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Check if user has access to this document
    const userId = session.user.id;
    const userRole = session.user.role;
    
    const isOwner = document.owner._id.toString() === userId;
    const isCollaborator = document.collaborators.some(
      c => c.user._id.toString() === userId
    );
    
    if (!isOwner && !isCollaborator && userRole !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    return res.status(200).json({
      collaborators: document.collaborators,
      shareLink: document.shareLink,
    });
  } catch (error) {
    console.error('Error fetching collaborators:', error);
    return res.status(500).json({ error: 'Failed to fetch collaborators' });
  }
}

// Add a new collaborator to a document
async function addCollaborator(req, res, session, id) {
  try {
    const { email, permission } = req.body;
    
    if (!email || !permission) {
      return res.status(400).json({ error: 'Email and permission are required' });
    }
    
    // Find the document
    const document = await Document.findById(id);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Check if user has permission to add collaborators
    const userId = session.user.id;
    const userRole = session.user.role;
    
    const isOwner = document.owner.toString() === userId;
    const isAdmin = userRole === 'admin';
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to add collaborators' });
    }
    
    // Find the user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if user is already a collaborator
    const existingCollaborator = document.collaborators.find(
      c => c.user.toString() === user._id.toString()
    );
    
    if (existingCollaborator) {
      // Update existing collaborator's permission
      existingCollaborator.permission = permission;
    } else {
      // Add new collaborator
      document.collaborators.push({
        user: user._id,
        permission
      });
    }
    
    await document.save();
    
    // Return updated document with populated collaborators
    const updatedDocument = await Document.findById(id)
      .populate('collaborators.user', 'name email');
    
    return res.status(200).json({
      collaborators: updatedDocument.collaborators
    });
  } catch (error) {
    console.error('Error adding collaborator:', error);
    return res.status(500).json({ error: 'Failed to add collaborator' });
  }
}
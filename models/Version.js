import mongoose from 'mongoose';

const VersionSchema = new mongoose.Schema({
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true
  },
  content: {
    type: Object,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  versionNumber: {
    type: Number,
    required: true
  },
  comment: {
    type: String,
    default: 'Auto-saved version'
  }
}, { timestamps: true });

const Version = mongoose.models.Version || mongoose.model('Version', VersionSchema);

export default Version;
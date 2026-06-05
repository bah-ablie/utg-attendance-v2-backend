const express = require('express');
const router = express.Router();
const {
  createSession,
  getAllSessions,
  getLecturerSessions,
  getSessionById,
  regenerateQR,
  closeSession,
  deleteSession
} = require('../controllers/sessionController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.post('/', protect, authorizeRoles('lecturer'), createSession);
router.get('/', protect, authorizeRoles('admin'), getAllSessions);
router.get('/my-sessions', protect, authorizeRoles('lecturer'), getLecturerSessions);
router.get('/:id', protect, authorizeRoles('admin', 'lecturer'), getSessionById);
router.put('/:id/regenerate-qr', protect, authorizeRoles('lecturer'), regenerateQR);
router.put('/:id/close', protect, authorizeRoles('lecturer'), closeSession);
router.delete('/:id', protect, authorizeRoles('lecturer'), deleteSession);

module.exports = router;
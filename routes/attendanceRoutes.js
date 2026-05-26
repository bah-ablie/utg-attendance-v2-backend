const express = require('express');
const router = express.Router();
const {
  markAttendance,
  getAttendanceBySession,
  getAttendanceByCourse,
  getMyAttendance,
  getAttendanceReport,
  getMyAttendanceReport
} = require('../controllers/attendanceController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.post('/', protect, authorizeRoles('student'), markAttendance);
router.get('/my-attendance', protect, authorizeRoles('student'), getMyAttendance);
router.get('/my-report', protect, authorizeRoles('student'), getMyAttendanceReport);
router.get('/session/:sessionId', protect, authorizeRoles('lecturer', 'admin'), getAttendanceBySession);
router.get('/course/:courseId', protect, authorizeRoles('lecturer', 'admin'), getAttendanceByCourse);
router.get('/report/:courseId', protect, authorizeRoles('lecturer', 'admin'), getAttendanceReport);

module.exports = router;
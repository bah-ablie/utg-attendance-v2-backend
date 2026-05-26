const express = require('express');
const router = express.Router();
const {
  createCourse,
  getAllCourses,
  getCourseById,
  getLecturerCourses,
  getStudentCourses,
  updateCourse,
  deleteCourse,
  enrollStudent,
  unenrollStudent
} = require('../controllers/courseController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Admin routes
router.post('/', protect, authorizeRoles('admin'), createCourse);
router.put('/:id', protect, authorizeRoles('admin'), updateCourse);
router.delete('/:id', protect, authorizeRoles('admin'), deleteCourse);
router.put('/:id/enroll', protect, authorizeRoles('admin'), enrollStudent);
router.put('/:id/unenroll', protect, authorizeRoles('admin'), unenrollStudent);

// Shared routes
router.get('/', protect, getAllCourses);
router.get('/my-courses/lecturer', protect, authorizeRoles('lecturer'), getLecturerCourses);
router.get('/my-courses/student', protect, authorizeRoles('student'), getStudentCourses);
router.get('/:id', protect, getCourseById);

module.exports = router;
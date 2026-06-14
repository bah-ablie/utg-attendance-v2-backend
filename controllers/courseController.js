const Course = require('../models/Course');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

// CREATE COURSE - Admin only
const createCourse = async (req, res) => {
  try {
    const { courseName, courseCode, department, description, lecturer, credits, semester, academicYear } = req.body;

    const existingCourse = await Course.findOne({ courseCode });
    if (existingCourse) {
      return res.status(400).json({ message: 'Course code already exists' });
    }

    const lecturerExists = await User.findById(lecturer);
    if (!lecturerExists || lecturerExists.role !== 'lecturer') {
      return res.status(400).json({ message: 'Invalid lecturer selected' });
    }

    const course = new Course({
      courseName, courseCode, department, description,
      lecturer, credits, semester, academicYear
    });

    await course.save();
    res.status(201).json({ message: 'Course created successfully', course });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET ALL COURSES
const getAllCourses = async (req, res) => {
  try {
    const courses = await Course.find()
      .populate('lecturer', 'fullName email department')
      .populate('students.student', 'fullName email matriculationNumber')
      .sort({ createdAt: -1 });

    const normalizedCourses = courses.map(course => {
      const courseObj = course.toObject();
      courseObj.students = courseObj.students.map(enrollment => {
        if (!enrollment.student && enrollment._id) {
          return {
            _id: enrollment._id,
            student: enrollment,
            enrolledBy: 'admin',
            enrolledAt: new Date()
          };
        }
        return enrollment;
      });
      return courseObj;
    });

    res.status(200).json(normalizedCourses);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET SINGLE COURSE
const getCourseById = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('lecturer', 'fullName email department')
      .populate('students.student', 'fullName email matriculationNumber');

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    res.status(200).json(course);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET COURSES BY LECTURER
const getLecturerCourses = async (req, res) => {
  try {
    const courses = await Course.find({ lecturer: req.user.id })
      .populate('students.student', 'fullName email matriculationNumber');

    const normalizedCourses = courses.map(course => {
      const courseObj = course.toObject();
      courseObj.students = courseObj.students.map(enrollment => {
        if (!enrollment.student && enrollment._id) {
          return {
            _id: enrollment._id,
            student: enrollment,
            enrolledBy: 'admin',
            enrolledAt: new Date()
          };
        }
        return enrollment;
      });
      return courseObj;
    });

    res.status(200).json(normalizedCourses);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET COURSES BY STUDENT
const getStudentCourses = async (req, res) => {
  try {
    const courses = await Course.find({ 'students.student': req.user.id })
      .populate('lecturer', 'fullName email');

    res.status(200).json(courses);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// UPDATE COURSE - Admin only
const updateCourse = async (req, res) => {
  try {
    const { courseName, courseCode, department, description, lecturer, credits, semester, academicYear, isActive } = req.body;

    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { courseName, courseCode, department, description, lecturer, credits, semester, academicYear, isActive },
      { new: true }
    ).populate('lecturer', 'fullName email');

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    res.status(200).json({ message: 'Course updated successfully', course });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// DELETE COURSE - Admin only
const deleteCourse = async (req, res) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }
    res.status(200).json({ message: 'Course deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ENROLL STUDENT - Admin only
const enrollStudent = async (req, res) => {
  try {
    const { studentId } = req.body;

    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(400).json({ message: 'Invalid student selected' });
    }

    const alreadyEnrolled = course.students.some(
      e => e.student.toString() === studentId
    );
    if (alreadyEnrolled) {
      return res.status(400).json({ message: 'Student already enrolled in this course' });
    }

    course.students.push({ student: studentId, enrolledBy: 'admin' });
    await course.save();

    // Fire-and-forget email — does not block response
    sendEmail({
      to: student.email,
      subject: `Enrolled in ${course.courseName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a2e;">Course Enrollment Confirmation</h2>
          <p>Dear ${student.fullName},</p>
          <p>You have been successfully enrolled in:</p>
          <p><strong>Course:</strong> ${course.courseName}</p>
          <p><strong>Code:</strong> ${course.courseCode}</p>
          <p><strong>Department:</strong> ${course.department}</p>
          <br/>
          <p>Best regards,</p>
          <p><strong>UTG Attendance System</strong></p>
        </div>
      `
    }).then(() => {
      console.log('Email sent successfully!');
    }).catch((emailError) => {
      console.log('Email sending failed:', emailError.message);
    });

    res.status(200).json({ message: 'Student enrolled successfully', course });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ENROLL STUDENT - Lecturer only
const lecturerEnrollStudent = async (req, res) => {
  try {
    const { studentId } = req.body;

    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    if (course.lecturer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Access denied. You are not assigned to this course.' });
    }

    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(400).json({ message: 'Invalid student selected' });
    }

    const alreadyEnrolled = course.students.some(
      e => e.student.toString() === studentId
    );
    if (alreadyEnrolled) {
      return res.status(400).json({ message: 'Student already enrolled in this course' });
    }

    course.students.push({ student: studentId, enrolledBy: 'lecturer' });
    await course.save();

    // Fire-and-forget email — does not block response
    sendEmail({
      to: student.email,
      subject: `Enrolled in ${course.courseName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a2e;">Course Enrollment Confirmation</h2>
          <p>Dear ${student.fullName},</p>
          <p>You have been successfully enrolled in:</p>
          <p><strong>Course:</strong> ${course.courseName}</p>
          <p><strong>Code:</strong> ${course.courseCode}</p>
          <p><strong>Department:</strong> ${course.department}</p>
          <br/>
          <p>Best regards,</p>
          <p><strong>UTG Attendance System</strong></p>
        </div>
      `
    }).then(() => {
      console.log('Email sent successfully!');
    }).catch((emailError) => {
      console.log('Email sending failed:', emailError.message);
    });

    res.status(200).json({ message: 'Student enrolled successfully', course });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// UNENROLL STUDENT - Admin and Lecturer
const unenrollStudent = async (req, res) => {
  try {
    const { studentId } = req.body;

    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    if (req.user.role === 'lecturer' &&
        course.lecturer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const isEnrolled = course.students.some(
      e => e.student.toString() === studentId
    );
    if (!isEnrolled) {
      return res.status(400).json({ message: 'Student is not enrolled in this course' });
    }

    course.students = course.students.filter(
      e => e.student.toString() !== studentId
    );
    await course.save();

    res.status(200).json({ message: 'Student unenrolled successfully', course });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  createCourse,
  getAllCourses,
  getCourseById,
  getLecturerCourses,
  getStudentCourses,
  updateCourse,
  deleteCourse,
  enrollStudent,
  lecturerEnrollStudent,
  unenrollStudent
};
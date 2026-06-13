const Attendance = require('../models/Attendance');
const Session = require('../models/Session');
const Course = require('../models/Course');
const sendEmail = require('../utils/sendEmail');

// MARK ATTENDANCE - Student only
const markAttendance = async (req, res) => {
  try {
    const { sessionToken, courseId } = req.body;

    const studentIP = req.headers['x-forwarded-for'] || 
                      req.connection.remoteAddress ||
                      req.socket.remoteAddress;

    const session = await Session.findOne({ sessionToken });
    if (!session) {
      return res.status(404).json({ message: 'Invalid QR code. Session not found.' });
    }

    if (new Date() > new Date(session.qrCodeExpiresAt)) {
      return res.status(400).json({ message: 'QR code has expired. Please ask your lecturer to regenerate.' });
    }

    if (!session.isActive) {
      return res.status(400).json({ message: 'This session has been closed.' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    // Security Layer 3: Check if student is enrolled (new data structure)
    const isEnrolled = course.students.some(
      enrollment => {
        const studentId = enrollment.student || enrollment;
        return studentId.toString() === req.user.id.toString();
      }
    );
    if (!isEnrolled) {
      return res.status(403).json({ 
        message: 'Access denied. You are not enrolled in this course.' 
      });
    }

    const existingAttendance = await Attendance.findOne({
      session: session._id,
      student: req.user.id
    });
    if (existingAttendance) {
      return res.status(400).json({ message: 'Attendance already marked for this session.' });
    }

    if (session.scannedIPs.includes(studentIP)) {
      return res.status(400).json({ 
        message: 'This device has already been used to mark attendance.' 
      });
    }

    session.scannedIPs.push(studentIP);
    await session.save();

    const attendance = new Attendance({
      session: session._id,
      course: courseId,
      student: req.user.id,
      ipAddress: studentIP,
      status: 'present'
    });

    await attendance.save();

    try {
      await sendEmail({
        to: req.user.email,
        subject: `Attendance Marked - ${course.courseName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a2e;">Attendance Confirmed! ✅</h2>
            <p>Dear ${req.user.fullName},</p>
            <p>Your attendance has been successfully recorded.</p>
            <p><strong>Course:</strong> ${course.courseName} (${course.courseCode})</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${new Date().toLocaleTimeString()}</p>
            <br/>
            <p>Best regards,</p>
            <p><strong>UTG Attendance System</strong></p>
          </div>
        `
      });
    } catch (emailError) {
      console.log('Email sending failed:', emailError.message);
    }

    res.status(201).json({ 
      message: 'Attendance marked successfully!',
      attendance
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET ATTENDANCE BY SESSION - Lecturer and Admin
const getAttendanceBySession = async (req, res) => {
  try {
    const attendance = await Attendance.find({ session: req.params.sessionId })
      .populate('student', 'fullName email matriculationNumber')
      .populate('course', 'courseName courseCode')
      .sort({ scannedAt: 1 });

    res.status(200).json({
      totalPresent: attendance.length,
      attendance
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET ATTENDANCE BY COURSE - Lecturer and Admin
const getAttendanceByCourse = async (req, res) => {
  try {
    const attendance = await Attendance.find({ course: req.params.courseId })
      .populate('student', 'fullName email matriculationNumber')
      .populate('session', 'date startTime endTime')
      .sort({ createdAt: -1 });

    res.status(200).json({
      totalRecords: attendance.length,
      attendance
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET MY ATTENDANCE - Student only
const getMyAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.find({ student: req.user.id })
      .populate('course', 'courseName courseCode department')
      .populate('session', 'date startTime endTime venue')
      .sort({ createdAt: -1 });

    res.status(200).json({
      totalClasses: attendance.length,
      attendance
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET ATTENDANCE REPORT BY COURSE
const getAttendanceReport = async (req, res) => {
  try {
    const { courseId } = req.params;

    const sessions = await Session.find({ course: courseId });
    const totalSessions = sessions.length;

    const course = await Course.findById(courseId)
      .populate('students.student', 'fullName email matriculationNumber department');

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const report = await Promise.all(
      course.students.map(async (enrollment) => {
        const student = enrollment.student || enrollment;

        const attendanceCount = await Attendance.countDocuments({
          course: courseId,
          student: student._id
        });

        const percentage = totalSessions > 0
          ? ((attendanceCount / totalSessions) * 100).toFixed(1)
          : 0;

        const status = percentage >= 75 ? 'Good' : percentage >= 50 ? 'Average' : 'Poor';

        return {
          student: {
            id: student._id,
            fullName: student.fullName,
            email: student.email,
            matriculationNumber: student.matriculationNumber,
            department: student.department
          },
          attendanceCount,
          totalSessions,
          percentage: parseFloat(percentage),
          status
        };
      })
    );

    report.sort((a, b) => b.percentage - a.percentage);

    res.status(200).json({
      course: {
        id: course._id,
        name: course.courseName,
        code: course.courseCode,
        department: course.department
      },
      totalSessions,
      totalStudents: course.students.length,
      report
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET MY ATTENDANCE REPORT PER COURSE - Student
const getMyAttendanceReport = async (req, res) => {
  try {
    // Get all courses where student is enrolled (new data structure)
    const courses = await Course.find({ 'students.student': req.user.id });

    const report = await Promise.all(
      courses.map(async (course) => {
        const totalSessions = await Session.countDocuments({ course: course._id });
        const attendanceCount = await Attendance.countDocuments({
          course: course._id,
          student: req.user.id
        });

        const percentage = totalSessions > 0
          ? ((attendanceCount / totalSessions) * 100).toFixed(1)
          : 0;

        const status = percentage >= 75 ? 'Good' : percentage >= 50 ? 'Average' : 'Poor';

        return {
          course: {
            id: course._id,
            name: course.courseName,
            code: course.courseCode,
            department: course.department
          },
          attendanceCount,
          totalSessions,
          percentage: parseFloat(percentage),
          status
        };
      })
    );

    res.status(200).json({
      totalCourses: courses.length,
      report
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  markAttendance,
  getAttendanceBySession,
  getAttendanceByCourse,
  getMyAttendance,
  getAttendanceReport,
  getMyAttendanceReport
};
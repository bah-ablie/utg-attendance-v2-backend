const Session = require('../models/Session');
const Course = require('../models/Course');
const QRCode = require('qrcode');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');

// CREATE SESSION AND GENERATE QR CODE - Lecturer only
const createSession = async (req, res) => {
  try {
    const { course, startTime, endTime, venue, notes } = req.body;

    // Check if course exists and lecturer is assigned
    const courseExists = await Course.findById(course)
      .populate('students.student', 'fullName email');
    if (!courseExists) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if lecturer is assigned to this course
    if (courseExists.lecturer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'You are not assigned to this course' });
    }

    // Generate unique session token
    const sessionToken = crypto.randomBytes(32).toString('hex');

    // Set expiry time to 5 minutes from now
    const qrCodeExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Create session
    const session = new Session({
      course,
      lecturer: req.user.id,
      startTime,
      endTime,
      venue,
      notes,
      sessionToken,
      qrCodeExpiresAt
    });

    await session.save();

    // Generate QR code
    const qrData = JSON.stringify({
      sessionToken,
      courseId: course,
      expiresAt: qrCodeExpiresAt
    });

    const qrCode = await QRCode.toDataURL(qrData);
    session.qrCode = qrCode;
    await session.save();

    // Fire-and-forget email — does not block response
    const studentEmails = courseExists.students
      .map(s => s.student?.email || s.email)
      .filter(Boolean);

    if (studentEmails.length > 0) {
      sendEmail({
        to: studentEmails.join(','),
        subject: `Class Session Started - ${courseExists.courseName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a2e;">Class Session Started!</h2>
            <p>A new class session has started for:</p>
            <p><strong>Course:</strong> ${courseExists.courseName} (${courseExists.courseCode})</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p><strong>Start Time:</strong> ${startTime}</p>
            <p><strong>End Time:</strong> ${endTime}</p>
            ${venue ? `<p><strong>Venue:</strong> ${venue}</p>` : ''}
            <p>Please scan the QR code displayed by your lecturer to mark your attendance.</p>
            <p><strong>Note:</strong> The QR code expires in 5 minutes!</p>
            <br/>
            <p>Best regards,</p>
            <p><strong>UTG Attendance System</strong></p>
          </div>
        `
      }).then(() => {
        console.log('Session email sent successfully!');
      }).catch((emailError) => {
        console.log('Session email failed:', emailError.message);
      });
    }

    res.status(201).json({
      message: 'Session created and QR code generated successfully',
      session: {
        id: session._id,
        course: session.course,
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        venue: session.venue,
        qrCode: session.qrCode,
        sessionToken: session.sessionToken,
        qrCodeExpiresAt: session.qrCodeExpiresAt
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET ALL SESSIONS - Admin only
const getAllSessions = async (req, res) => {
  try {
    const sessions = await Session.find()
      .populate('course', 'courseName courseCode')
      .populate('lecturer', 'fullName email')
      .sort({ createdAt: -1 });

    res.status(200).json(sessions);

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET LECTURER SESSIONS
const getLecturerSessions = async (req, res) => {
  try {
    const sessions = await Session.find({ lecturer: req.user.id })
      .populate('course', 'courseName courseCode')
      .sort({ createdAt: -1 });

    res.status(200).json(sessions);

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET SINGLE SESSION
const getSessionById = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id)
      .populate('course', 'courseName courseCode')
      .populate('lecturer', 'fullName email');

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    res.status(200).json(session);

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// REGENERATE QR CODE - Lecturer only
const regenerateQR = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.lecturer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const qrCodeExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const qrData = JSON.stringify({
      sessionToken,
      courseId: session.course,
      expiresAt: qrCodeExpiresAt
    });

    const qrCode = await QRCode.toDataURL(qrData);

    session.sessionToken = sessionToken;
    session.qrCodeExpiresAt = qrCodeExpiresAt;
    session.qrCode = qrCode;
    await session.save();

    res.status(200).json({
      message: 'QR code regenerated successfully',
      session: {
        id: session._id,
        qrCode: session.qrCode,
        sessionToken: session.sessionToken,
        qrCodeExpiresAt: session.qrCodeExpiresAt
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// CLOSE SESSION - Lecturer only
const closeSession = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.lecturer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    session.isActive = false;
    await session.save();

    res.status(200).json({ message: 'Session closed successfully' });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// DELETE SESSION - Lecturer only (closed sessions only)
const deleteSession = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.lecturer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (session.isActive) {
      return res.status(400).json({ message: 'Cannot delete an active session. Close it first.' });
    }

    await Session.findByIdAndDelete(req.params.id);

    res.status(200).json({ message: 'Session deleted successfully' });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  createSession,
  getAllSessions,
  getLecturerSessions,
  getSessionById,
  regenerateQR,
  closeSession,
  deleteSession
};
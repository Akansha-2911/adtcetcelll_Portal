// controllers/adminController.js — MongoDB / Mongoose
const { User, Group, Question, Test, GroupMember, Result, Notification, Topic, StudentDocument, Setting } = require('../models');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { uploadRoot: UPLOAD_DIR, pdfDir: PDF_DIR, documentDir: DOC_DIR } = require('../utils/storagePaths');
const { parseLocalDateTime, formatDateTimeLocal } = require('../utils/dateTime');
const { extractSyllabusFromPdf } = require('../utils/syllabusImporter');
const { formatMathToText, formatMathToWordHtml, setupPdfFonts } = require('../utils/mathFormatter');

const COURSES = ['JEE', 'CET', 'NEET'];
const SUBJECTS_BY_COURSE = { JEE: ['Physics', 'Chemistry', 'Mathematics'], CET: ['Physics', 'Chemistry', 'Mathematics', 'Biology'], NEET: ['Physics', 'Chemistry', 'Biology'] };
const ALL_SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English', 'General Knowledge'];
const generatePassword = rollNo => `CET@${String(rollNo).slice(-4).padStart(4, '0')}`;

const DEFAULT_WHATSAPP_TEMPLATE = 'Dear Parent, Greetings from SPVN CET Examination Portal. This is regarding student {student_name} (Roll No: {roll_no}). Please visit our portal to view exam schedules and performance reports. Thank you!';

async function getWhatsAppTemplateValue() {
  try {
    const setting = await Setting.findOne({ key: 'whatsapp_template' }).lean();
    if (setting && setting.value) return String(setting.value);
  } catch (e) {
    console.error('Error fetching whatsapp template:', e);
  }
  return DEFAULT_WHATSAPP_TEMPLATE;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const finiteNumberOr = (value, fallback = null) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};



const loadTopics = async (course, subject) => {
  const cleanCourse = cleanHierarchyText(course);
  const cleanSubject = cleanHierarchyText(subject);

  if (!cleanSubject) return [];

  /*
   * Merge both hierarchy sources:
   * 1) Syllabus Manager Topic collection
   * 2) Actual Question Bank topic/subtopic values
   *
   * This prevents Create Test from showing only "All Topics" when
   * Question Bank rows already contain topics that are not yet in syllabus.
   */
  const syllabusQuery = {
    isActive: true,
    subject: hierarchyValuePattern(cleanSubject)
  };
  if (cleanCourse) syllabusQuery.course = cleanCourse;

  const [syllabusRows, questionRows] = await Promise.all([
    Topic.find(syllabusQuery).sort({ name: 1 }).lean(),
    Question.find({
      isActive: true,
      subject: hierarchyValuePattern(cleanSubject),
      topic: { $exists: true, $nin: [null, ''] }
    }).select('topic subtopic').lean()
  ]);

  const topicMap = new Map();

  const ensureTopic = (name, source = 'question_bank') => {
    const cleanName = cleanHierarchyText(name);
    if (!cleanName) return null;
    const key = stripUnitPrefix(cleanName).toLocaleLowerCase();
    if (!topicMap.has(key)) {
      topicMap.set(key, {
        _id: null,
        course: cleanCourse || '',
        subject: cleanSubject,
        name: cleanName,
        subtopics: [],
        isActive: true,
        source
      });
    }
    return topicMap.get(key);
  };

  // Add syllabus topics first so their official names are retained.
  syllabusRows.forEach(row => {
    const topic = ensureTopic(row.name, 'syllabus');
    if (!topic) return;
    topic._id = row._id || topic._id;
    topic.course = row.course || topic.course;
    topic.subject = row.subject || topic.subject;
    topic.source = 'syllabus';
    (row.subtopics || []).forEach(value => {
      const sub = cleanHierarchyText(value);
      if (!sub) return;
      if (!topic.subtopics.some(existing => existing.toLocaleLowerCase() === sub.toLocaleLowerCase())) {
        topic.subtopics.push(sub);
      }
    });
  });

  // Merge hierarchy that actually exists in Question Bank.
  questionRows.forEach(row => {
    const topic = ensureTopic(row.topic, 'question_bank');
    if (!topic) return;
    const sub = cleanHierarchyText(row.subtopic);
    if (!sub) return;
    if (!topic.subtopics.some(existing => existing.toLocaleLowerCase() === sub.toLocaleLowerCase())) {
      topic.subtopics.push(sub);
    }
  });

  const output = Array.from(topicMap.values());
  output.forEach(topic => topic.subtopics.sort((a, b) => a.localeCompare(b)));
  output.sort((a, b) => stripUnitPrefix(a.name).localeCompare(stripUnitPrefix(b.name)));
  return output;
};

const cleanHierarchyText = value => String(value || '').replace(/\s+/g, ' ').trim();
const stripUnitPrefix = value => cleanHierarchyText(value).replace(/^unit\s*\d+\s*[—-]\s*/i, '');

const hierarchyValuePattern = (value, { allowUnitPrefix = false } = {}) => {
  const terms = (allowUnitPrefix ? stripUnitPrefix(value) : cleanHierarchyText(value))
    .split(' ')
    .filter(Boolean);
  const expression = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const prefix = allowUnitPrefix ? '(?:unit\\s*\\d+\\s*[—-]\\s*)?' : '';
  return new RegExp(`^${prefix}${expression}$`, 'i');
};

const hierarchyWords = value => stripUnitPrefix(value)
  .toLocaleLowerCase()
  .replace(/trigonometric/g, 'trig')
  .replace(/[^a-z0-9]+/g, ' ')
  .split(' ')
  .map(word => word.replace(/ies$/, 'y').replace(/s$/, ''))
  .filter(word => word.length > 2 && !['and', 'the', 'for', 'with', 'from', 'into', 'using', 'basic', 'general', 'standard'].includes(word));

const matchesSyllabusTopic = (questionTopic, syllabusTopic) => {
  if (stripUnitPrefix(questionTopic).toLocaleLowerCase() === stripUnitPrefix(syllabusTopic.name).toLocaleLowerCase()) return true;
  const questionWords = [...new Set(hierarchyWords(questionTopic))];
  const syllabusWords = new Set(hierarchyWords([syllabusTopic.name, ...(syllabusTopic.subtopics || [])].join(' ')));
  const matches = questionWords.filter(word => syllabusWords.has(word)).length;
  return matches >= Math.min(2, questionWords.length);
};

const parseSubtopics = value => {
  const seen = new Set();
  return String(value || '').split(/\r?\n/).map(cleanHierarchyText).filter(item => {
    const key = item.toLocaleLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const mergeHierarchyText = (existing, incoming) => {
  const seen = new Set();
  return [...(existing || []), ...(incoming || [])].map(cleanHierarchyText).filter(item => {
    const key = item.toLocaleLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const isValidCourseSubject = (course, subject) => COURSES.includes(course)
  && (SUBJECTS_BY_COURSE[course] || []).includes(subject);

async function upsertSyllabusUnit({ course, subject, name, subtopics }) {
  const unitName = cleanHierarchyText(name);
  const existingRows = await Topic.find({ course, subject });
  const existing = existingRows.find(row => row.name.toLocaleLowerCase() === unitName.toLocaleLowerCase());
  if (!existing) {
    await Topic.create({ course, subject, name: unitName, subtopics, isActive: true });
    return 'created';
  }
  existing.name = unitName;
  existing.subtopics = mergeHierarchyText(existing.subtopics, subtopics);
  existing.isActive = true;
  await existing.save();
  return 'updated';
}

const completedResultStatus = { $in: ['submitted', 'auto_submitted'] };

async function resultQueryFrom(filters = {}) {
  const query = { status: completedResultStatus };
  if (filters.testId) query.testId = filters.testId;
  if (filters.groupId) {
    const memberships = await GroupMember.find(
      { groupId: filters.groupId, role: 'student' },
      'userId'
    );
    query.studentId = { $in: memberships.map(membership => membership.userId) };
  }
  return query;
}

function subjectResultValue(result, subject) {
  const data = result.subjectScores?.[subject];
  if (!data) return '';
  if (data.status === 'ABSENT') return 'ABSENT';
  return Number(data.marks || 0);
}

function safeFilenamePart(value, fallback) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const [studentCount, testCount, groupCount, questionCount, recentResults, recentUsers] = await Promise.all([
      User.countDocuments({ role: 'student', isActive: true }),
      Test.countDocuments(),
      Group.countDocuments({ isActive: true }),
      Question.countDocuments({ isActive: true }),
      Result.find().sort({ createdAt: -1 }).limit(8).populate('studentId', 'name rollNo').populate('testId', 'title'),
      User.find({ role: 'student' }).sort({ createdAt: -1 }).limit(5),
    ]);
    res.render('admin/dashboard', { title: 'Admin Dashboard', stats: { studentCount, testCount, groupCount, questionCount }, recentResults, recentUsers, COURSES });
  } catch (e) { console.error(e); req.flash('error', 'Failed.'); res.redirect('/auth/login'); }
};

// ── STUDENT MANAGEMENT ────────────────────────────────────────────────────────
exports.getStudents = async (req, res) => {
  try {
    const [students, groups, whatsappTemplate] = await Promise.all([
      User.find({ role: 'student', isActive: { $ne: false } }).sort({ rollNo: 1 }).lean(),
      Group.find({ isActive: true }).lean(),
      getWhatsAppTemplateValue(),
    ]);
    res.render('admin/students', { title: 'Manage Students', students, groups, whatsappTemplate });
  } catch (e) { req.flash('error', 'Failed.'); res.redirect('/admin/dashboard'); }
};

exports.getWhatsAppTemplate = async (req, res) => {
  try {
    const template = await getWhatsAppTemplateValue();
    return res.json({ success: true, template });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.saveWhatsAppTemplate = async (req, res) => {
  try {
    const template = String(req.body.template || '').trim();
    if (!template) {
      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(400).json({ success: false, message: 'Template text cannot be empty.' });
      }
      req.flash('error', 'Template text cannot be empty.');
      return res.redirect(req.get('Referer') || '/admin/students');
    }
    await Setting.findOneAndUpdate(
      { key: 'whatsapp_template' },
      { value: template, description: 'Default template for parent WhatsApp messages', updatedBy: req.session?.user?.id },
      { upsert: true, new: true }
    );
    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.json({ success: true, message: 'WhatsApp message template saved successfully!' });
    }
    req.flash('success', 'WhatsApp message template saved successfully!');
    return res.redirect(req.get('Referer') || '/admin/students');
  } catch (e) {
    console.error('saveWhatsAppTemplate error:', e);
    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.status(500).json({ success: false, message: e.message });
    }
    req.flash('error', 'Failed to save template: ' + e.message);
    return res.redirect(req.get('Referer') || '/admin/students');
  }
};

exports.createStudent = async (req, res) => {
  try {
    const { name, rollNo, parentContact, phone, email, classLevel, division, groupId } = req.body;
    if (!rollNo || !name) { req.flash('error', 'Name and Roll No required.'); return res.redirect('/admin/students'); }
    const exists = await User.findOne({ rollNo });
    if (exists) { req.flash('error', `Roll No ${rollNo} already exists.`); return res.redirect(req.get('Referer') || '/admin/students'); }
    const pwd = generatePassword(rollNo);
    const student = await User.create({
      name,
      rollNo,
      phone: phone || null,
      email: email || null,
      classLevel: classLevel || null,
      division: division || null,
      parentContact: parentContact || null,
      role: 'student',
      password: pwd,
      isFirstLogin: true
    });
    if (groupId) await GroupMember.create({ groupId, userId: student._id, role: 'student' });
    await Notification.create({ userId: student._id, title: 'Account Created', message: `Welcome ${name}! Roll: ${rollNo}, Password: ${pwd}`, type: 'info' });
    req.flash('success', `Student created. Password: ${pwd}`);
    res.redirect(req.get('Referer') || '/admin/students');
  } catch (e) {
    req.flash('error', e.code === 11000 ? 'Roll number already exists.' : 'Failed: ' + e.message);
    res.redirect(req.get('Referer') || '/admin/students');
  }
};

exports.bulkImportStudents = async (req, res) => {
  try {
    const groupId = req.params?.id || req.body.groupId;
    const uploadedFile = req.files?.csvFile || req.files?.excelFile;
    if (!uploadedFile) { req.flash('error', 'No file uploaded.'); return res.redirect(req.get('Referer') || '/admin/groups'); }
    const group = groupId ? await Group.findOne({ _id: groupId, isActive: { $ne: false } }) : null;
    if (groupId && !group) {
      req.flash('error', 'Selected batch is not available.');
      return res.redirect(req.get('Referer') || '/admin/groups');
    }
    const wb = xlsx.read(uploadedFile.data, { type: 'buffer' });
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    let created = 0, existing = 0, assigned = 0, skipped = 0;
    for (const row of rows) {
      const rollNo = String(row['Roll No'] || row['Roll Number'] || row.rollNo || '').trim();
      const name = String(row['Name'] || row['Student Name'] || row.name || '').trim();
      if (!rollNo || !name) { skipped++; continue; }
      const classLevel = String(row['Class'] || row['Standard'] || row.classLevel || '').trim() || null;
      const division = String(row['Division'] || row['Div'] || row['Section'] || row.division || '').trim().toUpperCase() || null;
      const parentContact = String(row['Parent Contact No'] || row['Parent Contact'] || row['Parent Phone'] || row.parentContact || '').trim() || null;
      const phone = String(row['Phone'] || row['Student Phone'] || row.phone || '').trim() || null;
      const email = String(row['Email'] || row.email || '').trim().toLowerCase() || null;

      try {
        let student = await User.findOne({ rollNo });
        if (student) {
          student.name = name;
          if (classLevel) student.classLevel = classLevel;
          if (division) student.division = division;
          if (parentContact) student.parentContact = parentContact;
          if (phone) student.phone = phone;
          if (email) student.email = email;
          await student.save();
          existing++;
        } else {
          const pwd = generatePassword(rollNo);
          student = await User.create({
            name, rollNo, parentContact, phone, email,
            classLevel, division, role: 'student', password: pwd, isFirstLogin: true
          });
          created++;
        }
        if (group) {
          await GroupMember.findOneAndUpdate(
            { groupId: group._id, userId: student._id },
            { role: 'student' },
            { upsert: true }
          );
          assigned++;
        }
      } catch { skipped++; }
    }
    let msg = `Imported ${created} new student(s).`;
    if (group) msg += ` Added ${assigned} student(s) to "${group.name}".`;
    if (existing) msg += ` ${existing} existing student(s) updated.`;
    if (skipped) msg += ` ${skipped} skipped.`;
    req.flash('success', msg);
    res.redirect(req.get('Referer') || '/admin/groups');
  } catch (e) { req.flash('error', 'Import failed: ' + e.message); res.redirect(req.get('Referer') || '/admin/groups'); }
};

// ── WHATSAPP TEMPLATE CONTROLLERS ─────────────────────────────────────────────
exports.getWhatsAppTemplate = async (req, res) => {
  try {
    const template = await getWhatsAppTemplateValue();
    res.json({ success: true, template });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

exports.updateWhatsAppTemplate = async (req, res) => {
  try {
    const template = String(req.body.template || '').trim();
    if (!template) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: 'Template text cannot be empty.' });
      }
      req.flash('error', 'Template text cannot be empty.');
      return res.redirect(req.get('Referer') || '/admin/students');
    }
    await Setting.findOneAndUpdate(
      { key: 'whatsapp_template' },
      { key: 'whatsapp_template', value: template },
      { upsert: true, new: true }
    );
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: 'WhatsApp template saved successfully!', template });
    }
    req.flash('success', 'WhatsApp template updated successfully.');
    res.redirect(req.get('Referer') || '/admin/students');
  } catch (e) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, error: e.message });
    }
    req.flash('error', 'Failed to save template: ' + e.message);
    res.redirect(req.get('Referer') || '/admin/students');
  }
};

// ── GROUPS ────────────────────────────────────────────────────────────────────
exports.getGroups = async (req, res) => {
  try {
    const [groups, students, memberships] = await Promise.all([
      Group.find({ isActive: { $ne: false } }).sort({ createdAt: -1 }),
      User.find({ role: 'student', isActive: true }).sort({ rollNo: 1 }),
      GroupMember.find().populate('userId', 'name rollNo').populate('groupId', 'name'),
    ]);
    // Attach members array to each group
    const memberMap = {};
    memberships.forEach(m => {
      const gid = m.groupId?._id?.toString();
      if (!gid) return;
      if (!memberMap[gid]) memberMap[gid] = [];
      memberMap[gid].push({ ...m.userId?.toObject(), GroupMember: { role: m.role } });
    });
    const groupsWithMembers = groups.map(g => ({
      ...g.toObject(),
      id: g._id.toString(),
      members: memberMap[g._id.toString()] || [],
    }));
    res.render('admin/groups', { title: 'Batches', groups: groupsWithMembers, students, COURSES });
  } catch (e) { req.flash('error', 'Failed.'); res.redirect('/admin/dashboard'); }
};

exports.createGroup = async (req, res) => {
  try {
    const { name, description, academicYear, course, startDate, endDate, status } = req.body;
    const group = await Group.create({ name, description, academicYear: academicYear || process.env.ACADEMIC_YEAR, course: course || null, startDate: startDate || null, endDate: endDate || null, status: status || 'active' });
    let imported = 0, skipped = 0;
    if (req.files?.csvFile) {
      const wb = xlsx.read(req.files.csvFile.data, { type: 'buffer' });
      const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      for (const row of rows) {
        try {
          const rollNo = String(row['Roll No'] || row.rollNo || '').trim();
          const sName = String(row['Name'] || row.name || '').trim();
          if (!rollNo || !sName) { skipped++; continue; }
          const pw = generatePassword(rollNo);
          let student = await User.findOne({ rollNo });
          const isNew = !student;
          if (!student) student = await User.create({ name: sName, rollNo, email: String(row['Email'] || row.email || '').trim() || null, phone: String(row['Phone'] || row.phone || '').trim() || null, parentContact: String(row['Parent Contact No'] || row.parentContact || '').trim() || null, role: 'student', password: pw, isFirstLogin: true });
          await GroupMember.findOneAndUpdate({ groupId: group._id, userId: student._id }, { role: 'student' }, { upsert: true });
          if (isNew) imported++; else skipped++;
        } catch { skipped++; }
      }
      req.flash('success', `Batch "${name}" created with ${imported} students${skipped ? ', ' + skipped + ' skipped' : ''}.`);
    } else {
      req.flash('success', `Batch "${name}" created.`);
    }
    res.redirect('/admin/groups');
  } catch (e) { req.flash('error', 'Failed. Name may already exist.'); res.redirect('/admin/groups'); }
};

exports.assignMember = async (req, res) => {
  try {
    const { groupId, userId } = req.body;
    await GroupMember.findOneAndUpdate({ groupId, userId }, { role: 'student' }, { upsert: true });
    req.flash('success', 'Member assigned.');
    res.redirect('/admin/groups');
  } catch (e) { req.flash('error', 'Failed.'); res.redirect('/admin/groups'); }
};

exports.downloadStudentTemplate = (req, res) => {
  const rows = [
    { 'Name': 'Arjun Mehta', 'Roll No': '2024CE001', 'Email': 'arjun@example.com', 'Phone': '9876543210', 'Parent Contact No': '9876543200' },
    { 'Name': 'Priya Patel', 'Roll No': '2024CE002', 'Email': 'priya@example.com', 'Phone': '9876543211', 'Parent Contact No': '9876543201' },
    { 'Name': 'Sample Student', 'Roll No': '2024CE003', 'Email': 'sample@example.com', 'Phone': '', 'Parent Contact No': '' },
  ];
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 20 }];
  xlsx.utils.book_append_sheet(wb, ws, 'Students');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=student_import_template.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

exports.exportGroupCredentials = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) { req.flash('error', 'Batch not found.'); return res.redirect('/admin/groups'); }
    const memberships = await GroupMember.find({ groupId: group._id, role: 'student' }).populate('userId', 'name rollNo parentContact');
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=credentials_${group.name.replace(/\s+/g, '_')}.pdf`);
    doc.pipe(res);
    doc.fontSize(16).font('Helvetica-Bold').text(process.env.COLLEGE_NAME || 'College', { align: 'center' });
    doc.fontSize(11).font('Helvetica').text(`Batch: ${group.name} | AY: ${group.academicYear || ''}`, { align: 'center' });
    doc.moveDown(0.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke().moveDown(0.5);
    const colX = [40, 150, 300, 420];
    doc.fontSize(9).font('Helvetica-Bold');
    ['Roll No', 'Name', 'Parent Contact', 'Password'].forEach((h, i) => doc.text(h, colX[i], doc.y, { continued: i < 3 }));
    doc.moveDown(0.4).moveTo(40, doc.y).lineTo(555, doc.y).stroke().moveDown(0.3);
    doc.font('Helvetica').fontSize(9);
    for (const m of memberships) {
      const s = m.userId;
      if (!s) continue;
      const rowY = doc.y;
      const pwd = generatePassword(s.rollNo || '');
      doc.text(s.rollNo || '', colX[0], rowY, { width: 105 });
      doc.text(s.name || '', colX[1], rowY, { width: 145 });
      doc.text(s.parentContact || '', colX[2], rowY, { width: 115 });
      doc.text(pwd, colX[3], rowY, { width: 120 });
      doc.moveDown(0.5);
      if (doc.y > 750) doc.addPage();
    }
    doc.end();
  } catch (e) { console.error(e); res.status(500).send('PDF export failed.'); }
};


// ── CONTENT HUB ───────────────────────────────────────────────────────────────
exports.getContentHub = async (req, res) => {
  try {
    const [questionCount, syllabusCount, questions, topics] = await Promise.all([
      Question.countDocuments({ isActive: true }),
      Topic.countDocuments({ isActive: true }),
      Question.find({ isActive: true }, 'subject difficulty topic subtopic createdAt').lean(),
      Topic.find({ isActive: true }, 'course subject subtopics').lean(),
    ]);

    const subjectStats = ALL_SUBJECTS.map(subject => {
      const rows = questions.filter(q => q.subject === subject);
      return {
        subject,
        total: rows.length,
        easy: rows.filter(q => q.difficulty === 'Easy').length,
        medium: rows.filter(q => q.difficulty === 'Medium').length,
        hard: rows.filter(q => q.difficulty === 'Hard').length,
      };
    }).filter(row => row.total > 0 || ['Physics', 'Chemistry', 'Mathematics', 'Biology'].includes(row.subject));

    const courseStats = COURSES.map(course => {
      const rows = topics.filter(topic => topic.course === course);
      return {
        course,
        units: rows.length,
        subtopics: rows.reduce((sum, topic) => sum + (topic.subtopics?.length || 0), 0),
        subjects: new Set(rows.map(topic => topic.subject)).size,
      };
    });

    const classified = questions.filter(q => q.topic || q.subtopic).length;
    const classificationPercent = questionCount ? Math.round((classified / questionCount) * 100) : 0;
    const recentQuestions = await Question.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(6)
      .select('question subject topic difficulty createdAt');

    res.render('admin/content', {
      title: 'Content Management', questionCount, syllabusCount, subjectStats, courseStats,
      classificationPercent, recentQuestions,
    });
  } catch (e) {
    console.error('Content hub failed:', e);
    req.flash('error', 'Unable to load content management.');
    res.redirect('/admin/dashboard');
  }
};

// ── TOPICS ────────────────────────────────────────────────────────────────────
exports.getTopics = async (req, res) => {
  try {
    const { course, subject } = req.query;
    const [topics, allTopics] = await Promise.all([
      loadTopics(course, subject),
      Topic.find({ isActive: true }, 'course subtopics'),
    ]);
    const SUBJECTS = course ? (SUBJECTS_BY_COURSE[course] || ALL_SUBJECTS) : ALL_SUBJECTS;
    const courseStats = Object.fromEntries(COURSES.map(courseName => {
      const courseTopics = allTopics.filter(topic => topic.course === courseName);
      return [courseName, {
        units: courseTopics.length,
        subtopics: courseTopics.reduce((sum, topic) => sum + (topic.subtopics?.length || 0), 0),
      }];
    }));
    res.render('admin/topics', {
      title: 'Syllabus Manager', topics, COURSES, SUBJECTS, SUBJECTS_BY_COURSE, courseStats,
      filterCourse: course || '', filterSubject: subject || '',
      aiEnabled: Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
    });
  } catch (e) { req.flash('error', 'Failed.'); res.redirect('/admin/dashboard'); }
};

exports.createTopic = async (req, res) => {
  try {
    const { name, course, subject, subtopics } = req.body;
    if (!isValidCourseSubject(course, subject)) throw new Error('Select a valid course and subject.');
    if (!cleanHierarchyText(name)) throw new Error('Unit name is required.');
    const result = await upsertSyllabusUnit({ course, subject, name, subtopics: parseSubtopics(subtopics) });
    req.flash('success', result === 'created' ? 'Syllabus unit added.' : 'Existing unit updated with the new subtopics.');
    res.redirect(`/admin/topics?course=${course}&subject=${encodeURIComponent(subject)}`);
  } catch (e) { req.flash('error', 'Failed: ' + e.message); res.redirect('/admin/topics'); }
};

exports.importSyllabusPdf = async (req, res) => {
  const course = cleanHierarchyText(req.body.course).toUpperCase();
  const subject = cleanHierarchyText(req.body.subject);
  const redirectUrl = `/admin/topics?course=${encodeURIComponent(course)}${subject ? `&subject=${encodeURIComponent(subject)}` : ''}`;
  try {
    if (!COURSES.includes(course)) throw new Error('Select a valid course.');
    if (subject && !isValidCourseSubject(course, subject)) throw new Error('Select a valid subject for this course.');
    const file = req.files?.syllabusPdf;
    if (!file) throw new Error('Choose a syllabus PDF.');
    if (Array.isArray(file)) throw new Error('Upload one syllabus PDF at a time.');
    const extension = path.extname(file.name || '').toLocaleLowerCase();
    if (extension !== '.pdf' || !['application/pdf', 'application/octet-stream'].includes(file.mimetype)) {
      throw new Error('Only PDF files are supported.');
    }
    const maxSize = parseInt(process.env.MAX_FILE_SIZE, 10) || 20 * 1024 * 1024;
    if (file.size > maxSize) throw new Error(`PDF must be below ${Math.floor(maxSize / 1024 / 1024)} MB.`);

    const extraction = await extractSyllabusFromPdf(file, {
      course,
      subject,
      adminId: req.session?.user?.id || req.user?.id || '',
    });
    if (!extraction.units.length) throw new Error('No valid syllabus units were detected. Review the PDF and try again.');

    let created = 0;
    let updated = 0;
    for (const unit of extraction.units) {
      const result = await upsertSyllabusUnit({
        course,
        subject: unit.subject,
        name: unit.unitName,
        subtopics: unit.subtopics,
      });
      if (result === 'created') created += 1;
      else updated += 1;
    }

    let message = `Syllabus imported: ${created} unit(s) added and ${updated} unit(s) updated using ${extraction.model}.`;
    if (extraction.warnings.length) message += ` ${extraction.warnings.length} warning(s) need review.`;
    req.flash('success', message);
    res.redirect(redirectUrl);
  } catch (e) {
    console.error('Syllabus PDF import failed:', e);
    req.flash('error', 'Syllabus import failed: ' + e.message);
    res.redirect(COURSES.includes(course) ? redirectUrl : '/admin/topics');
  }
};

exports.updateTopic = async (req, res) => {
  try {
    const { name, subtopics } = req.body;
    if (!cleanHierarchyText(name)) throw new Error('Unit name is required.');
    await Topic.findByIdAndUpdate(req.params.id, { name: cleanHierarchyText(name), subtopics: parseSubtopics(subtopics) });
    req.flash('success', 'Syllabus unit updated.');
    res.redirect('/admin/topics');
  } catch (e) { req.flash('error', 'Failed: ' + e.message); res.redirect('/admin/topics'); }
};

exports.deleteTopic = async (req, res) => {
  try {
    await Topic.findByIdAndUpdate(req.params.id, { isActive: false });
    req.flash('success', 'Syllabus unit deleted.');
    res.redirect('/admin/topics');
  } catch (e) { req.flash('error', 'Failed.'); res.redirect('/admin/topics'); }
};

exports.getSubjectsForCourse = (req, res) => res.json(SUBJECTS_BY_COURSE[req.params.course] || ALL_SUBJECTS);

exports.getTopicsForSubject = async (req, res) => {
  try {
    const course = cleanHierarchyText(req.query.course);
    const subject = cleanHierarchyText(req.query.subject);

    if (!subject) {
      return res.json([]);
    }

    /*
     * Validate subject only when a known course is supplied.
     */
    if (course && COURSES.includes(course)) {
      const allowedSubjects = SUBJECTS_BY_COURSE[course] || [];

      if (!allowedSubjects.includes(subject)) {
        return res.json([]);
      }
    }

    const topics = await loadTopics(course, subject);

    return res.json(
      topics.map(topic => ({
        id: topic._id ? String(topic._id) : null,
        name: cleanHierarchyText(topic.name),
        subject: cleanHierarchyText(topic.subject || subject),
        course: cleanHierarchyText(topic.course || course),
        subtopics: Array.isArray(topic.subtopics)
          ? topic.subtopics.map(cleanHierarchyText).filter(Boolean)
          : [],
        source: topic.source || 'syllabus'
      }))
    );

  } catch (error) {
    console.error('Load hierarchy topics failed:', error);

    return res.json([]);
  }
};

exports.getSubtopicsForTopic = async (req, res) => {
  try {
    const course = cleanHierarchyText(req.query.course);
    const subject = cleanHierarchyText(req.query.subject);
    const topic = cleanHierarchyText(req.query.topic);

    if (!subject || !topic) {
      return res.json([]);
    }

    /*
     * =========================================================
     * FIRST:
     * use loadTopics(), because it already supports:
     *
     * Syllabus Manager
     *        OR
     * Question Bank fallback
     * =========================================================
     */

    const topics = await loadTopics(course, subject);

    const selectedTopic = topics.find(row => {
      return (
        stripUnitPrefix(row.name).toLocaleLowerCase() ===
        stripUnitPrefix(topic).toLocaleLowerCase()
      );
    });

    if (
      selectedTopic &&
      Array.isArray(selectedTopic.subtopics) &&
      selectedTopic.subtopics.length
    ) {
      return res.json(
        [...new Set(
          selectedTopic.subtopics
            .map(cleanHierarchyText)
            .filter(Boolean)
        )].sort((a, b) => a.localeCompare(b))
      );
    }

    /*
     * =========================================================
     * SECOND FALLBACK:
     * Direct query against Question Bank.
     *
     * This also handles slightly inconsistent topic naming.
     * =========================================================
     */

    const subjectPattern = hierarchyValuePattern(subject);

    const questions = await Question.find({
      isActive: true,
      subject: subjectPattern,

      subtopic: {
        $exists: true,
        $nin: [null, '']
      }
    })
      .select('topic subtopic')
      .lean();

    const matchingQuestions = questions.filter(question => {
      const questionTopic = cleanHierarchyText(question.topic);

      if (!questionTopic) {
        return false;
      }

      /*
       * Exact comparison after removing "Unit X -".
       */
      if (
        stripUnitPrefix(questionTopic).toLocaleLowerCase() ===
        stripUnitPrefix(topic).toLocaleLowerCase()
      ) {
        return true;
      }

      /*
       * Flexible hierarchy comparison.
       */
      return matchesSyllabusTopic(questionTopic, {
        name: topic,
        subtopics: []
      });
    });

    const seen = new Set();
    const subtopics = [];

    matchingQuestions.forEach(question => {
      const value = cleanHierarchyText(question.subtopic);

      if (!value) {
        return;
      }

      const key = value.toLocaleLowerCase();

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      subtopics.push(value);
    });

    subtopics.sort((a, b) => a.localeCompare(b));

    return res.json(subtopics);

  } catch (error) {
    console.error('Load hierarchy subtopics failed:', error);

    return res.json([]);
  }
};

// ── QUESTIONS ─────────────────────────────────────────────────────────────────
exports.getQuestions = async (req, res) => {
  try {
    const { subject, topic, subtopic, difficulty, course, search = '', sort = 'subject', page = 1 } = req.query;
    const limit = 25, skip = (page - 1) * limit;
    const q = { isActive: true };
    if (subject) q.subject = hierarchyValuePattern(subject);
    if (difficulty) q.difficulty = difficulty;
    if (search) {
      const searchRegex = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      q.$or = [
        { question: searchRegex }, { subject: searchRegex }, { topic: searchRegex },
        { subtopic: searchRegex }, { explanation: searchRegex },
      ];
    }
    const sortMap = {
      difficulty: { difficulty: 1, subject: 1 },
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      subject: { subject: 1, topic: 1, subtopic: 1, difficulty: 1, createdAt: -1 },
    };
    const topicRows = subject ? await loadTopics(course, subject) : [];
    const selectedTopic = topicRows.find(row => stripUnitPrefix(row.name).toLocaleLowerCase() === stripUnitPrefix(topic).toLocaleLowerCase());
    let questions, total;
    if (selectedTopic) {
      const candidates = await Question.find(q).sort(sortMap[sort] || sortMap.subject);
      const topicMatches = candidates.filter(question => matchesSyllabusTopic(question.topic, selectedTopic));
      const subtopicMatches = subtopic
        ? topicMatches.filter(question => hierarchyValuePattern(subtopic).test(question.subtopic || ''))
        : topicMatches;
      const filteredQuestions = subtopicMatches.length || !subtopic ? subtopicMatches : topicMatches;
      total = filteredQuestions.length;
      questions = filteredQuestions.slice(skip, skip + limit);
    } else {
      const topicQuery = { ...q };
      if (topic) topicQuery.topic = hierarchyValuePattern(topic, { allowUnitPrefix: true });
      if (subtopic) topicQuery.subtopic = hierarchyValuePattern(subtopic);
      [questions, total] = await Promise.all([
        Question.find(topicQuery).sort(sortMap[sort] || sortMap.subject).skip(skip).limit(limit),
        Question.countDocuments(topicQuery),
      ]);
    }
    const subtopicList = selectedTopic?.subtopics || [];
    res.render('admin/questions', {
      title: 'Question Bank', questions, total,
      currentPage: parseInt(page), totalPages: Math.ceil(total / limit),
      filters: { subject, topic, subtopic, difficulty, course, search, sort },
      COURSES, SUBJECTS: ALL_SUBJECTS, topicRows, subtopicList,
    });
  } catch (e) { req.flash('error', 'Failed.'); res.redirect('/admin/dashboard'); }
};

exports.createQuestion = async (req, res) => {
  try {
    const { question, optionA, optionB, optionC, optionD, correctAnswer, subject, topic, subtopic, difficulty, marks, explanation, questionImageUrl } = req.body;
    let questionImage = questionImageUrl || null;
    if (req.files?.questionImage) {
      const { processQuestionImage } = require('../utils/imageUpload');
      questionImage = await processQuestionImage(req.files.questionImage, `q_${Date.now()}`);
    }
    await Question.create({ question, optionA, optionB, optionC, optionD, correctAnswer, subject, topic: topic || null, subtopic: subtopic || null, difficulty, marks: parseFloat(marks) || 1, explanation: explanation || null, questionImage, createdBy: req.session.user.id });
    req.flash('success', 'Question added.');
    res.redirect(`/admin/questions?subject=${encodeURIComponent(subject || '')}&topic=${encodeURIComponent(topic || '')}`);
  } catch (e) { req.flash('error', 'Failed: ' + e.message); res.redirect('/admin/questions'); }
};

exports.getEditQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question || !question.isActive) {
      req.flash('error', 'Question not found.');
      return res.redirect('/admin/questions');
    }
    const topicRows = await loadTopics('', question.subject);
    const matchedTopic = topicRows.find(row => stripUnitPrefix(row.name).toLocaleLowerCase() === stripUnitPrefix(question.topic).toLocaleLowerCase());
    res.render('admin/question-edit', {
      title: 'Edit Question', question, COURSES, SUBJECTS: ALL_SUBJECTS,
      topicRows, subtopicList: matchedTopic?.subtopics || [],
    });
  } catch (e) {
    req.flash('error', 'Unable to open question.');
    res.redirect('/admin/questions');
  }
};

exports.updateQuestion = async (req, res) => {
  try {
    const current = await Question.findById(req.params.id);
    if (!current || !current.isActive) throw new Error('Question not found.');
    const { question, optionA, optionB, optionC, optionD, correctAnswer, subject, topic, subtopic, difficulty, marks, explanation, questionImageUrl } = req.body;
    if (![question, optionA, optionB, optionC, optionD, correctAnswer, subject].every(Boolean)) throw new Error('Complete all required fields.');

    let questionImage = questionImageUrl || current.questionImage || null;
    if (req.files?.questionImage) {
      const { processQuestionImage } = require('../utils/imageUpload');
      questionImage = await processQuestionImage(req.files.questionImage, `q_${Date.now()}`);
    }

    Object.assign(current, {
      question: cleanHierarchyText(question), optionA: cleanHierarchyText(optionA), optionB: cleanHierarchyText(optionB),
      optionC: cleanHierarchyText(optionC), optionD: cleanHierarchyText(optionD), correctAnswer, subject,
      topic: cleanHierarchyText(topic) || null, subtopic: cleanHierarchyText(subtopic) || null,
      difficulty: difficulty || 'Medium', marks: parseFloat(marks) || 1,
      explanation: cleanHierarchyText(explanation) || null, questionImage,
    });
    await current.save();
    req.flash('success', 'Question updated successfully.');
    res.redirect(`/admin/questions?subject=${encodeURIComponent(subject)}`);
  } catch (e) {
    req.flash('error', 'Update failed: ' + e.message);
    res.redirect(`/admin/questions/${req.params.id}/edit`);
  }
};

exports.bulkImportQuestions = async (req, res) => {
  try {
    if (!req.files?.csvFile) { req.flash('error', 'No file uploaded.'); return res.redirect('/admin/questions'); }
    const wb = xlsx.read(req.files.csvFile.data, { type: 'buffer' });
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    let created = 0;
    for (const row of rows) {
      try {
        await Question.create({
          question: row.question || row.Question, optionA: row.optionA || row['Option A'],
          optionB: row.optionB || row['Option B'], optionC: row.optionC || row['Option C'], optionD: row.optionD || row['Option D'],
          correctAnswer: (row.correctAnswer || 'A').toUpperCase(), subject: row.subject || 'Physics',
          difficulty: row.difficulty || 'Medium', marks: parseFloat(row.marks || 1),
          topic: row.topic || null, subtopic: row.subtopic || null, explanation: row.explanation || null,
          questionImage: row.questionImageUrl || row.questionImage || row['Image URL'] || row['Question Image URL'] || null,
          createdBy: req.session.user.id,
        });
        created++;
      } catch { }
    }
    req.flash('success', `${created} questions imported.`);
    res.redirect('/admin/questions');
  } catch (e) { req.flash('error', 'Import failed.'); res.redirect('/admin/questions'); }
};

exports.deleteQuestion = async (req, res) => {
  try {
    await Question.findByIdAndUpdate(req.params.id, { isActive: false });
    req.flash('success', 'Question removed.');
    res.redirect('/admin/questions');
  } catch (e) { req.flash('error', 'Failed.'); res.redirect('/admin/questions'); }
};

// ── TESTS ─────────────────────────────────────────────────────────────────────
exports.getTests = async (req, res) => {
  try {
    const { subject, course, view } = req.query;
    const q = { isActive: { $ne: false } };
    if (subject) q.subject = subject;
    if (course) q.course = course;
    const tests = await Test.find(q).populate('groups', 'name').sort({ createdAt: -1 });
    res.render('admin/tests', {
      title: view === 'online' ? 'Online Tests' : 'Question Papers',
      tests, COURSES, SUBJECTS: ALL_SUBJECTS,
      filterSubject: subject || '', filterCourse: course || '', view: view || 'papers'
    });
  } catch (e) { req.flash('error', 'Failed.'); res.redirect('/admin/dashboard'); }
};


const validateTestForPublish = test => {
  const issues = [];
  if (!test.title || !String(test.title).trim()) issues.push('Test name is required.');
  if (!test.noTimeLimit && (!Number(test.duration) || Number(test.duration) <= 0)) issues.push('A valid duration is required.');
  if (!Array.isArray(test.questions) || !test.questions.length) issues.push('Add at least one question.');
  if (!Array.isArray(test.questionSettings) || test.questionSettings.length !== (test.questions || []).length) issues.push('Save the marking scheme for all questions before publishing.');
  if (!Array.isArray(test.groups) || !test.groups.length) issues.push('Select at least one batch before publishing.');
  const questions = Array.isArray(test.questions) ? test.questions : [];
  questions.forEach((q, index) => {
    if (!q) return issues.push(`Question ${index + 1} is missing.`);
    if (!q.question || !String(q.question).trim()) issues.push(`Question ${index + 1} has no question text.`);
    if (q.questionType !== 'Numerical Answer') {
      if (![q.optionA, q.optionB, q.optionC, q.optionD].every(v => v && String(v).trim())) issues.push(`Question ${index + 1} has incomplete options.`);
      if (!['A', 'B', 'C', 'D'].includes(q.correctAnswer)) issues.push(`Question ${index + 1} has no valid answer key.`);
    }
  });
  if (test.startTime && test.endTime && new Date(test.endTime) <= new Date(test.startTime)) issues.push('End time must be after start time.');
  return [...new Set(issues)];
};

exports.getTestWorkflow = async (req, res) => {
  try {
    const allowedSubjects = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
    const tests = await Test.find({
      isActive: { $ne: false },
      status: 'draft',
      creationMode: { $ne: 'combined' },
      subject: { $size: 1, $in: allowedSubjects }
    })
      .select('title subject course questions totalMarks status createdAt creationMode testType')
      .sort({ createdAt: -1 })
      .lean();

    res.render('admin/test-workflow', {
      title: 'Tests',
      tests,
      allowedSubjects
    });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Unable to open test workflow.');
    res.redirect('/admin/tests');
  }
};

exports.combineTests = async (req, res) => {
  try {
    const allowedSubjects = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
    const raw = req.body.testIds;
    const ids = Array.isArray(raw) ? raw : (raw ? [raw] : []);

    if (!ids.length) {
      throw new Error('Select at least one Draft test.');
    }

    const parts = await Test.find({
      _id: { $in: ids },
      isActive: { $ne: false },
      status: 'draft',
      creationMode: { $ne: 'combined' }
    }).populate('questions');

    if (parts.length !== ids.length) {
      throw new Error('One or more selected Draft tests are unavailable.');
    }

    for (const part of parts) {
      const subjects = Array.isArray(part.subject) ? part.subject.filter(Boolean) : [];
      if (subjects.length !== 1 || !allowedSubjects.includes(subjects[0])) {
        throw new Error(`"${part.title}" is not an eligible single-subject Draft test.`);
      }
      if (!Array.isArray(part.questions) || !part.questions.length) {
        throw new Error(`"${part.title}" contains no questions.`);
      }
    }

    // Combine one, two or any number of selected Draft papers into one publishable test.
    // Duplicate questions are included only once. Marking settings are copied from the
    // source Draft where available so the teacher can go straight to Test Details.
    const seen = new Set();
    const questions = [];
    const questionSettings = [];

    for (const part of parts) {
      const sourceSettings = new Map(
        (part.questionSettings || []).map(row => [String(row.questionId), row])
      );

      for (const question of (part.questions || [])) {
        const key = String(question._id);
        if (seen.has(key)) continue;
        seen.add(key);
        questions.push(question._id);

        const source = sourceSettings.get(key);
        questionSettings.push({
          questionId: question._id,
          positiveMarks: Math.max(0, Number(source?.positiveMarks ?? question.marks ?? 1)),
          negativeMarks: Math.max(0, Number(source?.negativeMarks ?? question.negativeMarks ?? part.negativeMarking ?? 0)),
          partialMarks: Math.max(0, Number(source?.partialMarks ?? 0)),
          bonusMark: Math.max(0, Number(source?.bonusMark ?? 0)),
          questionSubtype: String(source?.questionSubtype || 'Single Selection'),
          answerKey: ['A', 'B', 'C', 'D'].includes(source?.answerKey)
            ? source.answerKey
            : (['A', 'B', 'C', 'D'].includes(question.correctAnswer) ? question.correctAnswer : 'A')
        });
      }
    }

    if (!questions.length) {
      throw new Error('Selected Draft tests contain no questions.');
    }

    const subjects = [...new Set(parts.flatMap(test => test.subject || []).filter(Boolean))];
    const courses = [...new Set(parts.flatMap(test => test.course || []).filter(Boolean))];
    const totalMarks = questionSettings.reduce(
      (sum, row) => sum + Number(row.positiveMarks || 0) + Number(row.bonusMark || 0),
      0
    );

    const requestedTitle = String(req.body.title || '').trim();
    const automaticTitle = parts.length === 1
      ? String(parts[0].title || 'Combined Test')
      : `${subjects.join(' + ') || 'Combined'} Test`;

    const test = await Test.create({
      title: requestedTitle || automaticTitle,
      description: `Prepared from ${parts.length} Draft test${parts.length === 1 ? '' : 's'}: ${parts.map(test => test.title).join(', ')}`,
      duration: Math.max(...parts.map(test => Number(test.duration) || 0), 180),
      totalMarks,
      negativeMarking: Number(parts[0].negativeMarking || 0),
      status: 'draft',
      createdBy: req.session.user.id,
      course: courses,
      subject: subjects,
      testType: 'Mock Test',
      testPattern: 'CET',
      creationMode: 'combined',
      combinedFrom: parts.map(test => test._id),
      questions,
      questionSettings,
      groups: [],
      publishedAt: null,
      lastSavedAt: new Date()
    });

    req.flash(
      'success',
      `${parts.length} Draft test${parts.length === 1 ? '' : 's'} selected successfully. Complete Test Details and publish.`
    );
    return res.redirect(`/admin/tests/${test._id}/publish-setup`);
  } catch (e) {
    console.error('Combine Test failed:', e);
    req.flash('error', e.message);
    return res.redirect('/admin/tests/combine');
  }
};

exports.getCombineTest = async (req, res) => {
  try {
    const allowedSubjects = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
    const tests = await Test.find({
      isActive: { $ne: false },
      status: 'draft',
      creationMode: { $ne: 'combined' },
      subject: { $size: 1, $in: allowedSubjects }
    }).select('title subject course questions totalMarks createdAt creationMode').sort({ createdAt: -1 }).lean();
    res.render('admin/combine-test', { title: 'Combine Test', tests });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Unable to open Combine Test.');
    res.redirect('/admin/tests');
  }
};

exports.getPublishSetup = async (req, res) => {
  try {
    const [test, groups] = await Promise.all([
      Test.findById(req.params.id).populate('questions').populate('groups', 'name course'),
      Group.find({ isActive: { $ne: false } }).sort({ name: 1 })
    ]);
    if (!test) { req.flash('error', 'Test not found.'); return res.redirect('/admin/tests'); }
    if (test.status !== 'draft') {
      req.flash('error', 'Only Draft tests can be opened in Test Details before publishing.');
      return res.redirect(`/admin/tests/${test._id}`);
    }
    res.render('admin/publish-test-setup', { title: 'Test Details', test, groups, COURSES, SUBJECTS: ALL_SUBJECTS });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Unable to open publish setup.');
    res.redirect('/admin/tests');
  }
};

exports.publishDraftTest = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id).populate('questions');
    if (!test) { req.flash('error', 'Test not found.'); return res.redirect('/admin/tests'); }
    if (test.status !== 'draft') throw new Error('Only Draft tests can be published from this flow.');

    const groupIds = Array.isArray(req.body.groupIds) ? req.body.groupIds : (req.body.groupIds ? [req.body.groupIds] : []);
    const courses = Array.isArray(req.body.courses) ? req.body.courses : (req.body.courses ? [req.body.courses] : []);
    const subjects = Array.isArray(req.body.subjects) ? req.body.subjects : (req.body.subjects ? [req.body.subjects] : test.subject || []);
    const startTime = parseLocalDateTime(req.body.startTime);
    const endTime = parseLocalDateTime(req.body.endTime);
    if (startTime && endTime && endTime <= startTime) throw new Error('Test end time must be after start time.');

    test.title = String(req.body.title || test.title || 'Mock Test').trim();
    test.description = String(req.body.description || '').trim() || null;
    test.duration = Math.max(1, parseInt(req.body.duration, 10) || 180);
    test.noTimeLimit = req.body.noTimeLimit === 'on';
    test.startTime = startTime;
    test.endTime = endTime;
    test.course = courses;
    test.subject = subjects;
    test.groups = groupIds;
    test.testType = String(req.body.testType || 'Mock Test');
    test.testPattern = String(req.body.testPattern || 'BASIC');
    test.rankSchema = String(req.body.rankSchema || 'Scheme 1');
    test.testPassword = String(req.body.testPassword || '').trim() || null;
    test.instructions = String(req.body.instructions || '').trim() || null;
    test.shuffleQuestions = req.body.shuffleQuestions === 'on';
    test.shuffleOptions = req.body.shuffleOptions === 'on';
    test.hideImmediateResults = req.body.hideImmediateResults === 'on';
    test.fixedTime = req.body.fixedTime === 'on';
    test.notifyStudents = req.body.notifyStudents === 'on';
    test.lastSavedAt = new Date();

    const issues = validateTestForPublish(test);
    if (issues.length) {
      test.validationWarnings = issues;
      await test.save();
      req.flash('error', `Publishing blocked: ${issues.slice(0, 5).join(' | ')}`);
      return res.redirect(`/admin/tests/${test._id}/publish-setup`);
    }

    const scheduled = startTime && startTime > new Date();
    test.status = scheduled ? 'scheduled' : 'published';
    test.publishedAt = new Date();
    test.validationWarnings = [];
    await test.save();

    if (test.notifyStudents && groupIds.length) {
      const memberships = await GroupMember.find({ groupId: { $in: groupIds }, role: 'student' });
      const userIds = [...new Set(memberships.map(m => String(m.userId)).filter(Boolean))];
      await Promise.all(userIds.map(userId => Notification.create({
        userId,
        title: 'New Test Available',
        message: `"${test.title}" is now available in your student portal.`,
        type: 'exam',
        link: '/student/tests'
      })));
    }

    req.flash('success', scheduled ? 'Test scheduled successfully. Assigned students were notified.' : 'Test published successfully. Assigned students were notified.');
    return res.redirect('/admin/tests');
  } catch (e) {
    console.error('Publish Draft test failed:', e);
    req.flash('error', 'Publish failed: ' + e.message);
    return res.redirect(`/admin/tests/${req.params.id}/publish-setup`);
  }
};

exports.getCreateTest = async (req, res) => {
  try {
    const { subject, course } = req.query;
    // IMPORTANT: do not load the full Question Bank here. Large banks (7k+ rows)
    // freeze the browser when rendered into one page. Questions are loaded through
    // getTestQuestionsAjax below in small server-side pages.
    const [groups, topics] = await Promise.all([
      Group.find({ isActive: true }).sort({ name: 1 }),
      loadTopics(course, subject),
    ]);

    res.render('admin/create-test', {
      title: 'Create Test',
      groups,
      questions: [],
      COURSES,
      SUBJECTS: ALL_SUBJECTS,
      topics,
      filterSubject: subject || '',
      filterCourse: course || '',
      aiEnabled: Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY)
    });
  } catch (e) {
    console.error('Create test page failed:', e);
    req.flash('error', 'Failed to open Create Test.');
    res.redirect('/admin/tests');
  }
};

// Server-side question loader for Create Test.
// Keeps the browser fast even when Question Bank contains thousands of questions.
exports.getTestQuestionsAjax = async (req, res) => {
  try {
    const course = cleanHierarchyText(req.query.course);
    const subject = cleanHierarchyText(req.query.subject);
    const topic = cleanHierarchyText(req.query.topic);
    const subtopic = cleanHierarchyText(req.query.subtopic);
    const difficulty = cleanHierarchyText(req.query.difficulty);
    const search = cleanHierarchyText(req.query.search);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const query = { isActive: true };
    if (subject) query.subject = hierarchyValuePattern(subject);
    if (difficulty && ['Easy', 'Medium', 'Hard'].includes(difficulty)) query.difficulty = difficulty;
    if (topic) query.topic = hierarchyValuePattern(topic, { allowUnitPrefix: true });
    if (subtopic) query.subtopic = hierarchyValuePattern(subtopic);
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      query.$or = [
        { question: rx },
        { topic: rx },
        { subtopic: rx },
        { explanation: rx },
      ];
    }

    // Course is represented through the syllabus hierarchy in the current Question model.
    // Validate the selected subject belongs to that course without adding a non-existent
    // Question.course filter.
    if (course && subject && COURSES.includes(course)) {
      const allowed = SUBJECTS_BY_COURSE[course] || [];
      if (!allowed.includes(subject)) {
        return res.json({ questions: [], total: 0, page: 1, totalPages: 0, limit });
      }
    }

    const [rows, total] = await Promise.all([
      Question.find(query)
        .select('_id question subject topic subtopic difficulty marks questionType questionImage')
        .sort({ subject: 1, topic: 1, subtopic: 1, difficulty: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Question.countDocuments(query),
    ]);

    return res.json({
      questions: rows.map(row => ({
        id: String(row._id),
        question: row.question || '',
        subject: row.subject || '',
        topic: row.topic || '',
        subtopic: row.subtopic || '',
        difficulty: row.difficulty || 'Medium',
        marks: Number(row.marks || 1),
        questionType: row.questionType || 'SINGLE_CORRECT',
        hasImage: Boolean(row.questionImage),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    });
  } catch (e) {
    console.error('Create-test question AJAX failed:', e);
    return res.status(500).json({ questions: [], total: 0, page: 1, totalPages: 0, error: 'Unable to load questions.' });
  }
};

exports.createTest = async (req, res) => {
  try {
    const raw = req.body.questionIds;
    const selectedQIds = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    if (!selectedQIds.length) {
      req.flash('error', 'Select at least one question from the Question Bank.');
      return res.redirect('/admin/tests/create');
    }

    const questionsData = await Question.find({ _id: { $in: selectedQIds }, isActive: { $ne: false } });
    if (questionsData.length !== selectedQIds.length) {
      throw new Error('One or more selected questions are unavailable.');
    }

    const subjects = [...new Set(questionsData.map(q => q.subject).filter(Boolean))];
    const title = String(req.body.title || '').trim() || `Draft Test ${new Date().toLocaleDateString('en-IN')}`;
    const totalMarks = questionsData.reduce((sum, q) => sum + Number(q.marks || 1), 0);

    const test = await Test.create({
      title,
      description: 'Created from Question Bank. Test details will be completed only when publishing.',
      duration: 180,
      totalMarks,
      negativeMarking: 0,
      passingMarks: null,
      shuffleQuestions: true,
      shuffleOptions: false,
      status: 'draft',
      createdBy: req.session.user.id,
      course: [],
      subject: subjects,
      topic: null,
      subtopic: null,
      marksPerQuestion: 1,
      noTimeLimit: false,
      testType: 'Mock Test',
      testPattern: 'BASIC',
      rankSchema: 'Scheme 1',
      creationMode: 'builder',
      publishedAt: null,
      questions: selectedQIds,
      groups: [],
      notifyStudents: true,
      lastSavedAt: new Date()
    });

    req.flash('success', 'Questions selected. Configure the marking scheme, then save this test as Draft.');
    return res.redirect(`/admin/tests/${test._id}/marking-template`);
  } catch (e) {
    console.error('Create Draft test failed:', e);
    req.flash('error', 'Failed: ' + e.message);
    return res.redirect('/admin/tests/create');
  }
};

exports.getTestDetail = async (req, res) => {
  try {
    const [test, results, groups] = await Promise.all([
      Test.findById(req.params.id).populate('questions').populate('groups', 'name course'),
      Result.find({ testId: req.params.id, status: { $in: ['submitted', 'auto_submitted'] } })
        .populate('studentId', 'name rollNo').sort({ score: -1 }),
      Group.find({ isActive: { $ne: false } }).sort({ name: 1 }),
    ]);
    if (!test) { req.flash('error', 'Not found.'); return res.redirect('/admin/tests'); }
    res.render('admin/test-detail', { title: test.title, test, results, groups });
  } catch (e) { req.flash('error', 'Failed.'); res.redirect('/admin/tests'); }
};

exports.publishTest = async (req, res) => {
  try {
    const test = await Test.findOne({ _id: req.params.id, isActive: { $ne: false } }).populate('questions');
    if (!test) { req.flash('error', 'Not found.'); return res.redirect('/admin/tests'); }
    if (test.status === 'draft') { req.flash('error', 'Complete Test Details before publishing a Draft.'); return res.redirect(`/admin/tests/${test._id}/publish-setup`); }
    const issues = validateTestForPublish(test);
    if (issues.length) {
      await Test.findByIdAndUpdate(test._id, { validationWarnings: issues, status: 'draft', lastSavedAt: new Date() });
      req.flash('error', `Publishing blocked: ${issues.slice(0, 4).join(' | ')}${issues.length > 4 ? ' | …' : ''}`);
      return res.redirect(`/admin/tests/${test._id}`);
    }
    const scheduled = test.startTime && new Date(test.startTime) > new Date();
    const status = scheduled ? 'scheduled' : 'published';
    await Test.findByIdAndUpdate(test._id, { status, publishedAt: new Date(), validationWarnings: [], lastSavedAt: new Date() });
    const memberships = await GroupMember.find({ groupId: { $in: test.groups }, role: 'student' });
    await Promise.all(memberships.map(m => Notification.create({ userId: m.userId, title: 'New Exam Published', message: `"${test.title}" is now available. Duration: ${test.duration} mins.`, type: 'exam', link: '/student/tests' })));
    req.flash('success', scheduled ? 'Test validated and scheduled successfully.' : 'Test validated, published and students notified!');
    res.redirect(`/admin/tests/${test._id}`);
  } catch (e) { req.flash('error', 'Publish failed: ' + e.message); res.redirect('/admin/tests'); }
};


exports.getMarkingTemplate = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id).populate('questions');
    if (!test) { req.flash('error', 'Test not found.'); return res.redirect('/admin/tests'); }
    const settingMap = new Map((test.questionSettings || []).map(row => [String(row.questionId), row]));
    res.render('admin/marking-template', { title: 'Marking Template', test, settingMap });
  } catch (e) { req.flash('error', 'Unable to open marking template.'); res.redirect('/admin/tests'); }
};

exports.updateMarkingTemplate = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id).populate('questions');
    if (!test) { req.flash('error', 'Test not found.'); return res.redirect('/admin/tests'); }
    const body = req.body || {};
    const settings = test.questions.map(question => {
      const key = String(question._id);
      const positiveMarks = Math.max(0, Number(body[`positive_${key}`] ?? question.marks ?? 1));
      const negativeMarks = Math.max(0, Number(body[`negative_${key}`] ?? question.negativeMarks ?? test.negativeMarking ?? 0));
      const partialMarks = Math.max(0, Number(body[`partial_${key}`] ?? 0));
      const bonusMark = Math.max(0, Number(body[`bonus_${key}`] ?? 0));
      const answerKey = ['A', 'B', 'C', 'D'].includes(body[`answer_${key}`]) ? body[`answer_${key}`] : question.correctAnswer;
      const questionSubtype = String(body[`subtype_${key}`] || 'Single Selection');
      return { questionId: question._id, positiveMarks, negativeMarks, partialMarks, bonusMark, answerKey, questionSubtype };
    });
    const totalMarks = settings.reduce((sum, row) => sum + row.positiveMarks + row.bonusMark, 0);
    await Test.findByIdAndUpdate(test._id, { questionSettings: settings, totalMarks });
    req.flash('success', 'Marking scheme saved. Test is now stored as Draft. Publish it later from the Tests section when you are ready.');
    res.redirect('/admin/tests');
  } catch (e) { req.flash('error', 'Unable to save marking template: ' + e.message); res.redirect(`/admin/tests/${req.params.id}/marking-template`); }
};

exports.assignTestBatches = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.groupIds) ? req.body.groupIds : (req.body.groupIds ? [req.body.groupIds] : []);
    const test = await Test.findByIdAndUpdate(req.params.id, { groups: ids, notifyStudents: req.body.notifyStudents === 'on' }, { new: true });
    if (!test) { req.flash('error', 'Test not found.'); return res.redirect('/admin/tests'); }
    if (test.status === 'draft') { req.flash('error', 'Assign batches while completing Test Details before publishing.'); return res.redirect(`/admin/tests/${test._id}/publish-setup`); }
    if (test.notifyStudents && ids.length) {
      const memberships = await GroupMember.find({ groupId: { $in: ids }, role: 'student' });
      const uniqueUsers = [...new Set(memberships.map(m => String(m.userId)))];
      await Promise.all(uniqueUsers.map(userId => Notification.create({ userId, title: 'Test Assigned', message: `"${test.title}" has been assigned to your batch.`, type: 'exam', link: '/student/tests' })));
    }
    req.flash('success', `Test assigned to ${ids.length} batch(es).`);
    res.redirect(`/admin/tests/${test._id}`);
  } catch (e) { req.flash('error', 'Unable to assign batches.'); res.redirect(`/admin/tests/${req.params.id}`); }
};

// ── RESULTS ───────────────────────────────────────────────────────────────────

async function detectBatchSubjectMode(groupId, testId, results = []) {
  let isPcm = false;
  let isPcb = false;

  let groupDoc = null;
  if (groupId) {
    try {
      groupDoc = await Group.findById(groupId).select('name description').lean();
    } catch (_) {}
  }
  const groupName = ((groupDoc?.name || '') + ' ' + (groupDoc?.description || '')).toUpperCase();
  if (groupName.includes('PCMB')) {
    isPcm = true;
    isPcb = true;
  } else if (groupName.includes('PCB') || groupName.includes('BIOLOGY') || groupName.includes('BIO')) {
    isPcb = true;
  } else if (groupName.includes('PCM') || groupName.includes('MATH') || groupName.includes('MATHEMATICS')) {
    isPcm = true;
  }

  let testDoc = null;
  if (testId) {
    try {
      testDoc = await Test.findById(testId).select('title subject groups').lean();
    } catch (_) {}
  }
  if (testDoc) {
    const testTitle = (testDoc.title || '').toUpperCase();
    const testSubs = Array.isArray(testDoc.subject)
      ? testDoc.subject.map(s => String(s).toUpperCase())
      : [String(testDoc.subject || '').toUpperCase()];

    if (testTitle.includes('PCMB') || (testSubs.includes('MATHEMATICS') && testSubs.includes('BIOLOGY'))) {
      isPcm = true;
      isPcb = true;
    } else if (testTitle.includes('PCB') || (testSubs.includes('BIOLOGY') && !testSubs.includes('MATHEMATICS'))) {
      if (!isPcm) isPcb = true;
    } else if (testTitle.includes('PCM') || (testSubs.includes('MATHEMATICS') && !testSubs.includes('BIOLOGY'))) {
      if (!isPcb) isPcm = true;
    }
  }

  // Check results for attempted subject marks
  if (!isPcm && !isPcb && results && results.length) {
    let hasMath = false;
    let hasBio = false;
    for (const r of results) {
      if (r.subjectScores?.Mathematics && r.subjectScores.Mathematics.status !== 'ABSENT' && Number(r.subjectScores.Mathematics.marks || 0) > 0) {
        hasMath = true;
      }
      if (r.subjectScores?.Biology && r.subjectScores.Biology.status !== 'ABSENT' && Number(r.subjectScores.Biology.marks || 0) > 0) {
        hasBio = true;
      }
    }
    if (hasMath && !hasBio) isPcm = true;
    else if (hasBio && !hasMath) isPcb = true;
    else if (hasMath && hasBio) { isPcm = true; isPcb = true; }
  }

  // Check students' subject preference if groupId is set
  if (!isPcm && !isPcb && groupId) {
    try {
      const members = await GroupMember.find({ groupId, role: 'student' }).populate('userId', 'subject').lean();
      const subList = members.map(m => (m.userId?.subject || '').toUpperCase()).filter(Boolean);
      const hasPcm = subList.some(s => s.includes('PCM') || s.includes('MATH'));
      const hasPcb = subList.some(s => s.includes('PCB') || s.includes('BIO'));
      if (hasPcm && !hasPcb) isPcm = true;
      else if (hasPcb && !hasPcm) isPcb = true;
      else if (hasPcm && hasPcb) { isPcm = true; isPcb = true; }
    } catch (_) {}
  }

  // Default fallback if indeterminate: include both Mathematics and Biology
  if (!isPcm && !isPcb) {
    isPcm = true;
    isPcb = true;
  }

  return { isPcm, isPcb, groupDoc, testDoc };
}

exports.getAllResults = async (req, res) => {
  try {
    const selectedGroupId = String(req.query.groupId || '');
    const selectedTestId = String(req.query.testId || '');
    const query = await resultQueryFrom({
      groupId: selectedGroupId,
      testId: selectedTestId,
    });
    const [rawResults, groups, tests] = await Promise.all([
      Result.find(query)
        .sort({ createdAt: -1 })
        .populate('studentId', 'name rollNo subject')
        .populate('testId', 'title course subject totalMarks'),
      Group.find({ isActive: true }).sort({ name: 1 }),
      Test.find().select('title groups status totalMarks').sort({ createdAt: -1 }),
    ]);

    let results = [];
    const selectedTest = selectedTestId ? tests.find(t => t._id.toString() === selectedTestId) : null;

    if (selectedGroupId) {
      const batchMembers = await GroupMember.find({ groupId: selectedGroupId, role: 'student' }).populate('userId').lean();
      const batchStudents = batchMembers.map(m => m.userId).filter(Boolean);
      const resultMap = new Map(rawResults.map(r => [r.studentId?._id?.toString(), r]));

      results = batchStudents.map(student => {
        const sId = student._id.toString();
        const existingResult = resultMap.get(sId);
        if (existingResult) {
          const r = existingResult.toObject ? existingResult.toObject({ virtuals: true }) : { ...existingResult };
          r.id = r.id || r._id?.toString();
          r.student = r.student || r.studentId || student;
          r.test = r.test || r.testId || selectedTest;
          r.isAbsent = false;
          return r;
        }
        return {
          _id: `absent_${sId}`,
          id: `absent_${sId}`,
          student: student,
          studentId: student,
          test: selectedTest,
          testId: selectedTest,
          score: 0,
          totalMarks: selectedTest?.totalMarks || 0,
          subjectScores: {
            Physics: { marks: 0, status: 'ABSENT' },
            Chemistry: { marks: 0, status: 'ABSENT' },
            Mathematics: { marks: 0, status: 'ABSENT' },
            Biology: { marks: 0, status: 'ABSENT' },
          },
          rank: '—',
          percentile: 'A',
          status: 'ABSENT',
          isAbsent: true,
          submittedAt: null,
        };
      });
    } else {
      results = rawResults.map(doc => {
        const r = doc.toObject ? doc.toObject({ virtuals: true }) : { ...doc };
        r.id = r.id || r._id?.toString();
        r.student = r.student || r.studentId;
        r.test = r.test || r.testId;
        r.isAbsent = false;
        return r;
      });
    }

    // Sort: Attended first (by score descending), then absent (by roll number ascending)
    results.sort((a, b) => {
      if (!a.isAbsent && b.isAbsent) return -1;
      if (a.isAbsent && !b.isAbsent) return 1;
      if (!a.isAbsent && !b.isAbsent) return (b.score || 0) - (a.score || 0);
      return String(a.student?.rollNo || '').localeCompare(String(b.student?.rollNo || ''));
    });

    const attendedResults = results.filter(r => !r.isAbsent);
    const attendedCount = attendedResults.length;

    attendedResults.forEach((r, idx) => {
      if (idx > 0 && r.score === attendedResults[idx - 1].score) {
        r.rank = attendedResults[idx - 1].rank;
      } else {
        r.rank = idx + 1;
      }
      const countLessEqual = attendedResults.filter(s => (s.score || 0) <= (r.score || 0)).length;
      const pctVal = attendedCount > 0 ? ((countLessEqual / attendedCount) * 100).toFixed(2) : '100.00';
      r.percentile = `${pctVal}%`;
    });

    results.forEach(r => {
      if (r.isAbsent) {
        r.rank = '—';
        r.percentile = 'A';
      }
    });

    const { isPcm, isPcb } = await detectBatchSubjectMode(selectedGroupId, selectedTestId, results);

    const completedResults = results.filter(r => !r.isAbsent);
    const summary = {
      completed: completedResults.length,
      averagePct: completedResults.length ? completedResults.reduce((sum, r) => sum + (r.totalMarks ? (r.score / r.totalMarks) * 100 : 0), 0) / completedResults.length : 0,
      passCount: completedResults.filter(r => (r.totalMarks ? (r.score / r.totalMarks) * 100 : 0) >= 40).length,
      topPct: completedResults.length ? Math.max(...completedResults.map(r => r.totalMarks ? (r.score / r.totalMarks) * 100 : 0)) : 0,
    };
    res.render('admin/results', {
      title: 'Batch-wise Results',
      results,
      groups,
      tests,
      selectedGroupId,
      selectedTestId,
      summary,
      isPcm,
      isPcb,
    });
  } catch (e) { console.error(e); req.flash('error', 'Failed.'); res.redirect('/admin/dashboard'); }
};

exports.exportResultsExcel = async (req, res) => {
  try {
    const selectedGroupId = String(req.query.groupId || '');
    const selectedTestId = String(req.query.testId || '');
    const query = await resultQueryFrom({
      groupId: selectedGroupId,
      testId: selectedTestId,
    });
    const rawResults = await Result.find(query)
      .sort({ createdAt: -1 })
      .populate('studentId', 'name rollNo subject')
      .populate('testId', 'title totalMarks subject');

    const { isPcm, isPcb, groupDoc, testDoc } = await detectBatchSubjectMode(selectedGroupId, selectedTestId, rawResults);

    let batchStudents = [];
    if (selectedGroupId) {
      const batchMembers = await GroupMember.find({ groupId: selectedGroupId, role: 'student' }).populate('userId').lean();
      batchStudents = batchMembers.map(m => m.userId).filter(Boolean);
    } else if (testDoc && testDoc.groups && testDoc.groups.length) {
      const batchMembers = await GroupMember.find({ groupId: { $in: testDoc.groups }, role: 'student' }).populate('userId').lean();
      const seen = new Set();
      batchStudents = batchMembers.map(m => m.userId).filter(u => {
        if (!u || seen.has(u._id.toString())) return false;
        seen.add(u._id.toString());
        return true;
      });
    }

    let scoredStudents = [];
    if (batchStudents.length > 0) {
      const resultMap = new Map(rawResults.map(r => [r.studentId?._id?.toString(), r]));
      scoredStudents = batchStudents.map(student => {
        const r = resultMap.get(student._id.toString());
        return {
          student,
          r,
          score: r ? Number(r.score || 0) : -1,
          attended: Boolean(r),
        };
      });
    } else {
      scoredStudents = rawResults.map(r => ({
        student: r.studentId || { name: '—', rollNo: '—' },
        r,
        score: Number(r.score || 0),
        attended: true,
      }));
    }

    scoredStudents.sort((a, b) => {
      if (a.attended && !b.attended) return -1;
      if (!a.attended && b.attended) return 1;
      if (a.attended && b.attended) return b.score - a.score;
      return String(a.student.rollNo || '').localeCompare(String(b.student.rollNo || ''));
    });

    const attendedCount = scoredStudents.filter(s => s.attended).length;

    const data = scoredStudents.map(item => {
      const { student, r, score, attended } = item;

      let percentile = 'A';
      if (attended) {
        const countLessEqual = scoredStudents.filter(s => s.attended && s.score <= score).length;
        const pctVal = attendedCount > 0 ? ((countLessEqual / attendedCount) * 100).toFixed(2) : '100.00';
        percentile = `${pctVal}%`;
      }

      const phy = attended && r?.subjectScores?.Physics?.status !== 'ABSENT'
        ? (r?.subjectScores?.Physics?.marks !== undefined ? Number(r.subjectScores.Physics.marks) : 'A')
        : 'A';

      const chem = attended && r?.subjectScores?.Chemistry?.status !== 'ABSENT'
        ? (r?.subjectScores?.Chemistry?.marks !== undefined ? Number(r.subjectScores.Chemistry.marks) : 'A')
        : 'A';

      const math = attended && r?.subjectScores?.Mathematics?.status !== 'ABSENT'
        ? (r?.subjectScores?.Mathematics?.marks !== undefined ? Number(r.subjectScores.Mathematics.marks) : 'A')
        : 'A';

      const bio = attended && r?.subjectScores?.Biology?.status !== 'ABSENT'
        ? (r?.subjectScores?.Biology?.marks !== undefined ? Number(r.subjectScores.Biology.marks) : 'A')
        : 'A';

      const row = {
        'Roll Number': student.rollNo || '—',
        'Name': student.name || '—',
        'Physics': phy,
        'Chemistry': chem,
      };

      if (isPcb && !isPcm) {
        row['Biology'] = bio;
      } else if (isPcm && !isPcb) {
        row['Mathematics'] = math;
      } else {
        row['Mathematics'] = math;
        row['Biology'] = bio;
      }

      row['Total Marks'] = attended ? r.score : 'A';
      row['Percentile'] = percentile;

      return row;
    });

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(data);

    const cols = [
      { wch: 16 }, // Roll Number
      { wch: 28 }, // Name
      { wch: 14 }, // Physics
      { wch: 14 }, // Chemistry
    ];
    if (isPcb && !isPcm) {
      cols.push({ wch: 14 }); // Biology
    } else if (isPcm && !isPcb) {
      cols.push({ wch: 16 }); // Mathematics
    } else {
      cols.push({ wch: 16 }); // Mathematics
      cols.push({ wch: 14 }); // Biology
    }
    cols.push({ wch: 14 }); // Total Marks
    cols.push({ wch: 14 }); // Percentile
    ws['!cols'] = cols;

    xlsx.utils.book_append_sheet(wb, ws, 'Batch Results');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = [
      groupDoc ? safeFilenamePart(groupDoc.name, 'batch') : null,
      testDoc ? safeFilenamePart(testDoc.title, 'test') : null,
      'batch_results',
    ].filter(Boolean).join('_') + '.xlsx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (e) {
    console.error('Export Results Excel error:', e);
    req.flash('error', 'Export failed.');
    res.redirect('/admin/results');
  }
};

// ── DOCUMENTS ─────────────────────────────────────────────────────────────────
exports.getDocuments = async (req, res) => {
  try {
    const docs = await StudentDocument.find().sort({ createdAt: -1 }).populate('studentId', 'name rollNo');
    res.render('admin/documents', { title: 'Student Documents', docs });
  } catch (e) { req.flash('error', 'Failed.'); res.redirect('/admin/dashboard'); }
};

exports.deleteDocument = async (req, res) => {
  try {
    const doc = await StudentDocument.findById(req.params.id);
    if (doc) {
      const fp = path.join(__dirname, '..', 'public', doc.filePath);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      await doc.deleteOne();
    }
    req.flash('success', 'Document deleted.');
    res.redirect('/admin/documents');
  } catch (e) { req.flash('error', 'Failed.'); res.redirect('/admin/documents'); }
};

// ── GROUP DETAIL / EDIT / DELETE ──────────────────────────────────────────
exports.getGroupDetail = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) { req.flash('error', 'Batch not found.'); return res.redirect('/admin/groups'); }
    const memberships = await GroupMember.find({ groupId: group._id, role: 'student' }).populate('userId');
    const members = memberships.map(m => m.userId).filter(Boolean);
    const allGroups = await Group.find({ isActive: true });
    res.render('admin/group-detail', { title: group.name, group, members, allGroups });
  } catch (e) { console.error(e); req.flash('error', 'Failed.'); res.redirect('/admin/groups'); }
};

exports.updateGroup = async (req, res) => {
  try {
    const { name, description, academicYear, course, startDate, endDate, status } = req.body;
    await Group.findByIdAndUpdate(req.params.id, { name, description: description || null, academicYear: academicYear || process.env.ACADEMIC_YEAR, course: course || null, startDate: startDate || null, endDate: endDate || null, status: status || 'active' });
    req.flash('success', 'Batch updated.');
    res.redirect('/admin/groups');
  } catch (e) { req.flash('error', 'Failed: ' + e.message); res.redirect('/admin/groups'); }
};

exports.deleteGroup = async (req, res) => {
  try {
    await GroupMember.deleteMany({ groupId: req.params.id });
    await Group.findByIdAndUpdate(req.params.id, { isActive: false });
    req.flash('success', 'Batch deleted.');
    res.redirect('/admin/groups');
  } catch (e) { req.flash('error', 'Failed.'); res.redirect('/admin/groups'); }
};

exports.removeStudentFromGroup = async (req, res) => {
  try {
    await GroupMember.findOneAndDelete({ groupId: req.params.id, userId: req.params.studentId });
    req.flash('success', 'Student removed from batch.');
    res.redirect(`/admin/groups/${req.params.id}`);
  } catch (e) { req.flash('error', 'Failed.'); res.redirect(`/admin/groups/${req.params.id}`); }
};

exports.moveStudentToGroup = async (req, res) => {
  try {
    const { targetGroupId } = req.body;
    await GroupMember.findOneAndDelete({ groupId: req.params.id, userId: req.params.studentId });
    await GroupMember.findOneAndUpdate({ groupId: targetGroupId, userId: req.params.studentId }, { role: 'student' }, { upsert: true });
    req.flash('success', 'Student moved to new batch.');
    res.redirect(`/admin/groups/${req.params.id}`);
  } catch (e) { req.flash('error', 'Failed.'); res.redirect(`/admin/groups/${req.params.id}`); }
};

// ── DELETE STUDENT ─────────────────────────────────────────────────────────
exports.deleteStudent = async (req, res) => {
  try {
    const studentId = req.params.id;

    const student = await User.findById(studentId);

    if (!student) {
      req.flash("error", "Student not found.");
      return res.redirect("/admin/students");
    }

    // Delete student from groups
    await GroupMember.deleteMany({
      $or: [
        { userId: studentId },
        { user: studentId },
        { studentId: studentId }
      ]
    });

    // Permanently delete student
    await User.findByIdAndDelete(studentId);

    req.flash("success", "Student deleted successfully.");
    return res.redirect("/admin/students");
  } catch (error) {
    console.error("Delete student error:", error);

    req.flash("error", "Failed to delete student.");
    return res.redirect("/admin/students");
  }
};
// ── VIEW STUDENT PROFILE ──────────────────────────────────────────────────
exports.viewStudentProfile = async (req, res) => {
  try {
    const student = await User.findById(req.params.id);
    if (!student || student.role !== 'student') { req.flash('error', 'Student not found.'); return res.redirect('/admin/students'); }
    const [memberships, documents, results] = await Promise.all([
      GroupMember.find({ userId: student._id }).populate('groupId', 'name academicYear'),
      StudentDocument.find({ studentId: student._id }).sort({ createdAt: -1 }),
      require('../models/Result').find({ studentId: student._id, status: { $in: ['submitted', 'auto_submitted'] } }).populate('testId', 'title totalMarks').sort({ createdAt: -1 }).limit(10),
    ]);
    res.render('admin/student-profile', { title: student.name, student, memberships, documents, results });
  } catch (e) { console.error(e); req.flash('error', 'Failed.'); res.redirect('/admin/students'); }
};

// ── EDIT TEST ─────────────────────────────────────────────────────────────
exports.getEditTest = async (req, res) => {
  try {
    const [test, groups, questions] = await Promise.all([
      Test.findById(req.params.id).populate('questions').populate('groups', 'name'),
      Group.find({ isActive: true }),
      Question.find({ isActive: true }).sort({ subject: 1, difficulty: 1 }),
    ]);
    if (!test) { req.flash('error', 'Not found.'); return res.redirect('/admin/tests'); }
    res.render('admin/edit-test', { title: 'Edit Test', test, groups, questions, COURSES, SUBJECTS: ALL_SUBJECTS, formatDateTimeLocal });
  } catch (e) { req.flash('error', 'Failed.'); res.redirect('/admin/tests'); }
};

exports.updateTest = async (req, res) => {
  try {
    const questionIds_raw = req.body.questionIds;
    const selectedQIds = Array.isArray(questionIds_raw) ? questionIds_raw : (questionIds_raw ? [questionIds_raw] : []);
    const { title, description, duration, negativeMarking, passingMarks, shuffleQuestions, shuffleOptions, startTime, endTime, instructions, groupIds, courses, subjects, testType, testPattern, rankSchema, testPassword } = req.body;
    const questionsData = selectedQIds.length ? await Question.find({ _id: { $in: selectedQIds } }) : [];
    const totalMarks = questionsData.reduce((s, q) => s + q.marks, 0);
    const groups = Array.isArray(groupIds) ? groupIds : (groupIds ? [groupIds] : []);
    const courseArr = Array.isArray(courses) ? courses : (courses ? [courses] : []);
    const subjectArr = Array.isArray(subjects) ? subjects : (subjects ? [subjects] : []);
    const parsedStartTime = parseLocalDateTime(startTime);
    const parsedEndTime = parseLocalDateTime(endTime);
    if (parsedStartTime && parsedEndTime && parsedEndTime <= parsedStartTime) throw new Error('Test end time must be after start time.');
    await Test.findByIdAndUpdate(req.params.id, {
      title, description, duration: parseInt(duration) || 180,
      negativeMarking: finiteNumberOr(negativeMarking, 0.25),
      passingMarks: finiteNumberOr(passingMarks, null),
      shuffleQuestions: shuffleQuestions === 'on', shuffleOptions: shuffleOptions === 'on',
      startTime: parsedStartTime, endTime: parsedEndTime, instructions,
      course: courseArr, subject: subjectArr, groups, totalMarks,
      autoSubmitOnViolation: req.body.autoSubmitOnViolation === 'on',
      maxTabSwitches: parseInt(req.body.maxTabSwitches) || 3,
      maxFocusLosses: parseInt(req.body.maxFocusLosses) || 5,
      blockCopyPaste: req.body.blockCopyPaste === 'on',
      requireFullscreen: req.body.requireFullscreen === 'on',
      noTimeLimit: req.body.noTimeLimit === 'on', testType: testType || 'Mock Test', testPattern: testPattern || 'BASIC', rankSchema: rankSchema || 'Scheme 1',
      testPassword: String(testPassword || '').trim() || null, hideImmediateResults: req.body.hideImmediateResults === 'on', fixedTime: req.body.fixedTime === 'on',
      ...(selectedQIds.length ? { questions: selectedQIds } : {}),
    });
    req.flash('success', 'Test updated!');
    res.redirect(`/admin/tests/${req.params.id}`);
  } catch (e) { req.flash('error', 'Failed: ' + e.message); res.redirect(`/admin/tests/${req.params.id}`); }
};

exports.deleteTest = async (req, res) => {
  try {
    const test = await Test.findOneAndUpdate(
      { _id: req.params.id, isActive: { $ne: false } },
      { isActive: false, status: 'closed', groups: [] },
      { returnDocument: 'after' }
    );
    if (!test) { req.flash('error', 'Test not found or already deleted.'); return res.redirect('/admin/tests'); }
    req.flash('success', 'Test deleted.');
    res.redirect('/admin/tests');
  } catch (e) { req.flash('error', 'Failed.'); res.redirect('/admin/tests'); }
};

// ── QUESTION TEMPLATE DOWNLOAD ────────────────────────────────────────────
exports.downloadQuestionTemplate = (req, res) => {
  const rows = [
    { question: 'What is the SI unit of force?', optionA: 'Joule', optionB: 'Newton', optionC: 'Watt', optionD: 'Pascal', correctAnswer: 'B', subject: 'Physics', topic: 'Laws of Motion', subtopic: '', difficulty: 'Easy', marks: 1, explanation: 'Force = mass × acceleration. SI unit is Newton (N).', questionImageUrl: '' },
    { question: 'pH of pure water at 25°C?', optionA: '0', optionB: '7', optionC: '14', optionD: '1', correctAnswer: 'B', subject: 'Chemistry', topic: 'Acids and Bases', subtopic: '', difficulty: 'Easy', marks: 1, explanation: 'Pure water is neutral with pH = 7.', questionImageUrl: '' },
    { question: 'Derivative of sin(x) is?', optionA: '-cos(x)', optionB: 'cos(x)', optionC: 'tan(x)', optionD: '-sin(x)', correctAnswer: 'B', subject: 'Mathematics', topic: 'Calculus', subtopic: '', difficulty: 'Easy', marks: 1, explanation: 'd/dx sin(x) = cos(x)', questionImageUrl: '' },
  ];
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 60 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 6 }, { wch: 60 }, { wch: 40 }];
  xlsx.utils.book_append_sheet(wb, ws, 'Questions');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=question_import_template.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

exports.getUploadTest = async (req, res) => {
  try {
    const groups = await Group.find({ isActive: true });
    res.render('admin/upload-test', { title: 'Upload Test via PDF', groups, COURSES, SUBJECTS: ALL_SUBJECTS });
  } catch (e) { req.flash('error', 'Failed.'); res.redirect('/admin/tests'); }
};

exports.uploadPdfTest = async (req, res) => {
  try {
    if (!req.files?.questionPdf) { req.flash('error', 'Question PDF required.'); return res.redirect('/admin/tests/upload'); }
    const { title, description, duration, negativeMarking, startTime, endTime, instructions, groupIds, courses, subjects, marksPerQuestion } = req.body;
    if (!title?.trim()) { req.flash('error', 'Test title required.'); return res.redirect('/admin/tests/upload'); }
    const qFname = `q_${Date.now()}.pdf`;
    const qBuf = req.files.questionPdf.data;
    fs.writeFileSync(path.join(PDF_DIR, qFname), qBuf);
    const questionPdfPath = '/uploads/pdfs/' + qFname;
    let solutionPdfPath = null;
    if (req.files?.solutionPdf) { const fn = `s_${Date.now()}.pdf`; solutionPdfPath = '/uploads/pdfs/' + fn; fs.writeFileSync(path.join(PDF_DIR, fn), req.files.solutionPdf.data); }
    let pdfPageCount = 0;
    try {
      const ps = qBuf.toString('latin1');
      const pm = ps.match(/\/Type\s*\/Page[^s]/g);
      pdfPageCount = pm ? pm.length : 0;
      if (!pdfPageCount) { const cm = ps.match(/\/Count\s+(\d+)/); pdfPageCount = cm ? parseInt(cm[1]) : 0; }
    } catch { }
    const mpq = parseFloat(marksPerQuestion) || 1;
    const totalMarks = pdfPageCount > 0 ? pdfPageCount * mpq : mpq;
    const groups = Array.isArray(groupIds) ? groupIds : (groupIds ? [groupIds] : []);
    const courseArr = Array.isArray(courses) ? courses : (courses ? [courses] : []);
    const subjectArr = Array.isArray(subjects) ? subjects : (subjects ? [subjects] : []);
    const parsedStartTime = parseLocalDateTime(startTime);
    const parsedEndTime = parseLocalDateTime(endTime);
    if (parsedStartTime && parsedEndTime && parsedEndTime <= parsedStartTime) throw new Error('Test end time must be after start time.');
    const test = await Test.create({
      title: title.trim(), description: description || null, duration: parseInt(duration) || 180,
      negativeMarking: finiteNumberOr(negativeMarking, 0.25), startTime: parsedStartTime, endTime: parsedEndTime,
      instructions: instructions || null, totalMarks, createdBy: req.session.user.id, status: 'draft',
      course: courseArr, subject: subjectArr, marksPerQuestion: mpq,
      questionPdfPath, solutionPdfPath, groups,
      autoSubmitOnViolation: req.body.autoSubmitOnViolation === 'on',
      maxTabSwitches: parseInt(req.body.maxTabSwitches) || 3,
      maxFocusLosses: parseInt(req.body.maxFocusLosses) || 5,
      blockCopyPaste: req.body.blockCopyPaste !== 'off',
      requireFullscreen: req.body.requireFullscreen === 'on',
    });
    const pageInfo = pdfPageCount > 0 ? ` Detected ${pdfPageCount} page(s) — ${totalMarks} total marks.` : '';
    req.flash('success', `PDF test "${test.title}" created as Draft.${pageInfo}${solutionPdfPath ? ' Model answers attached.' : ''} Configure the marking scheme next.`);
    res.redirect(`/admin/tests/${test._id}/marking-template`);
  } catch (e) { console.error(e); req.flash('error', 'Failed: ' + e.message); res.redirect('/admin/tests/upload'); }
};

// ── PDF TEMPLATE ──────────────────────────────────────────────────────────────
exports.downloadPdfTestTemplate = (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=question_paper_template.pdf');
    doc.pipe(res);
    const W = 595.28, pageW = W - 100;
    const pageHeader = (qNum, total, type) => {
      doc.rect(50, 40, pageW, 28).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text(`SVPN TEST  ·  Question ${qNum} of ${total}`, 58, 49).text(type, 50, 49, { width: pageW, align: 'right' });
      doc.fillColor('#1e3a5f').fontSize(7).font('Helvetica').text('⚠  1 QUESTION PER PAGE  —  Do not merge pages', 50, 74, { width: pageW, align: 'center' });
      doc.moveTo(50, 84).lineTo(W - 50, 84).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
    };
    const drawOptions = (opts, startY) => {
      const labels = ['A', 'B', 'C', 'D']; let y = startY;
      opts.forEach((opt, i) => { doc.rect(50, y, 14, 14).strokeColor('#94a3b8').lineWidth(0.8).stroke(); doc.fillColor('#374151').fontSize(11).font('Helvetica-Bold').text(labels[i] + '.', 68, y + 1); doc.font('Helvetica').fillColor('#1f2937').text(opt, 88, y + 1, { width: pageW - 38 }); y = doc.y + 6; });
      return y;
    };
    const answerBox = (answer, explanation) => {
      const y = doc.y + 14; doc.rect(50, y, pageW, explanation ? 56 : 26).fill('#f0fdf4').stroke();
      doc.fillColor('#166534').fontSize(9).font('Helvetica-Bold').text(`✔  Correct Answer: (${answer})`, 58, y + 7);
      if (explanation) doc.fillColor('#374151').font('Helvetica').fontSize(8.5).text(`Explanation: ${explanation}`, 58, y + 22, { width: pageW - 16 });
      doc.fillColor('#94a3b8').fontSize(7).font('Helvetica').text('— END OF QUESTION —', 50, doc.page.height - 50, { width: pageW, align: 'center' });
    };
    pageHeader(1, 5, 'TEXT QUESTION'); doc.moveDown(0.5);
    doc.fillColor('#1e3a5f').fontSize(10).font('Helvetica-Bold').text('SUBJECT: Physics   |   TOPIC: Laws of Motion   |   MARKS: 2', 50, 95, { width: pageW });
    doc.moveDown(0.8); doc.fillColor('#111827').fontSize(12.5).font('Helvetica-Bold').text('Q1.  A body of mass 5 kg moves at 10 m/s. A force of 20 N acts for 3 s. What is the final velocity?', 50, doc.y, { width: pageW });
    doc.moveDown(1); drawOptions(['25 m/s', '22 m/s', '20 m/s', '30 m/s'], doc.y); answerBox('B', 'v = u + at = 10 + (20/5)×3 = 22 m/s');
    doc.addPage(); pageHeader(2, 5, 'QUESTION WITH DIAGRAM'); doc.moveDown(0.5);
    doc.fillColor('#1e3a5f').fontSize(10).font('Helvetica-Bold').text('SUBJECT: Physics   |   TOPIC: Optics   |   MARKS: 3', 50, 95, { width: pageW });
    doc.moveDown(0.8); doc.fillColor('#111827').fontSize(12.5).font('Helvetica-Bold').text('Q2.  Refer to the ray diagram below. Identify the type of lens and image formed:', 50, doc.y, { width: pageW });
    doc.moveDown(0.8);
    const imgY = doc.y, imgH = 130;
    doc.rect(50, imgY, pageW, imgH).fill('#f8fafc').strokeColor('#94a3b8').lineWidth(1).stroke();
    doc.moveTo(50, imgY).lineTo(50 + pageW, imgY + imgH).strokeColor('#cbd5e1').lineWidth(0.5).dash(4, { space: 4 }).stroke();
    doc.moveTo(50 + pageW, imgY).lineTo(50, imgY + imgH).stroke(); doc.undash();
    doc.fillColor('#64748b').fontSize(11).font('Helvetica-Bold').text('[ Diagram / Image Area ]', 50, imgY + imgH / 2 - 18, { width: pageW, align: 'center' });
    doc.fillColor('#94a3b8').fontSize(8.5).font('Helvetica').text('Embed your diagram here using a PDF editor', 50, imgY + imgH / 2, { width: pageW, align: 'center' });
    doc.y = imgY + imgH + 12; drawOptions(['Convex lens; real and inverted', 'Concave lens; virtual and erect', 'Convex lens; virtual and erect', 'Concave lens; real and inverted'], doc.y);
    answerBox('A', 'Convex lens forms a real, inverted image when object is beyond F.');
    doc.addPage(); pageHeader(3, 5, 'TEXT QUESTION'); doc.moveDown(0.5);
    doc.fillColor('#1e3a5f').fontSize(10).font('Helvetica-Bold').text('SUBJECT: Chemistry   |   TOPIC: Chemical Bonding   |   MARKS: 1', 50, 95, { width: pageW });
    doc.moveDown(0.8); doc.fillColor('#111827').fontSize(12.5).font('Helvetica-Bold').text('Q3.  Bond angle in H₂O is approximately:', 50, doc.y, { width: pageW });
    doc.moveDown(1); drawOptions(['90°', '109.5°', '104.5°', '120°'], doc.y); answerBox('C', '2 lone pairs compress the bond angle to ~104.5°.');
    doc.addPage(); pageHeader(4, 5, 'QUESTION WITH STRUCTURE / IMAGE'); doc.moveDown(0.5);
    doc.fillColor('#1e3a5f').fontSize(10).font('Helvetica-Bold').text('SUBJECT: Chemistry   |   TOPIC: Organic Chemistry   |   MARKS: 2', 50, 95, { width: pageW });
    doc.moveDown(0.8); doc.fillColor('#111827').fontSize(12.5).font('Helvetica-Bold').text('Q4.  The structural formula below belongs to which class of organic compound?', 50, doc.y, { width: pageW });
    doc.moveDown(0.8);
    const sY = doc.y, sH = 110;
    doc.rect(50, sY, pageW, sH).fill('#fffbeb').strokeColor('#fbbf24').lineWidth(1).stroke();
    doc.fillColor('#92400e').fontSize(11).font('Helvetica-Bold').text('[ Structural Formula / Chemical Structure Image ]', 50, sY + sH / 2 - 16, { width: pageW, align: 'center' });
    doc.y = sY + sH + 12; drawOptions(['Alcohol', 'Aldehyde', 'Ketone', 'Carboxylic Acid'], doc.y); answerBox('D', '–COOH functional group = Carboxylic acid.');
    doc.addPage(); pageHeader(5, 5, 'TEXT QUESTION'); doc.moveDown(0.5);
    doc.fillColor('#1e3a5f').fontSize(10).font('Helvetica-Bold').text('SUBJECT: Mathematics   |   TOPIC: Integration   |   MARKS: 4', 50, 95, { width: pageW });
    doc.moveDown(0.8); doc.fillColor('#111827').fontSize(12.5).font('Helvetica-Bold').text('Q5.  Evaluate: ∫ (2x³ + 3x² − x + 5) dx', 50, doc.y, { width: pageW });
    doc.moveDown(1); drawOptions(['(x⁴/2) + x³ − (x²/2) + 5x + C', '(x⁴/2) + x³ + (x²/2) + 5x + C', '2x⁴ + 3x³ − x² + 5x + C', 'x⁴ + x³ − x² + 5 + C'], doc.y);
    answerBox('A', '∫2x³dx=x⁴/2, ∫3x²dx=x³, ∫−x dx=−x²/2, ∫5dx=5x');
    doc.end();
  } catch (e) { console.error(e); res.status(500).send('Template failed: ' + e.message); }
};

// ── ANSWER KEY TEMPLATE ───────────────────────────────────────────────────────
exports.downloadAnswerKeyTemplate = (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=answer_key_template.pdf');
    doc.pipe(res);

    const W = 595.28, pageW = W - 100;
    const NAVY = '#1e3a5f', GREEN = '#166534', LIGHT_GREEN = '#f0fdf4',
      BORDER_GREEN = '#bbf7d0', SLATE = '#374151';

    const drawHeader = () => {
      doc.rect(50, 40, pageW, 34).fill(NAVY);
      doc.fillColor('#ffffff').fontSize(13).font('Helvetica-Bold').text('ANSWER KEY', 58, 48);
      doc.fontSize(9).font('Helvetica').text('Fill in your actual answers below and upload as Solution PDF', 58, 62);
      doc.fontSize(9).font('Helvetica-Bold').text('MODEL ANSWERS & EXPLANATIONS', 58, 48, { width: pageW, align: 'right' });
      doc.moveTo(50, 80).lineTo(W - 50, 80).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
    };

    const drawRow = (qNum, ans, subject, topic, explanation, marks) => {
      if (doc.y > 730) { doc.addPage(); drawHeader(); doc.y = 95; }
      const y = doc.y + 3;
      const rowH = explanation ? 60 : 34;
      if (qNum % 2 === 0) doc.rect(50, y, pageW, rowH).fill('#f8fafc');
      doc.roundedRect(54, y + 7, 26, 20, 4).fill(NAVY);
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('Q' + qNum, 54, y + 11, { width: 26, align: 'center' });
      doc.circle(110, y + 17, 10).fill(GREEN);
      doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold').text(ans, 101, y + 11, { width: 20, align: 'center' });
      doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text(subject + (topic ? '  \xb7  ' + topic : ''), 128, y + 7);
      doc.fillColor(GREEN).fontSize(8).font('Helvetica-Bold').text('+' + marks + ' mark' + (marks !== 1 ? 's' : ''), 128, y + 18);
      if (explanation) {
        doc.rect(128, y + 30, pageW - 82, rowH - 36).fill(LIGHT_GREEN).strokeColor(BORDER_GREEN).lineWidth(0.5).stroke();
        doc.fillColor(GREEN).fontSize(7.5).font('Helvetica-Bold').text('Explanation: ', 132, y + 35, { continued: true });
        doc.fillColor(SLATE).font('Helvetica').text(explanation, { width: pageW - 92 });
      }
      doc.y = y + rowH + 2;
    };

    drawHeader();
    doc.y = 90;

    doc.rect(50, doc.y, pageW, 26).fill('#eff6ff').strokeColor('#bfdbfe').lineWidth(0.5).stroke();
    doc.fillColor('#1e40af').fontSize(8).font('Helvetica-Bold').text('HOW TO USE:  ', 58, doc.y + 5, { continued: true });
    doc.font('Helvetica').text('Replace Q numbers, answers (A/B/C/D), subject, topic, marks and explanation with your actual exam answers. Upload this as the Solution PDF when creating a test.', { width: pageW - 20 });
    doc.y += 32;

    doc.rect(50, doc.y, pageW, 18).fill('#e2e8f0');
    doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold')
      .text('Q', 58, doc.y + 5)
      .text('Ans', 96, doc.y + 5)
      .text('Subject  /  Topic', 128, doc.y + 5)
      .text('Marks', W - 90, doc.y + 5);
    doc.y += 22;

    const rows = [
      { q: 1, a: 'B', sub: 'Physics', top: 'Laws of Motion', m: 2, exp: 'F=ma => a=4 m/s2. v = u + at = 10 + 4x3 = 22 m/s.' },
      { q: 2, a: 'A', sub: 'Physics', top: 'Optics', m: 3, exp: 'Convex lens forms real inverted image when object is beyond F.' },
      { q: 3, a: 'C', sub: 'Chemistry', top: 'Chemical Bonding', m: 1, exp: '2 lone pairs in H2O compress bond angle to ~104.5 degrees.' },
      { q: 4, a: 'D', sub: 'Chemistry', top: 'Organic Chemistry', m: 2, exp: 'COOH functional group = Carboxylic Acid.' },
      { q: 5, a: 'A', sub: 'Mathematics', top: 'Integration', m: 4, exp: 'Integral(2x3)=x4/2, Integral(3x2)=x3, Integral(-x)=-x2/2, Integral(5)=5x. Add C.' },
      { q: 6, a: 'C', sub: 'Physics', top: 'Kinematics', m: 2, exp: '' },
      { q: 7, a: 'B', sub: 'Chemistry', top: 'Periodic Table', m: 1, exp: '' },
      { q: 8, a: 'D', sub: 'Mathematics', top: 'Calculus', m: 2, exp: '' },
      { q: 9, a: 'A', sub: 'Biology', top: 'Cell Biology', m: 1, exp: '' },
      { q: 10, a: 'B', sub: 'Physics', top: 'Thermodynamics', m: 2, exp: '' },
    ];
    rows.forEach(function (r) { drawRow(r.q, r.a, r.sub, r.top, r.exp, r.m); });

    doc.addPage();
    drawHeader();
    doc.y = 95;

    doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('SUBJECT-WISE SUMMARY', 50, doc.y);
    doc.y += 18;

    const cols = [50, 220, 310, 400];
    const hdrs = ['Subject', 'Questions', 'Total Marks', 'Notes'];
    doc.rect(50, doc.y, pageW, 20).fill(NAVY);
    hdrs.forEach(function (h, i) { doc.fillColor('#fff').fontSize(8.5).font('Helvetica-Bold').text(h, cols[i] + 4, doc.y + 6, { width: 90 }); });
    doc.y += 22;

    var summaryRows = [
      { sub: 'Physics', qs: 4, marks: 9 },
      { sub: 'Chemistry', qs: 3, marks: 4 },
      { sub: 'Mathematics', qs: 2, marks: 6 },
      { sub: 'Biology', qs: 1, marks: 1 },
    ];
    summaryRows.forEach(function (s, i) {
      var ry = doc.y;
      if (i % 2 === 0) doc.rect(50, ry, pageW, 20).fill('#f8fafc');
      doc.fillColor(SLATE).fontSize(9).font('Helvetica-Bold').text(s.sub, cols[0] + 4, ry + 6);
      doc.font('Helvetica').text(String(s.qs), cols[1] + 4, ry + 6).text(String(s.marks), cols[2] + 4, ry + 6).text('', cols[3] + 4, ry + 6);
      doc.moveTo(50, ry + 20).lineTo(W - 50, ry + 20).strokeColor('#e2e8f0').lineWidth(0.4).stroke();
      doc.y = ry + 22;
    });

    doc.rect(50, doc.y, pageW, 22).fill(NAVY);
    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold')
      .text('TOTAL', cols[0] + 4, doc.y + 7)
      .text('10', cols[1] + 4, doc.y + 7)
      .text('20', cols[2] + 4, doc.y + 7);
    doc.y += 30;

    doc.rect(50, doc.y, pageW, 34).fill('#fefce8').strokeColor('#fde047').lineWidth(0.5).stroke();
    doc.fillColor('#713f12').fontSize(8).font('Helvetica-Bold').text('TIP:  ', 58, doc.y + 6, { continued: true });
    doc.font('Helvetica').text('Edit this PDF in Adobe Acrobat, LibreOffice Draw or Canva. Replace sample values with your actual exam answers. Keep the same layout. Upload as Solution PDF when creating a test.', { width: pageW - 16 });

    doc.end();
  } catch (e) { console.error(e); res.status(500).send('Answer key template failed: ' + e.message); }
};

// ── SPVN ORGANIZATION / ANALYTICS / MONITOR ───────────────────────────
exports.getOrganization = async (req, res) => {
  try {
    const groups = await Group.find({ isActive: { $ne: false } }).sort({ createdAt: -1 }).lean();
    const rows = await Promise.all(groups.map(async group => {
      const totalStudents = await GroupMember.countDocuments({ groupId: group._id, role: 'student' });
      return { ...group, totalStudents };
    }));
    const totals = {
      batches: rows.length,
      students: rows.reduce((sum, row) => sum + row.totalStudents, 0),
      active: rows.filter(row => (row.status || 'active') === 'active').length,
      courses: new Set(rows.map(row => row.course).filter(Boolean)).size,
    };
    res.render('admin/organization', { title: 'Organization', groups: rows, totals, COURSES });
  } catch (e) { console.error(e); req.flash('error', 'Unable to load organization.'); res.redirect('/admin/dashboard'); }
};

exports.getAnalytics = async (req, res) => {
  try {
    const { testId, groupId } = req.query;
    const [tests, groups] = await Promise.all([
      Test.find({ isActive: { $ne: false } }).sort({ createdAt: -1 }).lean(),
      Group.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean(),
    ]);
    const query = await resultQueryFrom({ testId: testId || null, groupId: groupId || null });
    const results = await Result.find(query).populate('testId', 'title subject totalMarks').populate('studentId', 'name rollNo').lean();
    const attempted = results.length;
    const avgPct = attempted ? results.reduce((sum, r) => sum + (r.totalMarks ? (r.score / r.totalMarks) * 100 : 0), 0) / attempted : 0;
    const passCount = results.filter(r => (r.totalMarks ? (r.score / r.totalMarks) * 100 : 0) >= 40).length;
    const bestPct = attempted ? Math.max(...results.map(r => r.totalMarks ? (r.score / r.totalMarks) * 100 : 0)) : 0;
    const subjectMap = {};
    for (const r of results) {
      for (const [subject, data] of Object.entries(r.subjectScores || {})) {
        if (!subjectMap[subject]) subjectMap[subject] = { subject, marks: 0, total: 0, attempts: 0 };
        if (data?.status !== 'ABSENT') {
          subjectMap[subject].marks += Number(data?.marks || 0);
          subjectMap[subject].total += Number(data?.total || 0);
          subjectMap[subject].attempts++;
        }
      }
    }
    const subjectPerformance = Object.values(subjectMap).map(row => ({ ...row, percentage: row.total ? (row.marks / row.total) * 100 : 0 })).sort((a, b) => b.percentage - a.percentage);
    const testMap = new Map();
    for (const r of results) {
      const id = String(r.testId?._id || '');
      if (!id) continue;
      if (!testMap.has(id)) testMap.set(id, { title: r.testId.title, attempts: 0, score: 0, total: 0 });
      const row = testMap.get(id); row.attempts++; row.score += Number(r.score || 0); row.total += Number(r.totalMarks || 0);
    }
    const testPerformance = [...testMap.values()].map(row => ({ ...row, percentage: row.total ? (row.score / row.total) * 100 : 0 })).sort((a, b) => b.attempts - a.attempts);
    res.render('admin/analytics', { title: 'Analytics', tests, groups, results, subjectPerformance, testPerformance, filters: { testId: testId || '', groupId: groupId || '' }, summary: { attempted, avgPct, passCount, bestPct } });
  } catch (e) { console.error(e); req.flash('error', 'Unable to load analytics.'); res.redirect('/admin/dashboard'); }
};

exports.getMonitor = async (req, res) => {
  try {
    const now = new Date();
    const tests = await Test.find({ isActive: { $ne: false }, status: { $in: ['published', 'active'] } }).populate('groups', 'name').sort({ startTime: 1, createdAt: -1 }).lean();
    const rows = await Promise.all(tests.map(async test => {
      const [inProgress, submitted, flagged] = await Promise.all([
        Result.countDocuments({ testId: test._id, status: 'in_progress' }),
        Result.countDocuments({ testId: test._id, status: { $in: ['submitted', 'auto_submitted'] } }),
        Result.countDocuments({ testId: test._id, violationCount: { $gt: 0 }, status: { $in: ['in_progress', 'submitted', 'auto_submitted'] } }),
      ]);
      let state = 'Upcoming';
      if ((!test.startTime || test.startTime <= now) && (!test.endTime || test.endTime >= now)) state = 'Live';
      if (test.endTime && test.endTime < now) state = 'Ended';
      return { ...test, inProgress, submitted, flagged, state };
    }));
    res.render('admin/monitor', { title: 'Monitor', tests: rows, now });
  } catch (e) { console.error(e); req.flash('error', 'Unable to load monitor.'); res.redirect('/admin/dashboard'); }
};

exports.getTestMonitor = async (req, res) => {
  try {
    const [test, attempts] = await Promise.all([
      Test.findById(req.params.id).populate('groups', 'name course').lean(),
      Result.find({ testId: req.params.id }).populate('studentId', 'name rollNo email').sort({ updatedAt: -1 }).lean(),
    ]);
    if (!test) { req.flash('error', 'Test not found.'); return res.redirect('/admin/monitor'); }
    const stats = {
      total: attempts.length,
      live: attempts.filter(r => r.status === 'in_progress').length,
      completed: attempts.filter(r => ['submitted', 'auto_submitted'].includes(r.status)).length,
      flagged: attempts.filter(r => Number(r.violationCount || 0) > 0).length,
    };
    res.render('admin/test-monitor', { title: `Monitor - ${test.title}`, test, attempts, stats });
  } catch (e) { console.error(e); req.flash('error', 'Unable to open live monitor.'); res.redirect('/admin/monitor'); }
};

exports.updateTestStatus = async (req, res) => {
  try {
    const allowed = ['draft', 'scheduled', 'published', 'active', 'completed', 'archived', 'closed'];
    const status = String(req.body.status || '').toLowerCase();
    if (!allowed.includes(status)) throw new Error('Invalid status.');
    const test = await Test.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!test) throw new Error('Test not found.');
    req.flash('success', `Test status changed to ${status}.`);
    res.redirect(req.get('referer') || '/admin/tests?view=online');
  } catch (e) { req.flash('error', e.message); res.redirect('/admin/tests?view=online'); }
};

// ── SPVN REPORTS / LEADERBOARD / QUESTION ANALYSIS (BATCH 4) ──────────
exports.getAdminLeaderboard = async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId).select('title course subject totalMarks').lean();
    if (!test) { req.flash('error', 'Test not found.'); return res.redirect('/admin/results'); }
    const results = await Result.find({ testId: test._id, status: completedResultStatus })
      .populate('studentId', 'name rollNo email').sort({ score: -1, timeTaken: 1, submittedAt: 1 }).lean();
    const rows = results.map((r, index) => ({
      ...r,
      displayRank: r.rank || index + 1,
      percentage: r.totalMarks ? (Number(r.score || 0) / Number(r.totalMarks)) * 100 : 0,
      accuracy: (Number(r.correctAnswers || 0) + Number(r.wrongAnswers || 0)) ? (Number(r.correctAnswers || 0) / (Number(r.correctAnswers || 0) + Number(r.wrongAnswers || 0))) * 100 : 0,
    }));
    res.render('admin/leaderboard', { title: `Leaderboard - ${test.title}`, test, rows });
  } catch (e) { console.error(e); req.flash('error', 'Unable to load leaderboard.'); res.redirect('/admin/results'); }
};

exports.getQuestionAnalysis = async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId).populate('questions').lean();
    if (!test) { req.flash('error', 'Test not found.'); return res.redirect('/admin/results'); }
    const results = await Result.find({ testId: test._id, status: completedResultStatus }).lean();
    const totalAttempts = results.length;
    const rows = (test.questions || []).map((q, index) => {
      let attempted = 0, correct = 0, wrong = 0, skipped = 0;
      const optionCounts = { A: 0, B: 0, C: 0, D: 0 };
      for (const r of results) {
        const raw = r.answers?.[String(q._id)] ?? r.answers?.[q._id];
        const answer = Array.isArray(raw) ? raw[0] : raw;
        if (!answer) { skipped++; continue; }
        attempted++;
        const selected = String(answer).toUpperCase();
        if (Object.prototype.hasOwnProperty.call(optionCounts, selected)) optionCounts[selected]++;
        if (selected === String(q.correctAnswer).toUpperCase()) correct++; else wrong++;
      }
      return {
        ...q,
        number: index + 1,
        attempted, correct, wrong, skipped,
        accuracy: attempted ? (correct / attempted) * 100 : 0,
        attemptRate: totalAttempts ? (attempted / totalAttempts) * 100 : 0,
        optionCounts,
      };
    });
    const summary = {
      totalAttempts,
      totalQuestions: rows.length,
      avgAccuracy: rows.length ? rows.reduce((s, r) => s + r.accuracy, 0) / rows.length : 0,
      toughest: [...rows].sort((a, b) => a.accuracy - b.accuracy)[0] || null,
      easiest: [...rows].sort((a, b) => b.accuracy - a.accuracy)[0] || null,
    };
    res.render('admin/question-analysis', { title: `Question Analysis - ${test.title}`, test, rows, summary });
  } catch (e) { console.error(e); req.flash('error', 'Unable to load question analysis.'); res.redirect('/admin/results'); }
};

exports.exportResultsPdf = async (req, res) => {
  try {
    const selectedGroupId = String(req.query.groupId || '');
    const selectedTestId = String(req.query.testId || '');
    const query = await resultQueryFrom({ groupId: selectedGroupId, testId: selectedTestId });
    const [rawResults, group, test] = await Promise.all([
      Result.find(query).sort({ score: -1, timeTaken: 1 }).populate('studentId', 'name rollNo').populate('testId', 'title totalMarks').lean(),
      selectedGroupId ? Group.findById(selectedGroupId).lean() : null,
      selectedTestId ? Test.findById(selectedTestId).lean() : null,
    ]);

    let results = [];
    if (selectedGroupId) {
      const batchMembers = await GroupMember.find({ groupId: selectedGroupId, role: 'student' }).populate('userId').lean();
      const batchStudents = batchMembers.map(m => m.userId).filter(Boolean);
      const resultMap = new Map(rawResults.map(r => [r.studentId?._id?.toString(), r]));

      const scoredStudents = batchStudents.map(student => {
        const r = resultMap.get(student._id.toString());
        return { student, r, score: r ? Number(r.score || 0) : -1 };
      });
      scoredStudents.sort((a, b) => b.score - a.score);
      const totalBatchStudents = batchStudents.length;

      results = scoredStudents.map((item, idx) => {
        const { student, r, score } = item;
        const attended = Boolean(r);
        const countLessEqual = scoredStudents.filter(s => s.score <= score && s.score >= 0).length;
        const pct = attended && totalBatchStudents > 0 ? ((countLessEqual / totalBatchStudents) * 100).toFixed(1) + '%' : '0.0%';

        return {
          rank: attended ? idx + 1 : '—',
          name: student.name || '—',
          rollNo: student.rollNo || '—',
          testTitle: r ? (r.testId?.title || test?.title || '') : (test?.title || '—'),
          scoreStr: attended ? `${r.score}/${r.totalMarks || test?.totalMarks || 0}` : 'A',
          percentile: pct,
          status: attended ? (r.status || 'submitted') : 'ABSENT',
          dateStr: r?.submittedAt ? new Date(r.submittedAt).toLocaleDateString('en-IN') : '—',
        };
      });
    } else {
      results = rawResults.map((r, index) => {
        const pct = r.totalMarks ? ((r.score / r.totalMarks) * 100).toFixed(1) + '%' : '0%';
        return {
          rank: r.rank || index + 1,
          name: r.studentId?.name || '',
          rollNo: r.studentId?.rollNo || '',
          testTitle: r.testId?.title || '',
          scoreStr: `${r.score}/${r.totalMarks}`,
          percentile: pct,
          status: r.status || '',
          dateStr: r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('en-IN') : '',
        };
      });
    }

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 36, layout: 'landscape' });
    const filename = `SPVN_Result_Report_${safeFilenamePart(test?.title || group?.name || 'All', 'All')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);
    doc.font('Helvetica-Bold').fontSize(18).text('SPVN CET Portal - Result Report');
    doc.moveDown(0.25).font('Helvetica').fontSize(9).fillColor('#475569')
      .text(`Test: ${test?.title || 'All Tests'}   |   Batch: ${group?.name || 'All Batches'}   |   Generated: ${new Date().toLocaleString('en-IN')}`);
    doc.moveDown(0.7).fillColor('#111827');
    const completed = results.filter(r => r.status !== 'ABSENT').length;
    doc.font('Helvetica-Bold').fontSize(10).text(`Total Students: ${results.length}     Appeared: ${completed}     Absent: ${results.length - completed}`);
    doc.moveDown(0.6);
    const startX = 36, widths = [40, 140, 90, 180, 70, 70, 65, 80];
    const headers = ['Rank', 'Student', 'Roll No', 'Test', 'Score', 'Percentile', 'Status', 'Date'];
    let y = doc.y;
    doc.rect(startX, y, widths.reduce((a, b) => a + b, 0), 22).fill('#0f172a');
    let x = startX;
    headers.forEach((h, i) => { doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8).text(h, x + 4, y + 7, { width: widths[i] - 8 }); x += widths[i]; });
    y += 22;
    results.forEach((r) => {
      if (y > 520) { doc.addPage({ size: 'A4', layout: 'landscape', margin: 36 }); y = 40; }
      const vals = [r.rank, r.name, r.rollNo, r.testTitle, r.scoreStr, r.percentile, r.status, r.dateStr];
      doc.rect(startX, y, widths.reduce((a, b) => a + b, 0), 22).strokeColor('#e2e8f0').stroke();
      x = startX;
      vals.forEach((v, i) => {
        doc.fillColor(r.status === 'ABSENT' && i === 6 ? '#e11d48' : '#1f2937')
          .font(i === 6 ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(7.5)
          .text(String(v), x + 4, y + 7, { width: widths[i] - 8, ellipsis: true });
        x += widths[i];
      });
      y += 22;
    });
    if (!results.length) doc.fillColor('#64748b').fontSize(11).text('No completed results found.', startX, y + 15);
    doc.end();
  } catch (e) { console.error(e); if (!res.headersSent) res.status(500).send('PDF export failed: ' + e.message); }
};

// // ── DOWNLOAD TEST PDF / WORD WITH ANSWERS OR QUESTION PAPER ONLY ──────────────
exports.downloadTestPdfWithAnswers = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id)
      .populate('questions')
      .populate('groups', 'name course')
      .lean();
    if (!test) {
      req.flash('error', 'Test not found.');
      return res.redirect('/admin/tests');
    }

    const format = String(req.query.format || 'pdf').toLowerCase();
    const includeAnswers = req.query.includeAnswers !== 'false';
    const collegeName = process.env.COLLEGE_NAME || 'SPVN CET Examination Portal';
    const subjectsStr = Array.isArray(test.subject) ? test.subject.join(', ') : (test.subject || 'All Subjects');
    const questions = test.questions || [];
    const ansSuffix = includeAnswers ? 'With_Answers' : 'Question_Paper';

    if (format === 'word') {
      const filename = `Test_${safeFilenamePart(test.title, 'Paper')}_${ansSuffix}.doc`;
      let html = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${escapeHtml(test.title)}</title>
<style>
body { font-family: 'Calibri', 'Times New Roman', sans-serif; font-size: 11pt; line-height: 1.45; color: #111; margin: 24px; }
h1 { font-size: 18pt; color: #0f172a; text-align: center; margin-bottom: 4px; }
.meta { font-size: 10pt; color: #64748b; text-align: center; margin-bottom: 20px; border-bottom: 1px solid #cbd5e1; padding-bottom: 10px; }
.question-block { margin-bottom: 18px; page-break-inside: avoid; border-bottom: 1px dashed #e2e8f0; padding-bottom: 12px; }
.q-title { font-weight: bold; font-size: 11pt; color: #0f172a; margin-bottom: 6px; }
.options { margin-left: 18px; margin-top: 6px; }
.opt { margin-bottom: 4px; }
.opt.correct { color: #166534; font-weight: bold; }
.answer-box { background: #f0fdf4; border: 1px solid #86efac; padding: 8px 12px; margin-top: 8px; border-radius: 4px; color: #166534; font-weight: bold; font-size: 10pt; }
.explanation { font-size: 9.5pt; color: #374151; font-weight: normal; margin-top: 6px; }
table.answer-key { border-collapse: collapse; width: 100%; margin-top: 20px; }
table.answer-key td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: center; font-size: 10pt; }
table.answer-key th { background: #0f172a; color: #fff; padding: 8px 10px; font-size: 10pt; }
</style>
</head>
<body>
<h1>${escapeHtml(collegeName)}</h1>
<div class='meta'><b>${escapeHtml(test.title)}</b>${includeAnswers ? ' — With Answers & Solutions' : ' — Question Paper'} | Subject(s): ${escapeHtml(subjectsStr)} | Duration: ${test.duration || 180} Mins | Total Marks: ${test.totalMarks || 0} | Questions: ${questions.length}</div>
`;
      questions.forEach((q, i) => {
        const isCorrectA = includeAnswers && String(q.correctAnswer).trim().toUpperCase() === 'A';
        const isCorrectB = includeAnswers && String(q.correctAnswer).trim().toUpperCase() === 'B';
        const isCorrectC = includeAnswers && String(q.correctAnswer).trim().toUpperCase() === 'C';
        const isCorrectD = includeAnswers && String(q.correctAnswer).trim().toUpperCase() === 'D';
        html += `<div class='question-block'>
<div class='q-title'>Q${i + 1}. [${escapeHtml(q.subject || 'General')}${q.topic ? ' · ' + escapeHtml(q.topic) : ''}] [${q.marks || 1} Mark${q.marks !== 1 ? 's' : ''}${q.negativeMarks ? ', -' + q.negativeMarks : ''}] ${formatMathToWordHtml(q.question)}</div>
<div class='options'>
  <div class='opt ${isCorrectA ? 'correct' : ''}'>A) ${formatMathToWordHtml(q.optionA || '')}</div>
  <div class='opt ${isCorrectB ? 'correct' : ''}'>B) ${formatMathToWordHtml(q.optionB || '')}</div>
  <div class='opt ${isCorrectC ? 'correct' : ''}'>C) ${formatMathToWordHtml(q.optionC || '')}</div>
  <div class='opt ${isCorrectD ? 'correct' : ''}'>D) ${formatMathToWordHtml(q.optionD || '')}</div>
</div>`;
        if (includeAnswers) {
          html += `<div class='answer-box'>✔ Correct Answer: Option (${escapeHtml(q.correctAnswer)})
${q.detailedSolution || q.explanation ? `<div class='explanation'><b>Explanation:</b> ${formatMathToWordHtml(q.detailedSolution || q.explanation)}</div>` : ''}
</div>`;
        }
        html += `</div>`;
      });

      if (includeAnswers) {
        html += `<br style='page-break-before:always;'><h2>Complete Answer Key</h2><table class='answer-key'><tr>`;
        const cols = 5;
        questions.forEach((q, idx) => {
          html += `<td><b>Q${idx + 1}:</b> (${escapeHtml(q.correctAnswer)})</td>`;
          if ((idx + 1) % cols === 0 && idx + 1 < questions.length) html += `</tr><tr>`;
        });
        html += `</tr></table>`;
      }
      html += `</body></html>`;

      res.setHeader('Content-Type', 'application/msword');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(Buffer.from(html, 'utf8'));
    }

    // PDF Format
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const filename = `Test_${safeFilenamePart(test.title, 'Paper')}_${ansSuffix}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const { font: mainFont, fontBold: boldFont } = setupPdfFonts(doc);

    const W = 595.28;
    const pageW = W - 80;

    // Header box
    doc.rect(40, 35, pageW, 65).fill('#0f172a');
    doc.fillColor('#ffffff').fontSize(14).font(boldFont).text(collegeName, 50, 45, { width: pageW - 20, align: 'center' });
    doc.fontSize(12).font(boldFont).text(test.title + (includeAnswers ? ' (With Answers & Solutions)' : ' (Question Paper)'), 50, 63, { width: pageW - 20, align: 'center' });
    doc.fontSize(8.5).font(mainFont).fillColor('#cbd5e1')
      .text(`Subject(s): ${subjectsStr}   |   Duration: ${test.duration || 180} Mins   |   Total Marks: ${test.totalMarks || 0}   |   Questions: ${questions.length}`, 50, 82, { width: pageW - 20, align: 'center' });

    doc.y = 115;
    if (test.instructions) {
      doc.rect(40, doc.y, pageW, 26).fill('#f8fafc').strokeColor('#e2e8f0').stroke();
      doc.fillColor('#334155').fontSize(8.5).font(boldFont).text('Instructions: ', 48, doc.y + 7, { continued: true });
      doc.font(mainFont).text(test.instructions.substring(0, 180), { width: pageW - 20 });
      doc.y += 32;
    }

    questions.forEach((q, idx) => {
      if (doc.y > 640) doc.addPage();

      const qY = doc.y;
      doc.rect(40, qY, pageW, 20).fill('#f1f5f9');
      doc.fillColor('#0f172a').fontSize(9.5).font(boldFont)
        .text(`Question ${idx + 1} (${q.subject || 'General'}${q.topic ? ' · ' + q.topic : ''})`, 48, qY + 5);
      doc.fillColor('#64748b').fontSize(8.5).font(mainFont).text(`[${q.marks || 1} Mark${q.marks !== 1 ? 's' : ''}${q.negativeMarks ? ', -' + q.negativeMarks : ''}]`, 40, qY + 5, { width: pageW - 10, align: 'right' });

      doc.y = qY + 26;
      const cleanQText = formatMathToText(q.question || '');
      doc.fillColor('#1e293b').fontSize(10).font(mainFont).text(cleanQText, 48, doc.y, { width: pageW - 16 });
      doc.moveDown(0.4);

      if (q.questionImage) {
        const fullImgPath = path.join(__dirname, '..', q.questionImage.startsWith('/') ? q.questionImage.slice(1) : q.questionImage);
        if (fs.existsSync(fullImgPath)) {
          try {
            if (doc.y > 620) doc.addPage();
            doc.image(fullImgPath, { fit: [200, 110], align: 'center' });
            doc.moveDown(0.4);
          } catch (err) {}
        }
      }

      const options = [
        { key: 'A', text: formatMathToText(q.optionA || ''), img: q.optionAImage },
        { key: 'B', text: formatMathToText(q.optionB || ''), img: q.optionBImage },
        { key: 'C', text: formatMathToText(q.optionC || ''), img: q.optionCImage },
        { key: 'D', text: formatMathToText(q.optionD || ''), img: q.optionDImage },
      ];

      options.forEach(opt => {
        if (doc.y > 720) doc.addPage();
        const isCorrect = includeAnswers && String(q.correctAnswer).trim().toUpperCase() === opt.key;
        const optY = doc.y;
        if (isCorrect) {
          doc.rect(48, optY, pageW - 16, 18).fill('#dcfce7');
        }
        doc.fillColor(isCorrect ? '#166534' : '#334155').fontSize(9).font(isCorrect ? boldFont : mainFont)
          .text(`(${opt.key}) ${opt.text}`, 54, optY + 4, { width: pageW - 28 });
        doc.y = optY + 20;

        if (opt.img) {
          const fullOptImg = path.join(__dirname, '..', opt.img.startsWith('/') ? opt.img.slice(1) : opt.img);
          if (fs.existsSync(fullOptImg)) {
            try {
              if (doc.y > 680) doc.addPage();
              doc.image(fullOptImg, { fit: [150, 75], align: 'left' });
              doc.moveDown(0.3);
            } catch (err) {}
          }
        }
      });

      if (includeAnswers) {
        if (doc.y > 680) doc.addPage();
        const ansY = doc.y + 2;
        const explanationText = q.detailedSolution || q.explanation;
        const cleanExp = explanationText ? formatMathToText(explanationText) : '';
        let textH = 0;
        if (cleanExp) {
          doc.fontSize(8.5).font(mainFont);
          textH = doc.heightOfString(`Explanation: ${cleanExp}`, { width: pageW - 28 });
        }
        const boxH = cleanExp ? Math.max(36, textH + 16) : 22;
        doc.rect(48, ansY, pageW - 16, boxH).fill('#f0fdf4').strokeColor('#86efac').lineWidth(0.5).stroke();
        doc.fillColor('#15803d').fontSize(8.5).font(boldFont)
          .text(`✔ Correct Answer: Option (${q.correctAnswer})`, 54, ansY + 5);
        if (cleanExp) {
          doc.fillColor('#374151').fontSize(8.5).font(mainFont)
            .text(`Explanation: ${cleanExp}`, 54, ansY + 20, { width: pageW - 28 });
        }
        doc.y = ansY + boxH + 10;
      }
      doc.moveTo(40, doc.y).lineTo(W - 40, doc.y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      doc.y += 10;
    });

    // Final Answer Key Table (only if includeAnswers is true)
    if (includeAnswers) {
      doc.addPage();
      doc.rect(40, 40, pageW, 28).fill('#0f172a');
      doc.fillColor('#ffffff').fontSize(12).font(boldFont).text('COMPLETE ANSWER KEY', 40, 48, { width: pageW, align: 'center' });
      doc.y = 80;

      const colsPerRow = 5;
      const colWidth = pageW / colsPerRow;
      let currX = 40, currY = doc.y;

      questions.forEach((q, idx) => {
        if (currY > 740) {
          doc.addPage();
          currY = 40;
        }
        doc.rect(currX, currY, colWidth - 4, 22).fill(idx % 2 === 0 ? '#f8fafc' : '#ffffff').strokeColor('#cbd5e1').lineWidth(0.5).stroke();
        doc.fillColor('#0f172a').fontSize(9).font(boldFont)
          .text(`Q${idx + 1}: `, currX + 6, currY + 6, { continued: true });
        doc.fillColor('#16a34a').text(`(${q.correctAnswer})`);

        if ((idx + 1) % colsPerRow === 0) {
          currX = 40;
          currY += 24;
        } else {
          currX += colWidth;
        }
      });
    }

    doc.end();
  } catch (e) {
    console.error('downloadTestPdfWithAnswers error:', e);
    if (!res.headersSent) {
      req.flash('error', 'Download failed: ' + e.message);
      res.redirect('/admin/tests');
    }
  }
};

// ── EXPORT QUESTION BANK (PDF & WORD) ─────────────────────────────────────────
exports.exportQuestionBank = async (req, res) => {
  try {
    const format = String(req.query.format || 'pdf').toLowerCase();
    const limitParam = req.query.limit;
    const subject = req.query.subject;
    const difficulty = req.query.difficulty;
    const includeAnswers = req.query.includeAnswers !== 'false';

    const query = { isActive: true };
    if (subject && subject !== 'All') query.subject = subject;
    if (difficulty && difficulty !== 'All') query.difficulty = difficulty;

    let qQuery = Question.find(query).sort({ subject: 1, topic: 1, createdAt: -1 });
    if (limitParam && limitParam !== 'all' && Number(limitParam) > 0) {
      qQuery = qQuery.limit(Number(limitParam));
    }
    const questions = await qQuery.lean();

    const timestamp = new Date().toISOString().slice(0, 10);
    const countLabel = limitParam && limitParam !== 'all' ? `${questions.length}_Questions` : 'All_Questions';
    const subjLabel = subject && subject !== 'All' ? subject : 'Question_Bank';
    const ansSuffix = includeAnswers ? 'With_Answers' : 'Question_Paper';

    if (format === 'word') {
      const filename = `SPVN_${subjLabel}_${countLabel}_${ansSuffix}_${timestamp}.doc`;
      let html = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${escapeHtml(subjLabel)} Question Bank</title>
<style>
body { font-family: 'Calibri', 'Times New Roman', sans-serif; font-size: 11pt; line-height: 1.45; color: #111; margin: 20px; }
h1 { font-size: 18pt; color: #0f172a; text-align: center; margin-bottom: 4px; }
.meta { font-size: 10pt; color: #64748b; text-align: center; margin-bottom: 24px; border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; }
.question-block { margin-bottom: 18px; page-break-inside: avoid; border-bottom: 1px dashed #e2e8f0; padding-bottom: 12px; }
.q-title { font-weight: bold; font-size: 11pt; color: #0f172a; margin-bottom: 6px; }
.options { margin-left: 18px; margin-top: 6px; }
.opt { margin-bottom: 4px; }
.opt.correct { color: #166534; font-weight: bold; }
.answer-box { background: #f0fdf4; border: 1px solid #86efac; padding: 6px 10px; margin-top: 8px; border-radius: 4px; color: #166534; font-weight: bold; font-size: 10pt; }
.explanation { font-size: 9.5pt; color: #374151; font-weight: normal; margin-top: 4px; }
</style>
</head>
<body>
<h1>SPVN CET Portal — Question Bank</h1>
<div class='meta'>Subject: ${escapeHtml(subject || 'All Subjects')}${includeAnswers ? ' (With Answers & Solutions)' : ' (Questions Only)'} | Total Questions: ${questions.length} | Generated: ${new Date().toLocaleDateString('en-IN')}</div>
`;
      questions.forEach((q, i) => {
        html += `<div class='question-block'>
<div class='q-title'>Q${i + 1}. [${escapeHtml(q.subject || 'General')}${q.topic ? ' · ' + escapeHtml(q.topic) : ''}] [${escapeHtml(q.difficulty || 'Medium')}] [${q.marks || 1} Mark] ${formatMathToWordHtml(q.question)}</div>
<div class='options'>
  <div class='opt ${includeAnswers && q.correctAnswer === 'A' ? 'correct' : ''}'>A) ${formatMathToWordHtml(q.optionA || '')}</div>
  <div class='opt ${includeAnswers && q.correctAnswer === 'B' ? 'correct' : ''}'>B) ${formatMathToWordHtml(q.optionB || '')}</div>
  <div class='opt ${includeAnswers && q.correctAnswer === 'C' ? 'correct' : ''}'>C) ${formatMathToWordHtml(q.optionC || '')}</div>
  <div class='opt ${includeAnswers && q.correctAnswer === 'D' ? 'correct' : ''}'>D) ${formatMathToWordHtml(q.optionD || '')}</div>
</div>`;
        if (includeAnswers) {
          html += `<div class='answer-box'>✔ Correct Answer: (${escapeHtml(q.correctAnswer)})
${q.detailedSolution || q.explanation ? `<div class='explanation'><b>Explanation:</b> ${formatMathToWordHtml(q.detailedSolution || q.explanation)}</div>` : ''}
</div>`;
        }
        html += `</div>`;
      });
      html += `</body></html>`;

      res.setHeader('Content-Type', 'application/msword');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(Buffer.from(html, 'utf8'));
    }

    // PDF Format
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const filename = `SPVN_${subjLabel}_${countLabel}_${ansSuffix}_${timestamp}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const { font: mainFont, fontBold: boldFont } = setupPdfFonts(doc);

    const W = 595.28;
    const pageW = W - 80;

    doc.rect(40, 35, pageW, 55).fill('#0f172a');
    doc.fillColor('#ffffff').fontSize(14).font(boldFont).text('SPVN CET Portal — Question Bank', 50, 45, { width: pageW - 20, align: 'center' });
    doc.fontSize(9).font(mainFont).fillColor('#94a3b8')
      .text(`Subject: ${subject || 'All Subjects'}   |   ${includeAnswers ? 'With Answers & Solutions' : 'Question Paper (Only Questions)'}   |   Total: ${questions.length} Question(s)   |   Date: ${new Date().toLocaleDateString('en-IN')}`, 50, 68, { width: pageW - 20, align: 'center' });

    doc.y = 105;

    questions.forEach((q, idx) => {
      if (doc.y > 650) doc.addPage();
      const qY = doc.y;
      doc.rect(40, qY, pageW, 18).fill('#f1f5f9');
      doc.fillColor('#0f172a').fontSize(9).font(boldFont)
        .text(`Q${idx + 1}. [${q.subject}${q.topic ? ' · ' + q.topic : ''}]`, 46, qY + 4);
      doc.fillColor('#64748b').fontSize(8).font(mainFont)
        .text(`[${q.difficulty || 'Medium'}] [${q.marks || 1} Mark]`, 40, qY + 4, { width: pageW - 10, align: 'right' });

      doc.y = qY + 22;
      const cleanQ = formatMathToText(q.question || '');
      doc.fillColor('#1e293b').fontSize(9.5).font(mainFont).text(cleanQ, 48, doc.y, { width: pageW - 16 });
      doc.moveDown(0.4);

      const options = [
        { k: 'A', v: formatMathToText(q.optionA || '') },
        { k: 'B', v: formatMathToText(q.optionB || '') },
        { k: 'C', v: formatMathToText(q.optionC || '') },
        { k: 'D', v: formatMathToText(q.optionD || '') },
      ];
      options.forEach(opt => {
        if (doc.y > 730) doc.addPage();
        const isAns = includeAnswers && q.correctAnswer === opt.k;
        const optY = doc.y;
        if (isAns) doc.rect(46, optY, pageW - 12, 16).fill('#dcfce7');
        doc.fillColor(isAns ? '#166534' : '#334155').fontSize(8.5).font(isAns ? boldFont : mainFont)
          .text(`(${opt.k}) ${opt.v}`, 52, optY + 3, { width: pageW - 24 });
        doc.y = optY + 18;
      });

      if (includeAnswers) {
        if (doc.y > 700) doc.addPage();
        const aY = doc.y + 2;
        const exp = q.detailedSolution || q.explanation;
        const cleanExp = exp ? formatMathToText(exp) : '';
        let textH = 0;
        if (cleanExp) {
          doc.fontSize(8).font(mainFont);
          textH = doc.heightOfString(`Explanation: ${cleanExp}`, { width: pageW - 24 });
        }
        const bH = cleanExp ? Math.max(32, textH + 16) : 18;
        doc.rect(46, aY, pageW - 12, bH).fill('#f0fdf4').strokeColor('#86efac').lineWidth(0.5).stroke();
        doc.fillColor('#15803d').fontSize(8).font(boldFont).text(`✔ Answer: (${q.correctAnswer})`, 52, aY + 4);
        if (cleanExp) {
          doc.fillColor('#374151').fontSize(8).font(mainFont).text(`Explanation: ${cleanExp}`, 52, aY + 16, { width: pageW - 24 });
        }
        doc.y = aY + bH + 8;
      }

      doc.moveTo(40, doc.y).lineTo(W - 40, doc.y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      doc.y += 8;
    });

    doc.end();
  } catch (e) {
    console.error('exportQuestionBank error:', e);
    if (!res.headersSent) {
      req.flash('error', 'Export failed: ' + e.message);
      res.redirect('/admin/questions');
    }
  }
};

// ── STUDENT INFORMATION (CLASS & DIVISION DIRECTORY) ──────────────────────────
exports.getStudentInfo = async (req, res) => {
  try {
    const { classLevel, division, groupId, search } = req.query;
    const query = { role: 'student', isActive: { $ne: false } };
    if (classLevel && classLevel !== 'All') query.classLevel = classLevel;
    if (division && division !== 'All') query.division = division;

    let students = await User.find(query).sort({ rollNo: 1 }).lean();

    if (groupId && groupId !== 'All' && groupId !== '') {
      const members = await GroupMember.find({ groupId, role: 'student' }).select('userId').lean();
      const memberIds = new Set(members.map(m => m.userId.toString()));
      students = students.filter(s => memberIds.has(s._id.toString()));
    }

    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      students = students.filter(student =>
        (student.name && student.name.toLowerCase().includes(s)) ||
        (student.rollNo && student.rollNo.toLowerCase().includes(s)) ||
        (student.email && student.email.toLowerCase().includes(s)) ||
        (student.parentContact && student.parentContact.includes(s)) ||
        (student.parentContact2 && student.parentContact2.includes(s)) ||
        (student.cetExamNo && student.cetExamNo.toLowerCase().includes(s)) ||
        (student.grNo && student.grNo.toLowerCase().includes(s)) ||
        (student.category && student.category.toLowerCase().includes(s)) ||
        (student.subjectGroup && student.subjectGroup.toLowerCase().includes(s)) ||
        (student.academy && student.academy.toLowerCase().includes(s))
      );
    }

    const sIds = students.map(s => s._id);
    const memberships = sIds.length ? await GroupMember.find({ userId: { $in: sIds }, role: 'student' }).populate('groupId', 'name').lean() : [];
    const batchMap = new Map();
    memberships.forEach(m => {
      const sId = m.userId.toString();
      const arr = batchMap.get(sId) || [];
      if (m.groupId?.name && !arr.includes(m.groupId.name)) arr.push(m.groupId.name);
      batchMap.set(sId, arr);
    });

    students.forEach(s => {
      s.batches = batchMap.get(s._id.toString()) || [];
    });

    const distinctClasses = await User.distinct('classLevel', { role: 'student', isActive: { $ne: false } });
    const distinctDivs = await User.distinct('division', { role: 'student', isActive: { $ne: false } });
    const groups = await Group.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean();
    const whatsappTemplate = await getWhatsAppTemplateValue();

    const allClasses = Array.from(new Set(['11th', '12th', ...distinctClasses.filter(Boolean)])).sort();
    const allDivisions = Array.from(new Set(['A', 'B', 'C', 'D', 'E', ...distinctDivs.filter(Boolean)])).sort();

    res.render('admin/student-info', {
      title: 'Student Information',
      students,
      groups,
      allClasses,
      allDivisions,
      filters: { classLevel: classLevel || '', division: division || '', groupId: groupId || '', search: search || '' },
      whatsappTemplate,
    });
  } catch (e) {
    console.error('getStudentInfo error:', e);
    req.flash('error', 'Failed to load Student Information.');
    res.redirect('/admin/dashboard');
  }
};

exports.bulkImportStudentInfo = async (req, res) => {
  try {
    const uploadedFile = req.files?.excelFile || req.files?.csvFile;
    if (!uploadedFile) {
      req.flash('error', 'Please upload an Excel or CSV file.');
      return res.redirect('/admin/student-info');
    }

    const wb = xlsx.read(uploadedFile.data, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const matrix = xlsx.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

    const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
    const digits = value => clean(value).replace(/\.0$/, '').replace(/\D/g, '');
    const normalizeHeader = value => clean(value).toLowerCase().replace(/[.()'\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
    const parseDateValue = value => {
      if (!value) return null;
      if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
      const raw = clean(value);
      if (!raw) return null;
      if (/^\d+(\.\d+)?$/.test(raw)) {
        const serial = Number(raw);
        if (serial > 20000 && serial < 70000) {
          return new Date(Math.round((serial - 25569) * 86400 * 1000));
        }
      }
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    // Demo sheet has title rows followed by one header row. Find it dynamically.
    let headerIndex = matrix.findIndex(row => {
      const normalized = row.map(normalizeHeader);
      return normalized.some(h => h.includes('roll no')) && normalized.some(h => h.includes('student') && h.includes('name'));
    });
    if (headerIndex < 0) headerIndex = 0;

    const headers = matrix[headerIndex].map(normalizeHeader);
    const indexOf = (...aliases) => headers.findIndex(h => aliases.some(alias => h === alias || h.includes(alias)));
    const col = {
      rollNo: indexOf('roll no'),
      cetExamNo: indexOf('cet exam no'),
      grNo: indexOf('gr no', 'g r no'),
      name: indexOf('students name', 'student name', 'name'),
      aadhaarNo: indexOf('aadhaar no'),
      address: indexOf('address'),
      taluka: indexOf('taluka'),
      district: indexOf('district'),
      pinCode: indexOf('pin code', 'pincode'),
      parent1: indexOf('parent mobile'),
      gender: indexOf('gender'),
      hostel: indexOf('hostel'),
      dob: indexOf('date of birth'),
      category: indexOf('category'),
      bloodGroup: indexOf('blood group'),
      subjectGroup: indexOf('subject group'),
      academy: indexOf('academy'),
    };
    // The demo file intentionally has two columns with the same "Parent's Mobile" header.
    const parentColumns = headers.map((h, i) => h.includes('parent mobile') ? i : -1).filter(i => i >= 0);

    const preHeaderText = matrix.slice(0, Math.max(1, headerIndex)).flat().map(clean).join(' ');
    const initialDivisionMatch = preHeaderText.match(/\bDiv\s*[-:]?\s*([A-Za-z])\b/i);
    let currentDivision = initialDivisionMatch ? initialDivisionMatch[1].toUpperCase() : '';
    // The supplied demo is a 12th Confirmed Admission List.
    const titleText = matrix.slice(0, Math.max(1, headerIndex)).flat().map(clean).join(' ');
    const defaultClass = /12th/i.test(titleText) ? '12th' : (/11th/i.test(titleText) ? '11th' : null);

    let created = 0, updated = 0, skipped = 0;
    for (let r = headerIndex + 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const rowText = row.map(clean).join(' ');
      const divisionMatch = rowText.match(/\bDiv\s*[-:]?\s*([A-Za-z])\b/i);
      if (divisionMatch && !clean(row[col.rollNo])) {
        currentDivision = divisionMatch[1].toUpperCase();
        continue;
      }

      const rollNo = col.rollNo >= 0 ? clean(row[col.rollNo]) : '';
      const name = col.name >= 0 ? clean(row[col.name]) : '';
      if (!rollNo || !name || /roll\s*no/i.test(rollNo) || /students?\s*name/i.test(name)) {
        if (rowText) skipped++;
        continue;
      }

      const parentContact = parentColumns[0] != null ? digits(row[parentColumns[0]]) : '';
      const parentContact2 = parentColumns[1] != null ? digits(row[parentColumns[1]]) : '';
      const payload = {
        name,
        rollNo,
        classLevel: defaultClass,
        division: currentDivision || null,
        cetExamNo: col.cetExamNo >= 0 ? clean(row[col.cetExamNo]) : null,
        grNo: col.grNo >= 0 ? clean(row[col.grNo]) : null,
        aadhaarNo: col.aadhaarNo >= 0 ? digits(row[col.aadhaarNo]) : null,
        address: col.address >= 0 ? clean(row[col.address]) : null,
        taluka: col.taluka >= 0 ? clean(row[col.taluka]) : null,
        district: col.district >= 0 ? clean(row[col.district]) : null,
        pinCode: col.pinCode >= 0 ? digits(row[col.pinCode]) : null,
        parentContact: parentContact || null,
        parentContact2: parentContact2 || null,
        phone: parentContact || parentContact2 || null,
        gender: col.gender >= 0 ? clean(row[col.gender]) : null,
        hostel: col.hostel >= 0 ? clean(row[col.hostel]) : null,
        dateOfBirth: col.dob >= 0 ? parseDateValue(row[col.dob]) : null,
        category: col.category >= 0 ? clean(row[col.category]) : null,
        bloodGroup: col.bloodGroup >= 0 ? clean(row[col.bloodGroup]) : null,
        subjectGroup: col.subjectGroup >= 0 ? clean(row[col.subjectGroup]) : null,
        academy: col.academy >= 0 ? clean(row[col.academy]) : null,
      };

      try {
        let student = await User.findOne({ rollNo });
        if (student) {
          Object.entries(payload).forEach(([key, value]) => {
            if (value !== null && value !== '') student[key] = value;
          });
          await student.save();
          updated++;
        } else {
          const pwd = generatePassword(rollNo);
          student = await User.create({ ...payload, role: 'student', password: pwd, isFirstLogin: true });
          created++;
        }

        // Subject Group / Academy from the demo become useful searchable metadata.
        const batchName = payload.academy || payload.subjectGroup;
        if (batchName) {
          const group = await Group.findOne({ name: new RegExp('^' + batchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'), isActive: { $ne: false } });
          if (group) {
            await GroupMember.findOneAndUpdate(
              { groupId: group._id, userId: student._id },
              { role: 'student' },
              { upsert: true }
            );
          }
        }
      } catch (err) {
        console.error('Student info row import failed:', rollNo, err.message);
        skipped++;
      }
    }

    req.flash('success', `Student Information processed: ${created} created, ${updated} updated, ${skipped} skipped.`);
    res.redirect('/admin/student-info');
  } catch (e) {
    console.error('bulkImportStudentInfo error:', e);
    req.flash('error', 'Import failed: ' + e.message);
    res.redirect('/admin/student-info');
  }
};

exports.downloadStudentInfoTemplate = (req, res) => {
  const rows = [
    {
      'Roll.No.': '11001', 'CET Exam No.': '7711001', 'G.R. No.': '4377', 'Students Name': 'Sample Student',
      "Student's Aadhaar No.": '123456789012', 'Address (A/P)': 'Shardanagar', 'Taluka': 'Baramati', 'District': 'Pune',
      'Pin code': '413115', "Parent's Mobile 1": '9876543210', "Parent's Mobile 2": '9876543211', 'Gender': 'Male',
      'Hostel': 'Yes', 'Date of Birth': '15-06-2009', 'Category': 'OPEN', 'Blood Group': 'O+ve',
      'Subject group': 'Group -1', 'Academy': 'Academy', 'Class': '12th', 'Division': 'A'
    }
  ];
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(rows);
  ws['!cols'] = Array.from({ length: 20 }, (_, i) => ({ wch: i === 3 || i === 5 ? 28 : 16 }));
  xlsx.utils.book_append_sheet(wb, ws, 'StudentInformation');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=student_information_template.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

exports.exportStudentInfoExcel = async (req, res) => {
  try {
    const { classLevel, division, groupId, search } = req.query;
    const query = { role: 'student', isActive: { $ne: false } };
    if (classLevel && classLevel !== 'All') query.classLevel = classLevel;
    if (division && division !== 'All') query.division = division;

    let students = await User.find(query).sort({ rollNo: 1 }).lean();

    if (groupId && groupId !== 'All' && groupId !== '') {
      const members = await GroupMember.find({ groupId, role: 'student' }).select('userId').lean();
      const memberIds = new Set(members.map(m => m.userId.toString()));
      students = students.filter(s => memberIds.has(s._id.toString()));
    }

    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      students = students.filter(student =>
        (student.name && student.name.toLowerCase().includes(s)) ||
        (student.rollNo && student.rollNo.toLowerCase().includes(s))
      );
    }

    const sIds = students.map(s => s._id);
    const memberships = sIds.length ? await GroupMember.find({ userId: { $in: sIds }, role: 'student' }).populate('groupId', 'name').lean() : [];
    const batchMap = new Map();
    memberships.forEach(m => {
      const sId = m.userId.toString();
      const arr = batchMap.get(sId) || [];
      if (m.groupId?.name && !arr.includes(m.groupId.name)) arr.push(m.groupId.name);
      batchMap.set(sId, arr);
    });

    const data = students.map(s => ({
      'Roll No': s.rollNo,
      'CET Exam No': s.cetExamNo || '—',
      'G.R. No': s.grNo || '—',
      'Name': s.name,
      'Aadhaar No': s.aadhaarNo || '—',
      'Address': s.address || '—',
      'Taluka': s.taluka || '—',
      'District': s.district || '—',
      'Pin Code': s.pinCode || '—',
      'Parent Mobile 1': s.parentContact || '—',
      'Parent Mobile 2': s.parentContact2 || '—',
      'Gender': s.gender || '—',
      'Hostel': s.hostel || '—',
      'Date of Birth': s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString('en-IN') : '—',
      'Category': s.category || '—',
      'Blood Group': s.bloodGroup || '—',
      'Subject Group': s.subjectGroup || '—',
      'Academy': s.academy || '—',
      'Class': s.classLevel || '—',
      'Division': s.division || '—',
      'Batch': (batchMap.get(s._id.toString()) || []).join(', ') || '—',
      'Status': s.isFirstLogin ? 'First Login' : 'Active',
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(data);
    ws['!cols'] = Array.from({ length: 22 }, (_, i) => ({ wch: [3,5].includes(i) ? 28 : 16 }));
    xlsx.utils.book_append_sheet(wb, ws, 'Students');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=student_information.xlsx');
    res.send(buf);
  } catch (e) {
    req.flash('error', 'Export failed: ' + e.message);
    res.redirect('/admin/student-info');
  }
};

// ── COMBINED RESULT HELPERS & CONTROLLERS ──────────────────────────────────────
async function buildCombinedResultData(groupId, testIds) {
  const group = await Group.findById(groupId).lean();
  if (!group) throw new Error('Selected batch not found');

  const testIdList = (Array.isArray(testIds) ? testIds : [testIds]).filter(Boolean);
  const tests = await Test.find({ _id: { $in: testIdList }, isActive: { $ne: false } }).lean();
  if (!tests.length) throw new Error('Please select at least one test to combine');

  const memberships = await GroupMember.find({ groupId: group._id, role: 'student' }).populate('userId').lean();
  const students = memberships.map(m => m.userId).filter(Boolean);
  students.sort((a, b) => String(a.rollNo || '').localeCompare(String(b.rollNo || '')));

  const subjectSet = new Set();
  const standardSubjects = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
  tests.forEach(t => {
    const subs = Array.isArray(t.subject) ? t.subject : [t.subject];
    subs.filter(Boolean).forEach(s => subjectSet.add(s));
  });
  const subjects = standardSubjects.filter(s => subjectSet.has(s)).concat([...subjectSet].filter(s => !standardSubjects.includes(s)));

  const studentIds = students.map(s => s._id);
  const results = await Result.find({
    studentId: { $in: studentIds },
    testId: { $in: tests.map(t => t._id) },
    status: completedResultStatus,
  }).lean();

  const resultMap = new Map();
  results.forEach(r => {
    resultMap.set(`${r.studentId.toString()}_${r.testId.toString()}`, r);
  });

  const studentRows = students.map(student => {
    const sId = student._id.toString();
    const subjectMarks = {};
    let totalScore = 0;
    let anyAttended = false;

    subjects.forEach(subject => {
      const subjectTests = tests.filter(t => {
        const subs = Array.isArray(t.subject) ? t.subject : [t.subject];
        return subs.includes(subject);
      });

      let subMarks = 'A';
      for (const t of subjectTests) {
        const r = resultMap.get(`${sId}_${t._id.toString()}`);
        if (r) {
          anyAttended = true;
          if (r.subjectScores && r.subjectScores[subject]) {
            if (r.subjectScores[subject].status !== 'ABSENT') {
              subMarks = Number(r.subjectScores[subject].marks || 0);
              break;
            }
          } else if (r.score !== undefined && r.score !== null) {
            subMarks = Number(r.score);
            break;
          }
        }
      }

      subjectMarks[subject] = subMarks;
      if (subMarks !== 'A') {
        totalScore += Number(subMarks);
      }
    });

    return {
      student,
      rollNo: student.rollNo || '—',
      name: student.name || '—',
      classLevel: student.classLevel || '—',
      division: student.division || '—',
      parentContact: student.parentContact || student.phone || '—',
      subjectMarks,
      total: anyAttended ? totalScore : 'A',
      rawTotal: anyAttended ? totalScore : -1,
      anyAttended,
    };
  });

  studentRows.sort((a, b) => b.rawTotal - a.rawTotal);

  const totalStudents = studentRows.length;
  studentRows.forEach((row, index) => {
    if (!row.anyAttended) {
      row.percentile = '0.00%';
      row.rank = '—';
    } else {
      const countLessEqual = studentRows.filter(r => r.rawTotal <= row.rawTotal && r.anyAttended).length;
      const pct = totalStudents > 0 ? ((countLessEqual / totalStudents) * 100).toFixed(2) : '0.00';
      row.percentile = `${pct}%`;
      row.rank = index + 1;
    }
  });

  return {
    group,
    tests,
    subjects,
    studentRows,
    totalStudents,
    appearedCount: studentRows.filter(r => r.anyAttended).length,
    absentCount: studentRows.filter(r => !r.anyAttended).length,
  };
}

exports.getCombineResult = async (req, res) => {
  try {
    const selectedGroupId = String(req.query.groupId || '');
    const selectedTestIds = Array.isArray(req.query.testIds)
      ? req.query.testIds
      : (req.query.testIds ? [req.query.testIds] : []);

    const [groups, allTests] = await Promise.all([
      Group.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean(),
      Test.find({ isActive: { $ne: false } }).sort({ createdAt: -1 }).lean(),
    ]);

    let combinedData = null;
    let errorMsg = null;
    if (selectedGroupId && selectedTestIds.length > 0) {
      try {
        combinedData = await buildCombinedResultData(selectedGroupId, selectedTestIds);
      } catch (err) {
        errorMsg = err.message;
      }
    }

    res.render('admin/combine-result', {
      title: 'Combine Results',
      groups,
      allTests,
      selectedGroupId,
      selectedTestIds,
      combinedData,
      errorMsg,
    });
  } catch (e) {
    console.error('getCombineResult error:', e);
    req.flash('error', 'Failed to load Combine Results: ' + e.message);
    res.redirect('/admin/results');
  }
};

exports.exportCombineResultExcel = async (req, res) => {
  try {
    const groupId = String(req.query.groupId || '');
    const testIds = Array.isArray(req.query.testIds)
      ? req.query.testIds
      : (req.query.testIds ? [req.query.testIds] : []);

    if (!groupId || !testIds.length) {
      req.flash('error', 'Please select batch and at least one test to export.');
      return res.redirect('/admin/results/combine');
    }

    const { group, tests, subjects, studentRows } = await buildCombinedResultData(groupId, testIds);

    const data = studentRows.map(row => {
      const item = {
        'Roll No': row.rollNo,
        'Name': row.name,
        'Batch': group.name,
      };
      subjects.forEach(sub => {
        item[sub] = row.subjectMarks[sub];
      });
      item['Total'] = row.total;
      item['Percentile'] = row.percentile;
      return item;
    });

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(data);
    const colWidths = [{ wch: 15 }, { wch: 25 }, { wch: 20 }];
    subjects.forEach(() => colWidths.push({ wch: 15 }));
    colWidths.push({ wch: 14 }, { wch: 14 });
    ws['!cols'] = colWidths;
    xlsx.utils.book_append_sheet(wb, ws, 'CombinedResult');

    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Combined_Result_${safeFilenamePart(group.name, 'Batch')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (e) {
    console.error('exportCombineResultExcel error:', e);
    req.flash('error', 'Excel export failed: ' + e.message);
    res.redirect('/admin/results/combine');
  }
};

exports.exportCombineResultPdf = async (req, res) => {
  try {
    const groupId = String(req.query.groupId || '');
    const testIds = Array.isArray(req.query.testIds)
      ? req.query.testIds
      : (req.query.testIds ? [req.query.testIds] : []);

    if (!groupId || !testIds.length) {
      req.flash('error', 'Please select batch and at least one test to export.');
      return res.redirect('/admin/results/combine');
    }

    const { group, tests, subjects, studentRows, totalStudents, appearedCount, absentCount } = await buildCombinedResultData(groupId, testIds);

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 30, layout: 'landscape' });
    const filename = `Combined_Result_${safeFilenamePart(group.name, 'Batch')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    doc.font('Helvetica-Bold').fontSize(16).text('SPVN CET Portal — Combined Result Report');
    doc.moveDown(0.2).font('Helvetica').fontSize(8.5).fillColor('#475569')
      .text(`Batch: ${group.name}   |   Combined Tests: ${tests.map(t => t.title).join(' + ')}   |   Generated: ${new Date().toLocaleString('en-IN')}`);
    doc.moveDown(0.4).fillColor('#111827');
    doc.font('Helvetica-Bold').fontSize(9.5)
      .text(`Total Students: ${totalStudents}     Appeared: ${appearedCount}     Absent: ${absentCount}`);
    doc.moveDown(0.5);

    const startX = 30;
    const baseCols = [35, 85, 140];
    const subColWidth = Math.min(80, Math.floor(300 / Math.max(1, subjects.length)));
    const widths = [...baseCols];
    subjects.forEach(() => widths.push(subColWidth));
    widths.push(65, 75);

    const headers = ['Rank', 'Roll No', 'Student Name', ...subjects, 'Total', 'Percentile'];
    let y = doc.y;
    doc.rect(startX, y, widths.reduce((a, b) => a + b, 0), 22).fill('#0f172a');
    let x = startX;
    headers.forEach((h, i) => {
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8).text(h, x + 4, y + 7, { width: widths[i] - 8 });
      x += widths[i];
    });
    y += 22;

    studentRows.forEach((row) => {
      if (y > 525) { doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 }); y = 40; }
      const vals = [
        row.rank,
        row.rollNo,
        row.name,
        ...subjects.map(s => row.subjectMarks[s]),
        row.total,
        row.percentile,
      ];
      doc.rect(startX, y, widths.reduce((a, b) => a + b, 0), 20).strokeColor('#e2e8f0').stroke();
      x = startX;
      vals.forEach((v, i) => {
        const isAbsentVal = String(v) === 'A';
        doc.fillColor(isAbsentVal ? '#e11d48' : '#1f2937')
          .font(isAbsentVal ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(8)
          .text(String(v), x + 4, y + 6, { width: widths[i] - 8, ellipsis: true });
        x += widths[i];
      });
      y += 20;
    });

    doc.end();
  } catch (e) {
    console.error('exportCombineResultPdf error:', e);
    if (!res.headersSent) res.status(500).send('Combined PDF export failed: ' + e.message);
  }
};

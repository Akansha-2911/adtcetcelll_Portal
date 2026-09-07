const express = require('express');
const router = express.Router();

const c = require('../controllers/adminController');
const questionImport = require('../controllers/questionImportController');
const uploadTestController = require('../controllers/uploadTestController');

const {
  isAuthenticated,
  requireRole,
  requirePasswordChange
} = require('../middleware/auth');

const guard = [
  isAuthenticated,
  requirePasswordChange,
  requireRole('admin')
];

// Dashboard
router.get('/dashboard', ...guard, c.getDashboard);
router.get('/organization', ...guard, c.getOrganization);
router.get('/analytics', ...guard, c.getAnalytics);
router.get('/monitor', ...guard, c.getMonitor);
router.get('/monitor/:id', ...guard, c.getTestMonitor);
router.get('/content', ...guard, c.getContentHub);

// Students
router.get('/students', ...guard, c.getStudents);
router.post('/students', ...guard, c.createStudent);
router.post('/students/bulk-import', ...guard, c.bulkImportStudents);
router.get('/students/:id/view', ...guard, c.viewStudentProfile);
router.post('/students/:id/delete', ...guard, c.deleteStudent);

// Student Information Directory
router.get('/student-info', ...guard, c.getStudentInfo);
router.post('/student-info/bulk-import', ...guard, c.bulkImportStudentInfo);
router.get('/student-info/template/download', ...guard, c.downloadStudentInfoTemplate);
router.get('/student-info/export', ...guard, c.exportStudentInfoExcel);

// Settings
router.get('/settings/whatsapp-template', ...guard, c.getWhatsAppTemplate);
router.post('/settings/whatsapp-template', ...guard, c.saveWhatsAppTemplate);

// Groups
router.get('/groups', ...guard, c.getGroups);
router.post('/groups', ...guard, c.createGroup);
router.get('/groups/template/download', ...guard, c.downloadStudentTemplate);
router.post('/groups/assign-member', ...guard, c.assignMember);
router.get('/groups/:id', ...guard, c.getGroupDetail);
router.post('/groups/:id', ...guard, c.updateGroup);
router.post('/groups/:id/delete', ...guard, c.deleteGroup);
router.get('/groups/:id/credentials-pdf', ...guard, c.exportGroupCredentials);
router.post('/groups/:id/bulk-import', ...guard, c.bulkImportStudents);
router.post('/groups/:id/add-student', ...guard, c.createStudent);
router.post('/groups/:id/students/:studentId/remove', ...guard, c.removeStudentFromGroup);
router.post('/groups/:id/students/:studentId/move', ...guard, c.moveStudentToGroup);

// Syllabus
router.get('/topics', ...guard, c.getTopics);
router.post('/topics', ...guard, c.createTopic);
router.post('/topics/import-pdf', ...guard, c.importSyllabusPdf);
router.post('/topics/:id', ...guard, c.updateTopic);
router.post('/topics/:id/delete', ...guard, c.deleteTopic);

// AJAX
router.get('/ajax/subjects/:course', ...guard, c.getSubjectsForCourse);
router.get('/ajax/topics', ...guard, c.getTopicsForSubject);
router.get('/ajax/subtopics', ...guard, c.getSubtopicsForTopic);
router.get('/ajax/test-questions', ...guard, c.getTestQuestionsAjax);

// Smart Question Scan
router.get('/questions/smart-import', ...guard, questionImport.getSmartImport);
router.post('/questions/smart-import/scan', ...guard, questionImport.scanQuestionFiles);
router.get('/questions/smart-import/:id/review', ...guard, questionImport.getSmartImportReview);
router.post('/questions/smart-import/:id/commit', ...guard, questionImport.commitSmartImport);
router.post('/questions/smart-import/:id/discard', ...guard, questionImport.discardSmartImport);

// Question Bank
router.get('/questions', ...guard, c.getQuestions);
router.get('/questions/export', ...guard, c.exportQuestionBank);
router.post('/questions', ...guard, c.createQuestion);
router.post('/questions/bulk-import', ...guard, c.bulkImportQuestions);
router.get('/questions/template/download', ...guard, c.downloadQuestionTemplate);
router.get('/questions/:id/edit', ...guard, c.getEditQuestion);
router.post('/questions/:id/edit', ...guard, c.updateQuestion);
router.delete('/questions/:id', ...guard, c.deleteQuestion);
router.post('/questions/:id/delete', ...guard, c.deleteQuestion);

// Tests
router.get('/tests', ...guard, c.getTests);
router.get('/tests/upload', ...guard, (req, res) => res.redirect('/admin/tests/upload-test'));
router.get('/tests/create', ...guard, c.getCreateTest);
router.get('/tests/combine', ...guard, c.getCombineTest);
router.get('/tests/workflow', ...guard, (req, res) => res.redirect('/admin/tests'));
router.post('/tests/combine', ...guard, c.combineTests);
router.post('/tests', ...guard, c.createTest);
router.post('/tests/upload-pdf', ...guard, c.uploadPdfTest);
router.get('/tests/template/pdf', ...guard, c.downloadPdfTestTemplate);
router.get('/tests/template/answer-key', ...guard, c.downloadAnswerKeyTemplate);

// New Upload Test workflow
router.get('/tests/upload-test', ...guard, uploadTestController.getUploadPage);
router.post('/tests/upload-test/extract', ...guard, uploadTestController.extractTest);
router.get('/tests/upload-test/review/:sessionId', ...guard, uploadTestController.getReview);
router.post('/tests/upload-test/review/:sessionId', ...guard, uploadTestController.saveReview);
router.get('/tests/upload-test/:sessionId/details', ...guard, uploadTestController.getTestDetails);
router.post('/tests/upload-test/:sessionId/create', ...guard, uploadTestController.createDraftTest);

// Generic test ID routes MUST remain after upload-test
router.get('/tests/:id', ...guard, c.getTestDetail);
router.get('/tests/:id/pdf-answers', ...guard, c.downloadTestPdfWithAnswers);
router.get('/tests/:id/edit', ...guard, c.getEditTest);
router.post('/tests/:id/edit', ...guard, c.updateTest);
router.post('/tests/:id/delete', ...guard, c.deleteTest);
router.get('/tests/:id/marking-template', ...guard, c.getMarkingTemplate);
router.get('/tests/:id/publish-setup', ...guard, c.getPublishSetup);
// Backward-compatible GET: old UI links used /publish directly.
router.get('/tests/:id/publish', ...guard, (req, res) => res.redirect(`/admin/tests/${req.params.id}/publish-setup`));
router.post('/tests/:id/publish-setup', ...guard, c.publishDraftTest);
router.post('/tests/:id/marking-template', ...guard, c.updateMarkingTemplate);
router.post('/tests/:id/assign-batches', ...guard, c.assignTestBatches);
router.post('/tests/:id/publish', ...guard, c.publishTest);
router.post('/tests/:id/status', ...guard, c.updateTestStatus);

// Results
router.get('/results', ...guard, c.getAllResults);
router.get('/results/combine', ...guard, c.getCombineResult);
router.get('/results/combine/excel', ...guard, c.exportCombineResultExcel);
router.get('/results/combine/pdf', ...guard, c.exportCombineResultPdf);
router.get('/results/export', ...guard, c.exportResultsExcel);
router.get('/results/export-pdf', ...guard, c.exportResultsPdf);
router.get('/results/leaderboard/:testId', ...guard, c.getAdminLeaderboard);
router.get('/results/question-analysis/:testId', ...guard, c.getQuestionAnalysis);

// Documents
router.get('/documents', ...guard, c.getDocuments);
router.post('/documents/:id/delete', ...guard, c.deleteDocument);

module.exports = router;
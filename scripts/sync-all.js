const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..');

const targetDirs = [
  'C:\\Users\\akans\\Downloads\\SPVN_CET_Portal_FINAL',
  'C:\\Users\\akans\\Downloads\\SPVN_CET_Portal_FINAL_PRODUCTION_READY_V4_QUESTION_BANK_SCAN\\SPVN_CET_Portal_FINAL',
  'C:\\Users\\akans\\Downloads\\SPVN_CET_Portal_FINAL_PRODUCTION_READY_V4_QUESTION_BANK_SCAN',
  'C:\\Users\\akans\\OneDrive\\Documents\\SPVN_CET_Portal_FINAL_PRODUCTION_READY_V4_QUESTION_BANK_SCAN\\SPVN_CET_Portal_FINAL',
  'C:\\Users\\akans\\OneDrive\\Documents\\SPVN_CET_Portal_FINAL_PRODUCTION_READY_V4_QUESTION_BANK_SCAN\\SPVN_CET_Portal_FINAL_PRODUCTION_READY_V5\\SPVN_CET_Portal_FINAL',
  'C:\\Users\\akans\\OneDrive\\Documents\\SPVN_CET_Portal_FINAL_PRODUCTION_READY_V4_QUESTION_BANK_SCAN'
];

const modifiedRelFiles = [
  'models/Setting.js',
  'models/index.js',
  'models/User.js',
  'routes/admin.js',
  'controllers/adminController.js',
  'views/partials/sidebar-admin.ejs',
  'views/admin/student-info.ejs',
  'views/admin/combine-result.ejs',
  'views/admin/students.ejs',
  'views/admin/tests.ejs',
  'views/admin/test-detail.ejs',
  'views/admin/questions.ejs',
  'views/admin/results.ejs',
  'views/student/practice-attempt.ejs',
  'views/student/practice-result.ejs',
  'utils/mathFormatter.js',
  'scripts/verify.js',
  'scripts/test-render.js'
];

console.log('Source directory:', srcDir);

for (const target of targetDirs) {
  try {
    if (path.resolve(target) === path.resolve(srcDir)) continue;
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }

    // Copy entire directories if they don't exist at target (like models, views, routes, etc.)
    const subdirs = ['models', 'views', 'routes', 'controllers', 'config', 'middleware', 'public', 'scripts', 'utils'];
    for (const sub of subdirs) {
      const srcSub = path.join(srcDir, sub);
      const targetSub = path.join(target, sub);
      if (fs.existsSync(srcSub)) {
        fs.cpSync(srcSub, targetSub, { recursive: true });
      }
    }

    // Also copy top-level files
    const topFiles = ['app.js', 'package.json', '.env'];
    for (const f of topFiles) {
      const srcF = path.join(srcDir, f);
      const targetF = path.join(target, f);
      if (fs.existsSync(srcF)) {
        fs.copyFileSync(srcF, targetF);
      }
    }

    // Ensure all modified files are explicitly updated
    for (const rel of modifiedRelFiles) {
      const srcFile = path.join(srcDir, rel);
      const targetFile = path.join(target, rel);
      if (fs.existsSync(srcFile)) {
        fs.mkdirSync(path.dirname(targetFile), { recursive: true });
        fs.copyFileSync(srcFile, targetFile);
        console.log(`[Synced] -> ${targetFile}`);
      }
    }
    console.log(`Successfully synced to: ${target}`);
  } catch (err) {
    console.error(`Error syncing to ${target}:`, err.message);
  }
}

console.log('\nAll targets synchronized successfully.');

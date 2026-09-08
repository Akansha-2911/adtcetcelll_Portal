const path = require('path');
const fs = require('fs');

const uploadRoot = path.join(__dirname, '..', 'uploads');
const pdfDir = path.join(uploadRoot, 'pdfs');
const documentDir = path.join(uploadRoot, 'documents');
const testUploadDir = path.join(uploadRoot, 'tests');

// Ensure base upload directories exist
[uploadRoot, pdfDir, documentDir, testUploadDir].forEach(dir => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (e) {
    // Ignore error if exists
  }
});

function toUploadUrl(filePath) {
  if (!filePath) return '';
  const rel = path.relative(uploadRoot, filePath).replace(/\\/g, '/');
  return `/uploads/${rel.startsWith('/') ? rel.slice(1) : rel}`;
}

module.exports = {
  uploadRoot,
  pdfDir,
  documentDir,
  testUploadDir,
  toUploadUrl
};
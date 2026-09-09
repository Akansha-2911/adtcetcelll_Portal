// middleware/auth.js
// Authentication and role-based access control middleware


/**
 * Checks if user is logged in
 */
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }

  req.flash(
    'error',
    'Please login to access this page.'
  );

  return res.redirect('/auth/login');
};


/**
 * Redirect already logged-in users
 */
const isGuest = (req, res, next) => {
  if (req.session && req.session.user) {
    return res.redirect(
      `/${req.session.user.role}/dashboard`
    );
  }

  return next();
};


/**
 * Force password change after:
 * - first login
 * - admin password reset
 */
const requirePasswordChange = (req, res, next) => {
  if (
    req.session &&
    req.session.user &&
    req.session.user.isFirstLogin
  ) {
    const currentPath =
      req.originalUrl ||
      req.url ||
      '';

    const allowedPaths = [
      '/auth/change-password',
      '/auth/logout'
    ];

    const allowed =
      allowedPaths.some(path =>
        currentPath.startsWith(path)
      );

    if (!allowed) {
      req.flash(
        'warning',
        'You must change your password before proceeding.'
      );

      return res.redirect(
        '/auth/change-password'
      );
    }
  }

  return next();
};


/**
 * Role-based access control
 */
const requireRole = (roles) => {
  const allowedRoles =
    Array.isArray(roles)
      ? roles
      : [roles];

  return (req, res, next) => {
    if (
      !req.session ||
      !req.session.user
    ) {
      req.flash(
        'error',
        'Please login to access this page.'
      );

      return res.redirect(
        '/auth/login'
      );
    }

    if (
      !allowedRoles.includes(
        req.session.user.role
      )
    ) {
      req.flash(
        'error',
        'Access denied. Insufficient permissions.'
      );

      return res.redirect(
        `/${req.session.user.role}/dashboard`
      );
    }

    return next();
  };
};


/**
 * Global data available to every EJS page
 */
const attachUser = (req, res, next) => {
  res.locals.currentUser =
    req.session?.user || null;

  res.locals.requestPath =
    req.path;

  res.locals.collegeName =
    process.env.COLLEGE_NAME ||
    'CET Exam Portal';

  res.locals.collegeShort =
    process.env.COLLEGE_SHORT_NAME ||
    'CET';

  res.locals.academicYear =
    process.env.ACADEMIC_YEAR ||
    '2024-25';

  res.locals.collegeLogo =
    process.env.COLLEGE_LOGO_PATH ||
    '/spvn-logo.png';

  res.locals.collegeAddress =
    process.env.COLLEGE_ADDRESS ||
    '';

  res.locals.successMsg =
    req.flash('success');

  res.locals.errorMsg =
    req.flash('error');

  res.locals.warningMsg =
    req.flash('warning');

  res.locals.infoMsg =
    req.flash('info');

  return next();
};


/**
 * Error handler
 */
const errorHandler = (
  err,
  req,
  res,
  next
) => {
  console.error(
    '❌ Error:',
    err.stack || err
  );

  const statusCode =
    err.status || 500;

  res.locals.currentUser = res.locals.currentUser || req.session?.user || null;
  res.locals.requestPath = res.locals.requestPath || req.path || '';
  res.locals.collegeName = res.locals.collegeName || process.env.COLLEGE_NAME || 'CET Exam Portal';
  res.locals.collegeShort = res.locals.collegeShort || process.env.COLLEGE_SHORT_NAME || 'CET';
  res.locals.academicYear = res.locals.academicYear || process.env.ACADEMIC_YEAR || '2024-25';
  res.locals.collegeLogo = res.locals.collegeLogo || process.env.COLLEGE_LOGO_PATH || '/spvn-logo.png';
  res.locals.collegeAddress = res.locals.collegeAddress || process.env.COLLEGE_ADDRESS || '';

  return res
    .status(statusCode)
    .render(
      'error',
      {
        title: 'Error',

        message:
          process.env.NODE_ENV === 'production' &&
          statusCode >= 500
            ? 'Something went wrong. Please try again.'
            : (
                err.message ||
                'Something went wrong!'
              ),

        statusCode,

        error:
          process.env.NODE_ENV === 'development'
            ? err
            : {}
      }
    );
};


/**
 * 404 handler
 */
const notFound = (req, res) => {
  res.locals.currentUser = res.locals.currentUser || req.session?.user || null;
  res.locals.requestPath = res.locals.requestPath || req.path || '';
  res.locals.collegeName = res.locals.collegeName || process.env.COLLEGE_NAME || 'CET Exam Portal';
  res.locals.collegeShort = res.locals.collegeShort || process.env.COLLEGE_SHORT_NAME || 'CET';
  res.locals.academicYear = res.locals.academicYear || process.env.ACADEMIC_YEAR || '2024-25';
  res.locals.collegeLogo = res.locals.collegeLogo || process.env.COLLEGE_LOGO_PATH || '/spvn-logo.png';
  res.locals.collegeAddress = res.locals.collegeAddress || process.env.COLLEGE_ADDRESS || '';

  return res
    .status(404)
    .render(
      'error',
      {
        title: '404 - Page Not Found',

        message:
          'The page you are looking for does not exist.',

        statusCode: 404,

        error: {}
      }
    );
};


module.exports = {
  isAuthenticated,
  isGuest,
  requireRole,
  requirePasswordChange,
  attachUser,
  errorHandler,
  notFound
};
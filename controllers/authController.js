// controllers/authController.js
const { User } = require('../models');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function setAuthenticatedSession(req, user, cb) {
  req.session.regenerate((err) => {
    if (err) return cb(err);
    req.session.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      rollNo: user.rollNo,
      role: user.role,
      isFirstLogin: user.isFirstLogin,
      profilePhoto: user.profilePhoto,
    };
    req.session.save(cb);
  });
}

exports.getAdminLogin = (req, res) =>
  res.render('auth/admin-login', { title: 'Admin Login — ' + (process.env.COLLEGE_SHORT_NAME || 'CET') + ' Portal' });

exports.postAdminLogin = async (req, res) => {
  try {
    const email = normalizeText(req.body.email).toLowerCase();
    const password = normalizeText(req.body.password);
    if (!email || !password) { req.flash('error', 'Email and password are required.'); return res.redirect('/auth/admin'); }
    const user = await User.findOne({ email, role: 'admin' });
    if (!user || !user.isActive) { req.flash('error', 'Invalid admin credentials.'); return res.redirect('/auth/admin'); }
    const valid = await user.verifyPassword(password);
    if (!valid) { req.flash('error', 'Invalid admin credentials.'); return res.redirect('/auth/admin'); }
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
    setAuthenticatedSession(req, user, (sessionErr) => {
      if (sessionErr) { console.error('Admin session error:', sessionErr); req.flash('error', 'Login failed.'); return res.redirect('/auth/admin'); }
      if (user.isFirstLogin) { req.flash('warning', 'Please change your default password.'); return res.redirect('/auth/change-password'); }
      req.flash('success', `Welcome, ${user.name}!`);
      return res.redirect('/admin/dashboard');
    });
  } catch (err) { console.error('Admin login error:', err); req.flash('error', 'Login failed.'); return res.redirect('/auth/admin'); }
};

exports.getLogin = (req, res) =>
  res.render('auth/login', { title: 'Login — ' + (process.env.COLLEGE_SHORT_NAME || 'CET') + ' Portal' });

exports.postLogin = async (req, res) => {
  try {
    const identifier = normalizeText(req.body.identifier);
    const password = normalizeText(req.body.password);
    if (!identifier || !password) { req.flash('error', 'Roll number and password are required.'); return res.redirect('/auth/login'); }
    const user = await User.findOne({ rollNo: identifier, role: 'student' });
    if (!user || !user.isActive) { req.flash('error', 'Invalid credentials or account inactive.'); return res.redirect('/auth/login'); }
    const valid = await user.verifyPassword(password);
    if (!valid) { req.flash('error', 'Invalid credentials or account inactive.'); return res.redirect('/auth/login'); }
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
    setAuthenticatedSession(req, user, (sessionErr) => {
      if (sessionErr) { console.error('Student session error:', sessionErr); req.flash('error', 'Login failed.'); return res.redirect('/auth/login'); }
      if (user.isFirstLogin) { req.flash('warning', 'Please change your default password.'); return res.redirect('/auth/change-password'); }
      req.flash('success', `Welcome back, ${user.name}!`);
      return res.redirect('/student/dashboard');
    });
  } catch (err) { console.error('Login error:', err); req.flash('error', 'Login failed.'); return res.redirect('/auth/login'); }
};

exports.getChangePassword = (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  res.render('auth/change-password', { title: 'Change Password', user: req.session.user });
};

exports.postChangePassword = async (req, res) => {
  try {
    const currentPassword = normalizeText(req.body.currentPassword);
    const newPassword = normalizeText(req.body.newPassword);
    const confirmPassword = normalizeText(req.body.confirmPassword);

    if (!req.session.user) {
      req.flash('error', 'Please login first.');
      return res.redirect('/auth/login');
    }

    if (!newPassword || !confirmPassword) {
      req.flash('error', 'New password and confirm password are required.');
      return res.redirect('/auth/change-password');
    }

    if (newPassword !== confirmPassword) {
      req.flash('error', 'Passwords do not match.');
      return res.redirect('/auth/change-password');
    }

    if (newPassword.length < 6) {
      req.flash('error', 'Password must be at least 6 characters.');
      return res.redirect('/auth/change-password');
    }

    const user = await User.findById(req.session.user.id);

    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/auth/login');
    }

    /*
      If this is NOT first login,
      verify old/current password.
    */
    if (!user.isFirstLogin) {
      if (!currentPassword) {
        req.flash('error', 'Current password is required.');
        return res.redirect('/auth/change-password');
      }

      const valid = await user.verifyPassword(currentPassword);

      if (!valid) {
        req.flash('error', 'Current password is incorrect.');
        return res.redirect('/auth/change-password');
      }
    }

    /*
      IMPORTANT:
      Same User document is updated.
      Student _id does NOT change.
      Therefore tests/results/history stay connected.
    */
    user.password = newPassword;

    user.isFirstLogin = false;

    // ADD THESE
    user.passwordChangedAt = new Date();
    user.passwordResetByAdmin = false;

    await user.save();

    /*
      Update current session too
    */
    req.session.user.isFirstLogin = false;

    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    req.flash('success', 'Password changed successfully!');

    return res.redirect(`/${req.session.user.role}/dashboard`);

  } catch (err) {
    console.error('Change password error:', err);

    req.flash('error', 'Failed to change password.');

    return res.redirect('/auth/change-password');
  }
};

exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err);
    res.clearCookie('connect.sid');
    return res.redirect('/auth/login');
  });
};

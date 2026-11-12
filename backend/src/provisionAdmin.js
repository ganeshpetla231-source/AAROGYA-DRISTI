require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { validatePassword } = require('./services/authService');
const { User, AuditLog } = require('./models');

async function provisionAdmin() {
  const name = String(process.env.INITIAL_ADMIN_NAME || '').trim();
  const email = String(process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const staffId = String(process.env.INITIAL_ADMIN_STAFF_ID || '').trim().toUpperCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD || '';

  if (!name || name.length > 120) throw new Error('Set INITIAL_ADMIN_NAME to a name of at most 120 characters');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Set INITIAL_ADMIN_EMAIL to a valid email address');
  if (!/^[A-Z0-9][A-Z0-9._/-]{1,39}$/.test(staffId)) throw new Error('Set INITIAL_ADMIN_STAFF_ID to a valid 2–40 character ID');
  validatePassword(password);

  await connectDB();

  let user;
  try {
    user = await User.create({
      name, email, staffId, passwordHash: await bcrypt.hash(password, 12),
      role: 'admin', approvalStatus: 'approved', isActive: true
    });
    await AuditLog.create({
      actor: user._id,
      action: 'admin.initial_account_provisioned',
      resourceType: 'User',
      resourceId: user._id
    });
  } catch (error) {
    if (user) await User.deleteOne({ _id: user._id });
    if (error?.code === 11000) throw new Error('An account with this email or administrator ID already exists');
    throw error;
  }
  console.log(`Initial administrator provisioned: ${user.staffId} (${user._id})`);
}

provisionAdmin()
  .catch(error => {
    console.error(`Administrator provisioning failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

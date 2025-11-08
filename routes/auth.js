const express = require('express');
const router = express.Router();
const db = require('../db');

// 🧠 تخزين مؤقت للأكواد OTP
const otps = {};

// دالة توليد كود تحقق عشوائي من 4 أرقام
function generateOTP(len = 4) {
  return Math.floor(Math.pow(10, len - 1) + Math.random() * 9 * Math.pow(10, len - 1)).toString();
}

// تنظيف الأكواد المنتهية كل 5 دقائق
setInterval(() => {
  const now = Date.now();
  for (const key in otps) {
    if (otps[key].expiresAt <= now) delete otps[key];
  }
}, 5 * 60 * 1000);

// 🔹 المرحلة الأولى: تسجيل الدخول
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const sql = 'SELECT id, fullname FROM users WHERE username = ? AND password = ?';

  db.query(sql, [username, password], (err, result) => {
    if (err) return res.status(500).send('خطأ في الخادم');
    if (result.length > 0) {
      const user = result[0];
      res.json({ success: true, message: 'تم تسجيل الدخول بنجاح', userId: user.id, fullname: user.fullname });
    } else {
      res.json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
  });
});

// 🔹 المرحلة الثانية: تأكيد الهوية وتوليد كود تحقق عشوائي
router.post('/verify-identity', (req, res) => {
  const { fullname, national_id, phone, userId } = req.body;
  if (!fullname || !national_id || !phone) {
    return res.json({ success: false, message: 'الرجاء إدخال جميع الحقول' });
  }

  const sql = 'SELECT id FROM users WHERE fullname = ? AND national_id = ? AND phone = ?';
  db.query(sql, [fullname, national_id, phone], (err, result) => {
    if (err) return res.status(500).send('خطأ في الخادم');
    if (result.length > 0) {
      const uid = result[0].id || userId;
      const otp = generateOTP();
      const expiresAt = Date.now() + 5 * 60 * 1000; // صلاحية 5 دقائق

      otps[`uid:${uid}`] = { code: otp, expiresAt };
      console.log(`🔐 رمز التحقق للمستخدم ${uid}: ${otp}`);

      // نعيد الكود فقط لأغراض التجربة (في الواقع يتم إرساله عبر SMS أو بريد)
      res.json({ success: true, message: 'تم إرسال رمز التحقق', otp });
    } else {
      res.json({ success: false, message: 'بيانات الهوية غير صحيحة' });
    }
  });
});

// 🔹 المرحلة الثالثة: التحقق من الكود وإعادة التوجيه
router.post('/verify-code', (req, res) => {
  const { userId, code } = req.body;

  if (!userId || !code) {
    return res.json({ success: false, message: 'يرجى إدخال الكود ومعرّف المستخدم' });
  }

  const record = otps[`uid:${userId}`];
  if (!record) return res.json({ success: false, message: 'لا يوجد كود صالح أو انتهت صلاحيته' });

  if (Date.now() > record.expiresAt) {
    delete otps[`uid:${userId}`];
    return res.json({ success: false, message: 'انتهت صلاحية الكود' });
  }

  if (record.code === code) {
    delete otps[`uid:${userId}`];
    // ✅ عند نجاح التحقق — أعد رابط التحويل
    return res.json({
      success: true,
      message: 'تم التحقق بنجاح',
      redirect: '/dashboard.html'
    });
  } else {
    return res.json({ success: false, message: 'الرمز غير صحيح' });
  }
});

module.exports = router;

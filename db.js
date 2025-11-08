const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost',
  user: '',      // غيّرها حسب إعدادك
  password: '',      // كلمة المرور إن وجدت
  database: 'training_platform'
});

db.connect(err => {
  if (err) throw err;
  console.log('✅ تم الاتصال بقاعدة البيانات بنجاح');
});

module.exports = db;


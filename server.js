// server.js (محدث - مع دمج نظام OTP + التقييم + عرض النتائج)
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");

const app = express();  
app.use(cors());
app.use(express.json());
app.use(express.static("public")); // مجلد يحتوي صفحات HTML

// ---------- الاتصال بقاعدة البيانات ----------
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "training_platform"
});

db.connect(err => {
  if (err) console.error("❌ فشل الاتصال بقاعدة البيانات:", err);
  else console.log("✅ تم الاتصال بقاعدة البيانات بنجاح");
});

// ---------- تخزين OTP مؤقت ----------
const otps = {};
function generateOTP(len = 4) {
  return Math.floor(Math.pow(10, len - 1) + Math.random() * 9 * Math.pow(10, len - 1)).toString();
}
setInterval(() => {
  const now = Date.now();
  for (const k of Object.keys(otps)) {
    if (otps[k].expiresAt <= now) delete otps[k];
  }
}, 60 * 1000);

// ---------- المسارات الأساسية ----------

// 🟢 اختبار السيرفر
app.get("/", (req, res) => {
  res.send("🚀 السيرفر يعمل بنجاح على http://localhost:3000");
});
// app.get("/", (req, res) => {
//   res.sendFile(__dirname + "/public/index-multi.html");
// });


// 🟦 المرحلة 1: التحقق من الدخول
app.post("/login-step1", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: "يرجى إرسال اسم المستخدم وكلمة المرور" });

  const sql = "SELECT id, username, fullname FROM users WHERE username = ? AND password = ?";
  db.query(sql, [username, password], (err, results) => {
    if (err) return res.status(500).json({ message: "خطأ في الخادم" });
    if (results.length === 0)
      return res.status(401).json({ message: "بيانات الدخول غير صحيحة" });

    const user = results[0];
    res.json({ success: true, message: "تم التحقق من المرحلة الأولى", userId: user.id, username: user.username, fullname: user.fullname });
  });
});

// 🟨 المرحلة 2: توليد OTP
app.post("/login-step2", (req, res) => {
  const { userId, fullname, national_id, phone } = req.body;
  function respondWithOtp(key, otp) {
    const expiresAt = Date.now() + 5 * 60 * 1000;
    otps[key] = { code: otp, expiresAt, attempts: 0 };
    console.log(`🔐 OTP for ${key}: ${otp}`);
    res.json({ success: true, message: "تم إرسال رمز التحقق، يرجى إدخاله لإكمال تسجيل الدخول.", code: otp });
  }

  if (userId) {
    db.query("SELECT id FROM users WHERE id = ?", [userId], (err, results) => {
      if (err) return res.status(500).json({ message: "خطأ في الخادم" });
      if (results.length === 0) return res.status(404).json({ message: "المستخدم غير موجود" });
      const key = `uid:${userId}`;
      respondWithOtp(key, generateOTP(4));
    });
  } else {
    if (!fullname || !national_id || !phone)
      return res.status(400).json({ message: "يرجى إرسال الاسم، رقم الهوية ورقم الجوال" });

    const sql = "SELECT id FROM users WHERE fullname = ? AND national_id = ? AND phone = ?";
    db.query(sql, [fullname, national_id, phone], (err, results) => {
      if (err) return res.status(500).json({ message: "خطأ في الخادم" });
      if (results.length === 0)
        return res.status(401).json({ message: "بيانات الهوية غير صحيحة" });
      const key = `uid:${results[0].id}`;
      respondWithOtp(key, generateOTP(4));
    });
  }
});

// 🟩 المرحلة 3: التحقق من OTP
app.post("/login-step3", (req, res) => {
  const { userId, inputCode } = req.body;
  if (!userId || !inputCode)
    return res.status(400).json({ message: "يرجى إرسال userId و inputCode" });

  const key = `uid:${userId}`;
  const record = otps[key];
  if (!record) return res.status(400).json({ message: "لا يوجد رمز صالح أو انتهت صلاحيته" });

  if (Date.now() > record.expiresAt) {
    delete otps[key];
    return res.status(400).json({ message: "انتهت صلاحية رمز التحقق" });
  }

  if (record.attempts >= 5) {
    delete otps[key];
    return res.status(429).json({ message: "تجاوزت عدد المحاولات" });
  }

  if (String(record.code) === String(inputCode).trim()) {
    delete otps[key];
    res.json({ success: true, message: "✅ تم التحقق بنجاح، سيتم نقلك إلى الصفحة الرئيسية.", redirect: "/dashboard.html" });
  } else {
    record.attempts++;
    res.status(400).json({ message: "❌ رمز التحقق غير صحيح" });
  }
});

// 🧩 جلب بيانات لوحة التحكم
app.get("/dashboard-data", (req, res) => {
  const data = {
    user: { username: "زائر المنصة" },
    progress: 0,
    completedCourses: 0,
    totalCourses: 0,
    programs: [],
    certificates: [],
    jobs: []
  };

  db.query("SELECT name FROM programs LIMIT 5", (err, programs) => {
    if (err) return res.status(500).json({ error: "خطأ في البرامج" });
    data.programs = programs.map(p => p.name);

    db.query("SELECT title, company FROM jobs LIMIT 5", (err, jobs) => {
      if (err) return res.status(500).json({ error: "خطأ في الوظائف" });
      data.jobs = jobs.map(j => ({ title: j.title, company: j.company }));
      res.json(data);
    });
  });
});

// // 🧠 استمارة تقييم المهارات (Assessment)
// app.post("/submit-assessment", (req, res) => {
//   const { name, city, education, skills, hours, goal } = req.body;
//   if (!name || !education) {
//     return res.status(400).json({ success: false, message: "الرجاء إدخال جميع الحقول المطلوبة" });
//   }

//   const sql = `INSERT INTO assessments (name, city, education, skills, hours, goal) VALUES (?, ?, ?, ?, ?, ?)`;
//   db.query(sql, [name, city, education, skills.join(", "), hours, goal], err => {
//     if (err) {
//       console.error(err);
//       return res.status(500).json({ success: false, message: "خطأ أثناء الحفظ" });
//     }

//     // 🔍 توليد برامج مقترحة ذكية
//     const suggestions = [];
//     if (skills.includes("تطوير ويب")) suggestions.push("أساسيات HTML وCSS وJavaScript");
//     if (skills.includes("تصميم جرافيك")) suggestions.push("احتراف التصميم باستخدام Canva وPhotoshop");
//     if (skills.includes("إدارة مشاريع")) suggestions.push("دورة إدارة المشاريع الحديثة");
//     if (skills.includes("مبيعات وخدمة عملاء")) suggestions.push("فن التواصل وخدمة العملاء");
//     if (suggestions.length === 0) suggestions.push("دورة المهارات الرقمية الأساسية");

//     res.json({ success: true, message: "تم حفظ التقييم بنجاح ✅", programs: suggestions });
//   });
// });

// // 🧱 إنشاء جدول التقييمات
// app.get("/create-assessment-table", (req, res) => {
//   const sql = `
//     CREATE TABLE IF NOT EXISTS assessments (
//       id INT AUTO_INCREMENT PRIMARY KEY,
//       name VARCHAR(255),
//       city VARCHAR(255),
//       education VARCHAR(255),
//       skills TEXT,
//       hours INT,
//       goal TEXT,
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     )
//   `;
//   db.query(sql, err => {
//     if (err) return res.status(500).send("خطأ في إنشاء الجدول");
//     res.send("✅ تم إنشاء جدول التقييمات بنجاح");
//   });
// });


 // فرص العمل
        // const jobList = document.getElementById("jobList");
        // jobList.innerHTML = "";
        // data.jobs.forEach(job => {
        //   const div = document.createElement("div");
        //   div.className = "col-md-6";
        //   div.innerHTML = `
        //     <div class="card p-3">
        //       <h6>وظيفة: ${job.title}</h6>
        //       <p class="text-muted">${job.company}</p>
        //       <button class="btn  btn-primary btn-sm" onclick="window.location.href='assessment.html?jobId=${job.id}'">تقديم الآن</button>
        //     </div>`;
        //   jobList.appendChild(div);
    
        // });
      

// 🔹 جلب بيانات المستخدم من قاعدة البيانات
app.get("/user-profile/:id", (req, res) => {
  const userId = req.params.id;

  const sql = "SELECT username, fullname, national_id, phone FROM users WHERE id = ?";
  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error("خطأ أثناء جلب بيانات المستخدم:", err);
      return res.status(500).json({ success: false, message: "خطأ في الخادم" });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
    }

    res.json({                   
      success: true,
      user: results[0]
    });
  });
});

app.use(express.static("public"));


// 📊 مسار لوحة تحكم المدير
app.get("/admin-dashboard", (req, res) => {
  // عدد المستخدمين
  db.query("SELECT COUNT(*) AS usersCount FROM users", (err, usersRes) => {
    if (err) return res.json({ success: false, message: "خطأ في جلب عدد المستخدمين" });

    // جلب باقي الإحصاءات (اختياري)
    db.query("SELECT COUNT(*) AS jobsCount FROM jobs", (err2, jobsRes) => {
      if (err2) return res.json({ success: false, message: "خطأ في جلب الوظائف" });

      db.query("SELECT COUNT(*) AS programsCount FROM programs", (err3, progRes) => {
        if (err3) return res.json({ success: false, message: "خطأ في جلب البرامج" });

        db.query("SELECT COUNT(*) AS assessmentsCount FROM assessments", (err4, assessRes) => {
          if (err4) return res.json({ success: false, message: "خطأ في جلب التقييمات" });

          // جلب قائمة المستخدمين
          db.query("SELECT id, fullname, username, national_id, phone FROM users", (err5, usersList) => {
            if (err5) return res.json({ success: false, message: "خطأ في جلب قائمة المستخدمين" });

            res.json({
              success: true,
              stats: {
                users: usersRes[0].usersCount,
                jobs: jobsRes[0].jobsCount,
                programs: progRes[0].programsCount,
                assessments: assessRes[0].assessmentsCount
              },
              users: usersList
            });
          });
        });
      });
    });
  });
});

// ✅ مسار إحضار عدد المستخدمين
app.get("/admin-dashboard", (req, res) => {
  const query = "SELECT COUNT(*) AS totalUsers FROM users";

  db.query(query, (err, result) => {
    if (err) {
      console.error("خطأ في جلب البيانات:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    // ✅ أرجع النتيجة للواجهة
    res.json({ success: true, totalUsers: result[0].totalUsers });
  });
});

// 🗑️ حذف مستخدم
app.delete("/delete-user/:id", (req, res) => {
  const id = req.params.id;
  db.query("DELETE FROM users WHERE id = ?", [id], (err, result) => {
    if (err) return res.json({ success: false });
    res.json({ success: true });
  });
});

    

// 🚀 تشغيل السيرفر
// const PORT = 3000;
// app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`));
// 📊 إرجاع عدد المستخدمين للوحة المدير
app.get("/api/admin-dashboard", (req, res) => {
  const query = "SELECT COUNT(*) AS totalUsers FROM users";

  db.query(query, (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    res.json({ success: true, totalUsers: result[0].totalUsers });
  });
});

// 🎓 لوحة تحكم المدرب
app.get("/api/trainer-dashboard", (req, res) => {
  // استبدل هذا بالمدرب الحقيقي لاحقًا (من الجلسة أو تسجيل الدخول)
  const trainerUsername = "trainer1";

  const query = `
    SELECT 
      (SELECT COUNT(*) FROM courses WHERE trainer = ?) AS totalCourses,
      (SELECT COUNT(DISTINCT student_id) FROM enrollments e 
        JOIN courses c ON e.course_id = c.id 
        WHERE c.trainer = ?) AS totalStudents,
      (SELECT ROUND(AVG(rating), 1) FROM evaluations e 
        JOIN courses c ON e.course_id = c.id 
        WHERE c.trainer = ?) AS avgRating
  `;

  db.query(query, [trainerUsername, trainerUsername, trainerUsername], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    // استعلام آخر لجلب قائمة الدورات
    db.query("SELECT id, title FROM courses WHERE trainer = ?", [trainerUsername], (err2, courses) => {
      if (err2) {
        console.error("Error fetching courses:", err2);
        return res.status(500).json({ success: false, message: "Database error" });
      }

      res.json({
        success: true,
        trainer: trainerUsername,
        totalCourses: result[0].totalCourses,
        totalStudents: result[0].totalStudents,
        avgRating: result[0].avgRating || 0,
        courses
      });
    });
  });
});

// 🎓 عرض بيانات لوحة تحكم المدرب
app.get("/api/trainer-dashboard", (req, res) => {
  const trainerUsername = "trainer1"; // لاحقًا ستأخذ من الجلسة

  const statsQuery = `
    SELECT 
      (SELECT COUNT(*) FROM courses WHERE trainer = ?) AS totalCourses,
      (SELECT COUNT(DISTINCT student_id) FROM enrollments e 
       JOIN courses c ON e.course_id = c.id 
       WHERE c.trainer = ?) AS totalStudents,
      (SELECT ROUND(AVG(rating),1) FROM evaluations e 
       JOIN courses c ON e.course_id = c.id 
       WHERE c.trainer = ?) AS avgRating
  `;

  db.query(statsQuery, [trainerUsername, trainerUsername, trainerUsername], (err, stats) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });

    db.query("SELECT * FROM courses WHERE trainer = ?", [trainerUsername], (err2, courses) => {
      if (err2) return res.status(500).json({ success: false, message: "Database error" });

      res.json({
        success: true,
        trainer: trainerUsername,
        totalCourses: stats[0].totalCourses,
        totalStudents: stats[0].totalStudents,
        avgRating: stats[0].avgRating || 0,
        courses
      });
    });
  });
});


// 🆕 إضافة دورة جديدة
app.post("/api/add-course", (req, res) => {
  const { title, description } = req.body;
  const trainer = "trainer1"; // ثابت مؤقتًا

  if (!title) return res.status(400).json({ success: false, message: "اسم الدورة مطلوب" });

  db.query("INSERT INTO courses (title, description, trainer) VALUES (?, ?, ?)", 
  [title, description, trainer], (err, result) => {
    if (err) {
      console.error("Error adding course:", err);
      return res.status(500).json({ success: false });
    }
    res.json({ success: true, message: "تمت إضافة الدورة بنجاح ✅" });
  });
});


// ✏️ تعديل دورة
app.put("/api/edit-course/:id", (req, res) => {
  const { id } = req.params;
  const { title, description } = req.body;

  db.query("UPDATE courses SET title=?, description=? WHERE id=?", 
  [title, description, id], (err) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true, message: "تم تعديل الدورة ✅" });
  });
});


// ❌ حذف دورة
app.delete("/api/delete-course/:id", (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM courses WHERE id=?", [id], (err) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true, message: "تم حذف الدورة 🗑️" });
  });
});

app.get("/trainer-dashboard-data", (req, res) => {
  const trainerId = 1; // مؤقتًا نستخدم رقم مدرب ثابت

  const sql = `
    SELECT 
      (SELECT COUNT(*) FROM courses WHERE trainer_id = ?) AS totalCourses,
      (SELECT COUNT(DISTINCT student_id) FROM enrollments WHERE trainer_id = ?) AS totalStudents,
      (SELECT AVG(rating) FROM course_reviews WHERE trainer_id = ?) AS avgRating
  `;

  db.query(sql, [trainerId, trainerId, trainerId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json({
      name: "المدرب أحمد",
      totalCourses: results[0].totalCourses,
      totalStudents: results[0].totalStudents,
      avgRating: results[0].avgRating || 0,
      courses: ["مهارات التواصل", "القيادة الناجحة", "إدارة الوقت"]
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

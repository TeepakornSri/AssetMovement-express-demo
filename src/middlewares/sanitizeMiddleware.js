const sanitizeHtml = require('sanitize-html');

// ฟังก์ชันสำหรับ sanitize ข้อมูลที่เป็น object
function sanitizeObject(obj) {
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      // อนุญาตทุกอักขระในข้อความโดยไม่แปลงเป็น HTML entities
      obj[key] = sanitizeHtml(obj[key], {
        allowedTags: [], // ไม่อนุญาตแท็ก HTML ใด ๆ
        allowedAttributes: {}, // ไม่อนุญาต attributes ใด ๆ
        textFilter: (text) => text, // ไม่แปลงข้อความใด ๆ
      });
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]); // sanitize ข้อมูลที่เป็น object ซ้อนกัน
    }
  }
}

module.exports = (req, res, next) => {
  // sanitize ข้อมูลใน req.body
  if (req.body) {
    sanitizeObject(req.body);
  }

  // sanitize ข้อมูลใน req.query
  if (req.query) {
    sanitizeObject(req.query);
  }

  // sanitize ข้อมูลใน req.params
  if (req.params) {
    sanitizeObject(req.params);
  }

  next();
};

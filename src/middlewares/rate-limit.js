// const { rateLimit } = require("express-rate-limit");

// module.exports = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   limit: 100,
//   message: "Too many request from this IP",
// });



const { rateLimit } = require("express-rate-limit");

module.exports = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 นาที
  max: 100, // จำนวนคำขอสูงสุดในช่วงเวลา
  message: "Too many requests from this IP, please try again after 15 minutes.", // ข้อความที่จะแสดงเมื่อถูกบล็อก
  standardHeaders: true, // ส่งข้อมูล rate limit ผ่านทาง headers ของคำขอ
  legacyHeaders: false, // ไม่ส่งข้อมูล rate limit ผ่าน X-RateLimit-* headers
  handler: (req, res) => {
    // ปรับแต่งการตอบสนองเมื่อมีการเกินจำนวนคำขอ
    res.status(429).json({
      error: "Too many requests, please try again later.",
      retryAfter: `${Math.ceil(req.rateLimit.resetTime - Date.now()) / 1000} seconds`,
    });
  },
  skipFailedRequests: true, // ไม่เพิ่มจำนวนคำขอในกรณีที่คำขอล้มเหลว
  keyGenerator: (req) => {
    // ใช้ IP ของผู้ใช้งานเป็นค่าเริ่มต้นสำหรับการบล็อกคำขอ
    return req.ip;
  },
});

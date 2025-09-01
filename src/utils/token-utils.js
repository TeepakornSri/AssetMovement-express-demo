// asset_movement_express/src/utils/token-utils.js

const jwt = require('jsonwebtoken');

// ค่าความลับสำหรับการสร้าง JWT token (ควรใช้ค่าจาก environment variables)
const JWT_SECRET = process.env.JWT_SECRET_KEY || 'qwertyuiopasdfghjklzxcvbnm';

// ระยะเวลาที่ token มีอายุการใช้งาน (7 วัน)
const TOKEN_EXPIRY = '7d';

/**
 * ฟังก์ชันสำหรับสร้าง token สำหรับใช้ในการอนุมัติ/ปฏิเสธเอกสาร
 * @param {Object} data ข้อมูลที่จะเก็บใน token
 * @param {string} data.documentNumber เลขที่เอกสาร
 * @param {string} data.code รหัสผู้ใช้ที่จะทำการอนุมัติ/ปฏิเสธ
 * @param {string} data.email อีเมลของผู้อนุมัติ
 * @param {string} data.actionType ประเภทการกระทำ (approve หรือ reject)
 * @param {number} data.step ลำดับขั้นของการอนุมัติ
 * @param {string} data.role บทบาทของผู้อนุมัติ (origin, destination, etc.)
 * @returns {string} token ที่สร้างขึ้น
 */
const generateApprovalToken = (data) => {
  // ตรวจสอบข้อมูลที่จำเป็น
  if (!data.documentNumber) throw new Error('ต้องระบุเลขที่เอกสาร');
  if (!data.code) throw new Error('ต้องระบุรหัสผู้ใช้');
  if (!data.actionType) throw new Error('ต้องระบุประเภทการกระทำ');
  if (!data.step) throw new Error('ต้องระบุลำดับขั้นของการอนุมัติ');
  
  // สร้าง token ด้วย jwt
  return jwt.sign(data, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
};

/**
 * ฟังก์ชันสำหรับตรวจสอบความถูกต้องของ token
 * @param {string} token token ที่ต้องการตรวจสอบ
 * @returns {Object|null} ข้อมูลที่ถูกเก็บใน token หรือ null ถ้า token ไม่ถูกต้อง
 */
const verifyApprovalToken = (token) => {
  try {
    // ตรวจสอบและถอดรหัส token
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการตรวจสอบ token:', error);
    return null;
  }
};

module.exports = {
  generateApprovalToken,
  verifyApprovalToken
};
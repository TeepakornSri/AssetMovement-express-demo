const Joi = require("joi");

const loginSchema = Joi.object({
  code: Joi.string().required(),  
  password: Joi.string().required(),
});

exports.loginSchema = loginSchema;

// Password schema: at least 6 characters, contains at least 1 uppercase letter, and at least 1 special character
const passwordSchema = Joi.string()
  .min(6) // ความยาวอย่างน้อย 6 ตัวอักษร
  .pattern(new RegExp('(?=.*[A-Z])')) // ต้องมีตัวอักษรตัวใหญ่ 1 ตัว
  .pattern(new RegExp('(?=.*[!@#$%^&*()_+\\-\\=\\[\\]{};":\'\\|,.<>\\/?])')) // ต้องมีเครื่องหมายพิเศษ 1 ตัว
  .required()
  .messages({
    'string.min': 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',
    'string.pattern.base': 'รหัสผ่านต้องมีอย่างน้อย 1 ตัวอักษรตัวใหญ่ และ 1 เครื่องหมายพิเศษ',
  });

exports.passwordSchema = passwordSchema;


exports.passwordSchema = passwordSchema;

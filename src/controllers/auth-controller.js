// login.js
const bcrypt = require("bcryptjs");
const JWT = require("jsonwebtoken");
const { loginSchema, passwordSchema } = require("../validators/auth-validator");
const prisma = require("../models/prisma");
const createError = require("../utils/create-error");


exports.login = async (req, res, next) => {
  try {
    const { code, password } = req.body;

    if (code === "testsystem" && password === "1234") {
      let demoUser;

      demoUser = await prisma.user.findUnique({
        where: {
          code: "testsystem",
        },
      });

      if (!demoUser) {
        try {
          demoUser = await prisma.user.create({
            data: {
              code: "testsystem",
              role_code: "admin",
              password: "1234",
              passwordExpiry: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
              createdAt: new Date(),
              modifyDate: new Date(),
              nameEng: "Test Admin",
              nameThai: "ผู้ดูแลระบบทดสอบ",
              Contact_Email: "test@example.com",
              firstAdd: "YES",
              status: "ACTIVE",
              case_action: null,
              prefix_id: null,
              prefix: null,
              prefix_th: null,
              position_id: null,
              name: "Test",
              surname: "User",
              surname_th: "ผู้ใช้งาน",
              department_id: null,
              location_id: null,
              location: null,
              ref_depot_code: null,
              create_by: "system",
              modify_by: "system",
            },
          });
        } catch (dbError) {
          if (dbError.code === 'P2003') {
              return next(createError(`Failed to create demo user: Missing related data for ${dbError.meta.field_name}.`, 500));
          }
          return next(createError("Failed to create demo user due to database error.", 500));
        }
      }

      if (!demoUser || !demoUser.id || !demoUser.role_code) {
        return next(createError("Demo user data is incomplete after creation/lookup.", 500));
      }

      const userWithoutPassword = { ...demoUser };
      delete userWithoutPassword.password;

      const payload = { userId: demoUser.id, role: demoUser.role_code };
      const accessToken = JWT.sign(
        payload,
        process.env.JWT_SECRET_KEY || "qwertyuasdfghzxcvbn",
        { expiresIn: process.env.JWT_EXPIRE || '1h' }
      );

      return res.status(200).json({ accessToken, user: userWithoutPassword });
    }

    return next(createError("Invalid username or password.", 401));

  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });
    
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
};

exports.adduser = async (req, res, next) => {
  try {
    const {
      userId,
      password,
      nameEng,
      nameThai,
      Contact_Email,
      role_code,
      name,
      surname,
      name_th,
      surname_th,
      status,
      prefix_id,
      prefix,
      prefix_th,
      ref_depot_code,
      case_action
    } = req.body;

    // ตรวจสอบข้อมูลที่จำเป็น
    if (!userId || !password || !nameEng || !nameThai) {
      return next(createError("ข้อมูลไม่ครบถ้วน กรุณากรอก userId, password, nameEng และ nameThai", 400));
    }

    // ตรวจสอบว่า userId ซ้ำหรือไม่
    const existingUser = await prisma.user.findUnique({
      where: { code: userId }
    });

    if (existingUser) {
      return next(createError("User ID นี้มีในระบบแล้ว", 400));
    }

    // ตรวจสอบว่า ref_depot_code มีอยู่จริงหรือไม่
    if (ref_depot_code) {
      const depot = await prisma.depot.findUnique({
        where: { Code: ref_depot_code }
      });
      if (!depot) {
        return next(createError("ไม่พบข้อมูลคลังที่ระบุ", 400));
      }
    }

    // เข้ารหัสพาสเวิร์ด
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // กำหนดวันหมดอายุของรหัสผ่าน (90 วัน)
    const passwordExpiry = new Date();
    passwordExpiry.setDate(passwordExpiry.getDate() + 90);

    // สร้างผู้ใช้ใหม่
    const newUser = await prisma.user.create({
      data: {
        code: userId,
        password: hashedPassword,
        passwordExpiry: passwordExpiry,
        role_code: role_code || "user",
        nameEng: nameEng,
        nameThai: nameThai,
        Contact_Email: Contact_Email,
        name: name,
        surname: surname,
        name_th: name_th,
        surname_th: surname_th,
        prefix_id: prefix_id ? parseInt(prefix_id) : null,
        prefix: prefix,
        prefix_th: prefix_th,
        ref_depot_code: ref_depot_code || null,
        status: status === "ACTIVE" ? "ACTIVE" : "NOT_ACTIVE",
        case_action: case_action || null,
        firstAdd: "YES",
        create_by: req.user?.code || "system", // ถ้ามีข้อมูลผู้ใช้ที่ login อยู่
        modify_by: req.user?.code || "system"
      }
    });

    // ส่งข้อมูลกลับไปยังผู้ใช้
    res.status(201).json({ 
      message: "สร้างผู้ใช้สำเร็จ", 
      user: {
        id: newUser.id,
        code: newUser.code,
        role: newUser.role_code,
        nameEng: newUser.nameEng,
        nameThai: newUser.nameThai,
        prefix: newUser.prefix,
        prefix_th: newUser.prefix_th,
        ref_depot_code: newUser.ref_depot_code,
        case_action: newUser.case_action,
        email: newUser.Contact_Email,
        status: newUser.status
      } 
    });
    
  } catch (err) {
    next(createError(err.message, 500));
  }
};


exports.verifyToken = async (req, res, next) => {
  const { token, code } = req.query;

  if (!token || !code) {
    return res.status(400).json({ message: 'Token or code is missing' });
  }

  try {
    const decoded = JWT.verify(token, process.env.JWT_SECRET_KEY);

    if (decoded.code !== code) {
      return res.status(401).json({ message: 'Invalid token or code' });
    }

    return res.status(200).json({ message: 'Token is valid' });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};


exports.getAllUser = async (req, res, next) => {
  try {
    // ดึงข้อมูลผู้ใช้ทั้งหมด
    const users = await prisma.user.findMany({
      select: {
        id: true,
        code: true,
        role_code: true,
        nameEng: true,
        nameThai: true,
        Contact_Email: true,
        status: true,
        prefix: true,
        prefix_th: true,
        name: true,
        surname: true,
        name_th: true,
        surname_th: true,
        ref_depot_code: true,
        depot: {
          select: {
            Name: true
          }
        },
        department: {
          select: {
            department: true
          }
        },
        position: {
          select: {
            position: true
          }
        },
        createdAt: true
      },
      orderBy: {
        code: 'asc'
      }
    });

    // แปลงข้อมูลให้อยู่ในรูปแบบที่ต้องการ
    const formattedUsers = users.map(user => ({
      id: user.id,
      code: user.code,
      role_code: user.role_code,
      nameEng: user.nameEng,
      nameThai: user.nameThai,
      email: user.Contact_Email,
      status: user.status,
      prefix: user.prefix,
      prefix_th: user.prefix_th,
      name: user.name,
      surname: user.surname,
      name_th: user.name_th,
      surname_th: user.surname_th,
      ref_depot_code: user.ref_depot_code,
      depot_name: user.depot?.Name || null,
      department: user.department?.department || null,
      position: user.position?.position || null,
      createdAt: user.createdAt
    }));

    // ส่งข้อมูลกลับไปยังผู้ใช้
    res.json({
      users: formattedUsers,
      count: formattedUsers.length
    });
    
  } catch (err) {
    next(createError(err.message, 500));
  }
};

// เพิ่มฟังก์ชันสำหรับดึงข้อมูลผู้ใช้รายบุคคล
exports.getUser = async (req, res, next) => {
  try {
    const { userid } = req.params;
    
    // ดึงข้อมูลผู้ใช้จาก code
    const user = await prisma.user.findUnique({
      where: { code: userid },
      include: {
        depot: {
          select: {
            Name: true
          }
        },
        department: {
          select: {
            department: true
          }
        },
        position: {
          select: {
            position: true
          }
        }
      }
    });
    
    if (!user) {
      return next(createError("ไม่พบข้อมูลผู้ใช้", 404));
    }
    
    // ส่งข้อมูลกลับไปยังผู้ใช้
    res.json({
      user: {
        id: user.id,
        code: user.code,
        role_code: user.role_code,
        nameEng: user.nameEng,
        nameThai: user.nameThai,
        Contact_Email: user.Contact_Email,
        status: user.status,
        prefix_id: user.prefix_id,
        prefix: user.prefix,
        prefix_th: user.prefix_th,
        name: user.name,
        surname: user.surname,
        name_th: user.name_th,
        surname_th: user.surname_th,
        ref_depot_code: user.ref_depot_code,
        depot_name: user.depot?.Name || null,
        department: user.department?.department || null,
        position: user.position?.position || null,
        case_action: user.case_action
      }
    });
    
  } catch (err) {
    next(createError(err.message, 500));
  }
};

// เพิ่มฟังก์ชันสำหรับอัปเดตข้อมูลผู้ใช้
exports.updateUser = async (req, res, next) => {
  try {
    const { userid } = req.params;
    const {
      nameEng,
      nameThai,
      Contact_Email,
      role_code,
      name,
      surname,
      name_th,
      surname_th,
      status,
      prefix_id,
      prefix,
      prefix_th,
      ref_depot_code,
      case_action,
      password
    } = req.body;

    // ตรวจสอบว่าผู้ใช้ที่ต้องการแก้ไขมีอยู่จริงหรือไม่
    const existingUser = await prisma.user.findUnique({
      where: { code: userid }
    });

    if (!existingUser) {
      return next(createError("ไม่พบผู้ใช้ที่ต้องการแก้ไข", 404));
    }

    // ตรวจสอบว่า ref_depot_code มีอยู่จริงหรือไม่
    if (ref_depot_code) {
      const depot = await prisma.depot.findUnique({
        where: { Code: ref_depot_code }
      });
      if (!depot) {
        return next(createError("ไม่พบข้อมูลคลังที่ระบุ", 400));
      }
    }

    // เตรียมข้อมูลสำหรับการอัปเดต
    const dataToUpdate = {
      nameEng: nameEng,
      nameThai: nameThai,
      Contact_Email: Contact_Email,
      role_code: role_code,
      name: name,
      surname: surname,
      name_th: name_th,
      surname_th: surname_th,
      prefix_id: prefix_id ? parseInt(prefix_id) : null,
      prefix: prefix,
      prefix_th: prefix_th,
      ref_depot_code: ref_depot_code || null,
      status: status,
      case_action: case_action || null,
      modifyDate: new Date(),
      modify_by: req.user?.code || "system"
    };

    // ถ้ามีการเปลี่ยนรหัสผ่าน
    if (password) {
      // เข้ารหัสพาสเวิร์ดใหม่
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // กำหนดวันหมดอายุของรหัสผ่าน (90 วัน)
      const passwordExpiry = new Date();
      passwordExpiry.setDate(passwordExpiry.getDate() + 90);
      
      dataToUpdate.password = hashedPassword;
      dataToUpdate.passwordExpiry = passwordExpiry;
    }

    // อัปเดตข้อมูลผู้ใช้
    const updatedUser = await prisma.user.update({
      where: { code: userid },
      data: dataToUpdate
    });

    // ส่งข้อมูลกลับไปยังผู้ใช้
    res.status(200).json({ 
      message: "อัปเดตผู้ใช้สำเร็จ", 
      user: {
        id: updatedUser.id,
        code: updatedUser.code,
        role: updatedUser.role_code,
        nameEng: updatedUser.nameEng,
        nameThai: updatedUser.nameThai,
        prefix: updatedUser.prefix,
        prefix_th: updatedUser.prefix_th,
        ref_depot_code: updatedUser.ref_depot_code,
        case_action: updatedUser.case_action,
        email: updatedUser.Contact_Email,
        status: updatedUser.status
      } 
    });
    
  } catch (err) {
    next(createError(err.message, 500));
  }
};
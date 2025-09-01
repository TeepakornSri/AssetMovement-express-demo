// login.js
const bcrypt = require("bcryptjs");
const JWT = require("jsonwebtoken");
const { loginSchema, passwordSchema } = require("../validators/auth-validator");
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const createError = require("../utils/create-error");

// เพิ่ม API สำหรับดึงข้อมูลคลังทั้งหมด
exports.getDepots = async (req, res, next) => {
  try {
    const depots = await prisma.depot.findMany({
      select: {
        Code: true,
        Name: true
      },
      orderBy: {
        Name: 'asc'
      }
    });
    
    res.json(depots);
  } catch (err) {
    next(createError(err.message, 500));
  }
};

exports.addDepots = async (req, res, next) => {
  try {
    console.log("Received entity_depot data:", req.body);
    
    const {
      Code,
      Name,
      Approval1ref_User,
      ref_User1Name,
      moveApproval1Email,
      Approval2ref_User,
      ref_User2Name,
      moveApproval2Email,
      Approval3ref_User,
      ref_User3Name,
      moveApproval3Email,
      Approval4ref_User,
      ref_User4Name,
      moveApproval4Email,
      Acknowledge_User_Id,
      Acknowledge_User_Name,
      Acknowledge_User_Email,
      repairApproval1UserId,
      repairApproval1Name,
      repairApproval1Email,
      repairApproval2UserId,
      repairApproval2Name,
      repairApproval2Email,
      repairApproval3UserId,
      repairApproval3Name,
      repairApproval3Email,
      repairApproval4UserId,
      repairApproval4Name,
      repairApproval4Email,
      Created_By
    } = req.body;

    console.log("Created_By from request:", Created_By);
    console.log("User from request:", req.user);

    // ตรวจสอบข้อมูลที่จำเป็น
    if (!Code || !Name) {
      return next(createError("กรุณากรอกรหัสคลังและชื่อคลัง", 400));
    }

    // ตรวจสอบว่ารหัสคลังซ้ำหรือไม่
    const existingDepot = await prisma.depot.findUnique({
      where: { Code }
    });

    if (existingDepot) {
      return next(createError("รหัสคลังนี้มีในระบบแล้ว", 400));
    }

    // กำหนด Created_By จากข้อมูลที่ส่งมาหรือจาก req.user
    const createdBy = Created_By || req.user?.code || "system";
    console.log("Final Created_By value:", createdBy);

    // สร้างคลังใหม่
    const newDepot = await prisma.depot.create({
      data: {
        Code,
        Name,
        Approval1ref_User,
        ref_User1Name,
        moveApproval1Email,
        Approval2ref_User,
        ref_User2Name,
        moveApproval2Email,
        Approval3ref_User,
        ref_User3Name,
        moveApproval3Email,
        Approval4ref_User,
        ref_User4Name,
        moveApproval4Email,
        Acknowledge_User_Id,
        Acknowledge_User_Name,
        Acknowledge_User_Email,
        repairApproval1UserId,
        repairApproval1Name,
        repairApproval1Email,
        repairApproval2UserId,
        repairApproval2Name,
        repairApproval2Email,
        repairApproval3UserId,
        repairApproval3Name,
        repairApproval3Email,
        repairApproval4UserId,
        repairApproval4Name,
        repairApproval4Email,
        Created_By: createdBy
      }
    });

    console.log("Created new entity_depot:", newDepot);

    // ส่งข้อมูลกลับไปยังผู้ใช้
    res.status(201).json({
      message: "สร้างคลังสำเร็จ",
      entity_depot: newDepot
    });
  } catch (err) {
    console.error("Error in addDepots:", err);
    next(createError(err.message, 500));
  }
};

// เพิ่มฟังก์ชันสำหรับค้นหาผู้ใช้
exports.searchUsers = async (req, res, next) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.json({ users: [] });
    }
    
    // ค้นหาผู้ใช้จาก code หรือชื่อ
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { code: { contains: query } },
          { nameEng: { contains: query } },
          { nameThai: { contains: query } },
          { name: { contains: query } },
          { surname: { contains: query } },
          { name_th: { contains: query } },
          { surname_th: { contains: query } }
        ]
      },
      select: {
        id: true,
        code: true,
        nameEng: true,
        nameThai: true,
        Contact_Email: true,
        name: true,
        surname: true,
        name_th: true,
        surname_th: true
      },
      take: 10 // จำกัดผลลัพธ์ไม่เกิน 10 รายการ
    });
    
    // จัดรูปแบบข้อมูลสำหรับส่งกลับ
    const formattedUsers = users.map(user => ({
      id: user.id,
      code: user.code,
      displayName: user.nameEng || `${user.name || ''} ${user.surname || ''}`.trim(),
      displayNameThai: user.nameThai || `${user.name_th || ''} ${user.surname_th || ''}`.trim(),
      email: user.Contact_Email
    }));
    
    res.json({ users: formattedUsers });
  } catch (err) {
    next(createError(err.message, 500));
  }
};

exports.getAllDepot = async (req, res, next) => {
  try {
    // ดึงข้อมูลคลังทั้งหมดพร้อมข้อมูลผู้อนุมัติ
    const depots = await prisma.depot.findMany({
      select: {
        Code: true,
        Name: true,
        Approval1ref_User: true,
        ref_User1Name: true,
        moveApproval1Email: true,
        Approval2ref_User: true,
        ref_User2Name: true,
        moveApproval2Email: true,
        Approval3ref_User: true,
        ref_User3Name: true,
        moveApproval3Email: true,
        Approval4ref_User: true,
        ref_User4Name: true,
        moveApproval4Email: true,
        Acknowledge_User_Id: true,
        Acknowledge_User_Name: true,
        Acknowledge_User_Email: true,
        repairApproval1UserId: true,
        repairApproval1Name: true,
        repairApproval1Email: true,
        repairApproval2UserId: true,
        repairApproval2Name: true,
        repairApproval2Email: true,
        repairApproval3UserId: true,
        repairApproval3Name: true,
        repairApproval3Email: true,
        repairApproval4UserId: true,
        repairApproval4Name: true,
        repairApproval4Email: true,
        Created_Date: true,
        Created_By: true,
        Modify_Date: true,
        Modify_By: true
      },
      orderBy: {
        Code: 'asc'
      }
    });
    
    // จัดรูปแบบข้อมูลสำหรับส่งกลับ
    const formattedDepots = depots.map(entity_depot => ({
      depotCode: entity_depot.Code,
      depotName: entity_depot.Name,
      moveApprovers: [
        {
          userId: entity_depot.Approval1ref_User,
          name: entity_depot.ref_User1Name,
          email: entity_depot.moveApproval1Email
        },
        {
          userId: entity_depot.Approval2ref_User,
          name: entity_depot.ref_User2Name,
          email: entity_depot.moveApproval2Email
        },
        {
          userId: entity_depot.Approval3ref_User,
          name: entity_depot.ref_User3Name,
          email: entity_depot.moveApproval3Email
        },
        {
          userId: entity_depot.Approval4ref_User,
          name: entity_depot.ref_User4Name,
          email: entity_depot.moveApproval4Email
        }
      ],
      acknowledgeUser: {
        userId: entity_depot.Acknowledge_User_Id,
        name: entity_depot.Acknowledge_User_Name,
        email: entity_depot.Acknowledge_User_Email
      },
      repairApprovers: [
        {
          userId: entity_depot.repairApproval1UserId,
          name: entity_depot.repairApproval1Name,
          email: entity_depot.repairApproval1Email
        },
        {
          userId: entity_depot.repairApproval2UserId,
          name: entity_depot.repairApproval2Name,
          email: entity_depot.repairApproval2Email
        },
        {
          userId: entity_depot.repairApproval3UserId,
          name: entity_depot.repairApproval3Name,
          email: entity_depot.repairApproval3Email
        },
        {
          userId: entity_depot.repairApproval4UserId,
          name: entity_depot.repairApproval4Name,
          email: entity_depot.repairApproval4Email
        }
      ],
      createdDate: entity_depot.Created_Date,
      createdBy: entity_depot.Created_By,
      modifyDate: entity_depot.Modify_Date,
      modifyBy: entity_depot.Modify_By
    }));
    
    res.json({
      depots: formattedDepots,
      count: formattedDepots.length
    });
  } catch (err) {
    console.error("Error in getAllDepot:", err);
    next(createError(err.message, 500));
  }
};

// ฟังก์ชันสำหรับดึงข้อมูลคลังตาม entity_depot code
exports.getDepotByCode = async (req, res, next) => {
  try {
    const { depotCode } = req.params;
    
    // ดึงข้อมูลคลังจาก database
    const entity_depot = await prisma.depot.findUnique({
      where: {
        Code: depotCode
      }
    });
    
    if (!entity_depot) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลคลัง' });
    }
    
    res.status(200).json({ 
      entity_depot: entity_depot
    });
  } catch (err) {
    next(err);
  }
};

// ฟังก์ชันสำหรับอัปเดตข้อมูลคลัง
exports.updateDepot = async (req, res, next) => {
  try {
    const { depotCode } = req.params;
    const {
      Name,
      Approval1ref_User,
      ref_User1Name,
      moveApproval1Email,
      Approval2ref_User,
      ref_User2Name,
      moveApproval2Email,
      Approval3ref_User,
      ref_User3Name,
      moveApproval3Email,
      Approval4ref_User,
      ref_User4Name,
      moveApproval4Email,
      Acknowledge_User_Id,
      Acknowledge_User_Name,
      Acknowledge_User_Email,
      repairApproval1UserId,
      repairApproval1Name,
      repairApproval1Email,
      repairApproval2UserId,
      repairApproval2Name,
      repairApproval2Email,
      repairApproval3UserId,
      repairApproval3Name,
      repairApproval3Email,
      repairApproval4UserId,
      repairApproval4Name,
      repairApproval4Email,
      Modify_By
    } = req.body;
    
    // ตรวจสอบว่ามีคลังนี้อยู่หรือไม่
    const existingDepot = await prisma.depot.findUnique({
      where: {
        Code: depotCode
      }
    });
    
    if (!existingDepot) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลคลัง' });
    }
    
    // อัปเดตข้อมูลคลัง
    const updatedDepot = await prisma.depot.update({
      where: {
        Code: depotCode
      },
      data: {
        Name,
        Approval1ref_User,
        ref_User1Name,
        moveApproval1Email,
        Approval2ref_User,
        ref_User2Name,
        moveApproval2Email,
        Approval3ref_User,
        ref_User3Name,
        moveApproval3Email,
        Approval4ref_User,
        ref_User4Name,
        moveApproval4Email,
        Acknowledge_User_Id,
        Acknowledge_User_Name,
        Acknowledge_User_Email,
        repairApproval1UserId,
        repairApproval1Name,
        repairApproval1Email,
        repairApproval2UserId,
        repairApproval2Name,
        repairApproval2Email,
        repairApproval3UserId,
        repairApproval3Name,
        repairApproval3Email,
        repairApproval4UserId,
        repairApproval4Name,
        repairApproval4Email,
        Modify_By,
        Modify_Date: new Date()
      }
    });
    
    res.status(200).json({ 
      message: 'อัปเดตข้อมูลคลังสำเร็จ',
      entity_depot: updatedDepot
    });
  } catch (err) {
    next(err);
  }
};

// เพิ่มฟังก์ชันสำหรับเพิ่มข้อมูล AssetEntity
exports.addAsset = async (req, res, next) => {
  try {
    console.log("Received asset data:", req.body);
    
    const {
      serialNumber,
      sapAssetNumber,
      assetType,
      assetDescription,
      modelNo,
      equipmentDescription,
      locationType,
      locationCode,
      locationDescription,
      moveInDate,
      status,
      Created_By
    } = req.body;

    // ตรวจสอบข้อมูลที่จำเป็น
    if (!serialNumber || !assetType || !status) {
      return next(createError("กรุณากรอกข้อมูลที่จำเป็น: Serial Number, AssetEntity Type, Status", 400));
    }

    // ตรวจสอบว่า Serial Number ซ้ำหรือไม่
    const existingAsset = await prisma.assetEntity.findUnique({
      where: {
        Asset_ID_Number: serialNumber
      }
    });

    if (existingAsset) {
      return next(createError("Serial Number นี้มีในระบบแล้ว", 400));
    }

    // ใช้ code ที่ส่งมาหรือค่าเริ่มต้น
    const code = Created_By || 'system';
    
    // ตรวจสอบว่ามี User ที่มี code นี้หรือไม่
    const user = await prisma.user.findUnique({
      where: {
        code: code
      }
    });
    
    if (!user) {
      return next(createError(`ไม่พบผู้ใช้ที่มี code: ${code}`, 400));
    }

    // ตรวจสอบความยาวของ Location_Code
    const locationCodeValue = locationCode || '';
    if (locationCodeValue.length > 100) {
      return next(createError("Location Code ต้องมีความยาวไม่เกิน 100 ตัวอักษร", 400));
    }

    console.log("Creating asset with code:", code);

    // สร้าง AssetEntity ใหม่
    const newAsset = await prisma.assetEntity.create({
      data: {
        Asset_ID_Number: serialNumber,
        Running_Asset_Number: sapAssetNumber || '',
        Asset_Type: assetType,
        Asset_Description: assetDescription || '',
        Model_No: modelNo || '',
        Equipment_Description: equipmentDescription || '',
        Current_Location: locationDescription || '',
        Current_Location_Type: locationType || 'entity_Customer',
        Location_Code: locationCodeValue,
        Location_Type: locationType || 'entity_Customer',
        Asset_Status: status,
        Created_By_UserId: code,
        Created_Date: new Date()
      }
    });

    console.log("Created new asset:", newAsset);

    // ส่งข้อมูลกลับไปยังผู้ใช้
    res.status(201).json({
      message: "สร้าง AssetEntity สำเร็จ",
      asset: newAsset
    });
  } catch (err) {
    console.error("Error in addAsset:", err);
    next(createError(err.message, 500));
  }
};

// เพิ่มฟังก์ชันสำหรับดึงข้อมูล AssetEntity ทั้งหมด
exports.getAllAssets = async (req, res, next) => {
  try {
    const { 
      serialNumber, 
      assetType, 
      locationType, 
      locationCode,
      startDate,
      endDate
    } = req.query;
    
    console.log('Search parameters:', req.query);
    
    // สร้าง where condition สำหรับ Prisma
    const whereCondition = {};
    
    // เพิ่มเงื่อนไขการค้นหาตามพารามิเตอร์ที่ส่งมา
    if (serialNumber) {
      whereCondition.Asset_ID_Number = {
        contains: serialNumber
      };
    }
    
    if (assetType) {
      whereCondition.Asset_Type = assetType;
    }
    
    if (locationType) {
      whereCondition.Location_Type = locationType;
    }
    
    if (locationCode) {
      whereCondition.Location_Code = {
        contains: locationCode
      };
    }
    
    // เพิ่มเงื่อนไขการค้นหาตามวันที่
    if (startDate || endDate) {
      whereCondition.Created_Date = {};
      
      if (startDate) {
        whereCondition.Created_Date.gte = new Date(startDate);
      }
      
      if (endDate) {
        // เพิ่ม 1 วันเพื่อให้รวมวันสุดท้ายด้วย
        const nextDay = new Date(endDate);
        nextDay.setDate(nextDay.getDate() + 1);
        whereCondition.Created_Date.lt = nextDay;
      }
    }
    
    console.log('Where condition:', JSON.stringify(whereCondition, null, 2));
    
    const assets = await prisma.assetEntity.findMany({
      where: whereCondition,
      orderBy: {
        Created_Date: 'desc'
      }
    });
    
    console.log(`Found ${assets.length} assets`);
    
    res.json({
      assets,
      count: assets.length
    });
  } catch (err) {
    console.error("Error in getAllAssets:", err);
    next(createError(err.message, 500));
  }
};

// เพิ่มฟังก์ชันสำหรับดึงข้อมูล AssetEntity ตาม Serial Number
exports.getAssetBySerialNumber = async (req, res, next) => {
  try {
    const { serialNumber } = req.params;
    
    const asset = await prisma.assetEntity.findUnique({
      where: {
        Asset_ID_Number: serialNumber
      }
    });
    
    if (!asset) {
      return res.status(404).json({ message: 'ไม่พบข้อมูล AssetEntity' });
    }
    
    res.json({ asset });
  } catch (err) {
    console.error("Error in getAssetBySerialNumber:", err);
    next(createError(err.message, 500));
  }
};

exports.getAssetBydepotorcus = async (req, res, next) => {
  try {
    const { locationType, locationCode } = req.query;
    
    console.log('---------------------------------------');
    console.log('การค้นหาทรัพย์สินตามสถานที่');
    console.log('locationType:', locationType);
    console.log('locationCode:', locationCode);
    console.log('---------------------------------------');
    
    if (!locationType || !locationCode) {
      return res.status(400).json({
        status: 'error',
        message: 'กรุณาระบุประเภทและรหัสสถานที่ (locationType, locationCode)'
      });
    }

    console.log(`ค้นหาทรัพย์สินที่อยู่ในสถานที่: ${locationCode} (ประเภท: ${locationType})`);
    
    // กำหนดรหัสที่ใช้ค้นหา
    let searchCode = locationCode;
    let originalId = locationCode;
    let smId = null;
    let smCodeABC = null; // เพิ่มตัวแปรสำหรับเก็บ entity_CustomerCode
    
    // ถ้าเป็นลูกค้า ให้ใช้ entity_Customer_ID และ entity_CustomerCode ในการค้นหา
    if (locationType === 'entity_Customer') {
      try {
        // ค้นหาลูกค้าจาก Id เพื่อดึง entity_Customer_ID และ entity_CustomerCode
        const customer = await prisma.entity_Customer.findUnique({
          where: { Id: locationCode },
          select: { 
            entity_Customer_ID: true,
            entity_CustomerCode: true,
            ref_Customer_Name: true
          }
        });
        
        console.log("ข้อมูลลูกค้าที่ค้นหา:", JSON.stringify(customer, null, 2));
        
        if (customer) {
          if (customer.entity_Customer_ID) {
            // ใช้ entity_Customer_ID ในการค้นหาทรัพย์สิน
            searchCode = customer.entity_Customer_ID;
            smId = customer.entity_Customer_ID;
            console.log(`ใช้ entity_Customer_ID: ${searchCode} ในการค้นหาทรัพย์สิน`);
          }
          
          if (customer.entity_CustomerCode) {
            // เก็บค่า entity_CustomerCode เพื่อใช้ในการค้นหา
            smCodeABC = customer.entity_CustomerCode;
            console.log(`ใช้ entity_CustomerCode: ${smCodeABC} ในการค้นหาทรัพย์สิน`);
          }
          
          console.log(`ชื่อลูกค้า: ${customer.ref_Customer_Name || 'ไม่ระบุ'}`);
        } else {
          console.log(`ไม่พบข้อมูลลูกค้า ID: ${locationCode}`);
        }
      } catch (err) {
        console.error("เกิดข้อผิดพลาดในการค้นหาลูกค้า:", err);
      }
    }
    
    // สร้างเงื่อนไขการค้นหาที่ใช้ทั้ง Id, entity_Customer_ID, entity_CustomerCode และค่าอื่นๆ
    console.log(`กำลังค้นหาทรัพย์สินด้วยเงื่อนไขหลายค่า`);
    
    // สร้างเงื่อนไขการค้นหาแบบ OR
    const searchConditions = [];
    
    // เพิ่มเงื่อนไขการค้นหาด้วย searchCode (entity_Customer_ID หรือค่าที่ระบุ)
    searchConditions.push({ Location_Code: searchCode });
    
    // เพิ่มเงื่อนไขการค้นหาด้วย locationCode เดิม (Id)
    if (originalId !== searchCode) {
      searchConditions.push({ Location_Code: originalId });
    }
    
    // ถ้ามี entity_Customer_ID เพิ่มเงื่อนไขการค้นหาด้วย entity_Customer_ID
    if (smId && smId !== searchCode) {
      searchConditions.push({ Location_Code: smId });
    }
    
    // ถ้ามี entity_CustomerCode เพิ่มเงื่อนไขการค้นหาด้วย entity_CustomerCode
    if (smCodeABC) {
      searchConditions.push({ Location_Code: smCodeABC });
    }
    
    // หากเป็น entity_Customer ให้เพิ่มเงื่อนไขการค้นหาเฉพาะตัวเลขใน Id (ถ้ามีรูปแบบ XXX-YYYYYY)
    if (locationType === 'entity_Customer' && originalId.includes('-')) {
      const numericPart = originalId.split('-')[1];
      if (numericPart) {
        searchConditions.push({ Location_Code: numericPart });
        console.log(`เพิ่มการค้นหาด้วยเลข ID: ${numericPart}`);
      }
    }
    
    console.log("เงื่อนไขการค้นหาทั้งหมด:", JSON.stringify(searchConditions, null, 2));
    
    const assets = await prisma.assetEntity.findMany({
      where: {
        OR: searchConditions,
        Asset_Status: 'Y' // เฉพาะที่พร้อมใช้งาน
      },
      orderBy: {
        Asset_ID_Number: 'asc'
      }
    });

    console.log(`ผลการค้นหา: พบทรัพย์สิน ${assets.length} รายการ`);
    if (assets.length > 0) {
      console.log("ตัวอย่างทรัพย์สินที่พบ:", assets[0].Asset_ID_Number, "Location_Code:", assets[0].Location_Code);
    }
    console.log('---------------------------------------');
    
    // ส่งข้อมูลทรัพย์สินกลับไป
    res.status(200).json({
      status: 'success',
      data: {
        assets,
        count: assets.length,
        searchCode,
        searchConditions // ส่งเงื่อนไขการค้นหาทั้งหมดกลับไปด้วย
      }
    });
  } catch (error) {
    console.error('Error fetching assets:', error);
    res.status(500).json({
      status: 'error',
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลทรัพย์สิน',
      error: error.message
    });
  }
};

// เพิ่มฟังก์ชันสำหรับอัปเดตข้อมูล AssetEntity
exports.updateAsset = async (req, res, next) => {
  try {
    const { serialNumber } = req.params;
    const {
      sapAssetNumber,
      assetType,
      assetDescription,
      modelNo,
      equipmentDescription,
      locationType,
      locationCode,
      locationDescription,
      status,
      Modify_By
    } = req.body;
    
    // ตรวจสอบว่ามี AssetEntity นี้อยู่หรือไม่
    const existingAsset = await prisma.assetEntity.findUnique({
      where: {
        Asset_ID_Number: serialNumber
      }
    });
    
    if (!existingAsset) {
      return res.status(404).json({ message: 'ไม่พบข้อมูล AssetEntity' });
    }
    
    // ใช้ code ที่ส่งมาหรือค่าเริ่มต้น
    const code = Modify_By || 'system';
    
    // ตรวจสอบว่ามี User ที่มี code นี้หรือไม่
    const user = await prisma.user.findUnique({
      where: {
        code: code
      }
    });
    
    if (!user) {
      return next(createError(`ไม่พบผู้ใช้ที่มี code: ${code}`, 400));
    }

    // ตรวจสอบความยาวของ Location_Code
    const locationCodeValue = locationCode || '';
    if (locationCodeValue.length > 100) {
      return next(createError("Location Code ต้องมีความยาวไม่เกิน 100 ตัวอักษร", 400));
    }
    
    // อัปเดตข้อมูล AssetEntity
    const updatedAsset = await prisma.assetEntity.update({
      where: {
        Asset_ID_Number: serialNumber
      },
      data: {
        Running_Asset_Number: sapAssetNumber || '',
        Asset_Type: assetType,
        Asset_Description: assetDescription || '',
        Model_No: modelNo || '',
        Equipment_Description: equipmentDescription || '',
        Current_Location: locationDescription || '',
        Current_Location_Type: locationType || 'entity_Customer',
        Location_Code: locationCodeValue,
        Location_Type: locationType || 'entity_Customer',
        Asset_Status: status,
        Modify_By_UserId: code,
        Modify_Date: new Date()
      }
    });
    
    res.status(200).json({ 
      message: 'อัปเดตข้อมูล AssetEntity สำเร็จ',
      asset: updatedAsset
    });
  } catch (err) {
    console.error("Error in updateAsset:", err);
    next(createError(err.message, 500));
  }
};

exports.getAllCustomer = async (req, res, next) => {
  try {
    // ดึงข้อมูลลูกค้าทั้งหมดจาก database
    const customers = await prisma.entity_Customer.findMany({
      select: {
        Id: true,
        ref_Customer_Name: true,
        entity_CustomerCode: true,
        entity_Customer_Area: true,
        entity_Customer_Address: true,
        entity_Customer_Status: true,
        Business_Registration: true,
        entity_Customer_Mobile: true,
        entity_Customer_Presentindentity: true,
        Payer_Id: true,
        Payer_Description: true,
        Ship_To_Id: true,
        Ship_To_Description: true,
        Depot_Number: true,
        Blocked_or_Suspend: true,
        Created_Date: true,
        Created_By: true,
        Modify_Date: true,
        Modify_By: true,
        area_code: true,
        Depot: {
          select: {
            Code: true,
            Name: true
          }
        },
        area: {
          select: {
            Code: true,
            Name: true
          }
        }
      },
      orderBy: {
        Id: 'asc'
      }
    });

    // แปลงข้อมูลให้เหมาะสมกับการแสดงผลใน AG Grid
    const formattedCustomers = customers.map(customer => ({
      // ข้อมูลหลัก
      customerId: customer.Id,
      customerName: customer.ref_Customer_Name,
      codeJDE: customer.entity_CustomerCode || '',
      status: customer.entity_Customer_Status || '',
      blockedOrSuspend: customer.Blocked_or_Suspend ? 'ถูกระงับ' : 'ใช้งานได้',
      
      // ข้อมูลที่อยู่และพื้นที่
      address: customer.entity_Customer_Address || '',
      area: customer.entity_Customer_Area || '',
      areaCode: customer.area_code || '',
      areaName: customer.area?.Name || '',
      businessRegistration: customer.Business_Registration || '',
      
      // ข้อมูลคลัง
      depotCode: customer.Depot_Number || '',
      depotName: customer.Depot?.Name || '',
      
      // ข้อมูลติดต่อ
      mobile: customer.entity_Customer_Mobile || '',
      presentId: customer.entity_Customer_Presentindentity || '',
      
      // ข้อมูลการชำระเงินและจัดส่ง
      payerId: customer.Payer_Id || '',
      payerDescription: customer.Payer_Description || '',
      shipToId: customer.Ship_To_Id || '',
      shipToDescription: customer.Ship_To_Description || '',
      
      // ข้อมูลการสร้างและแก้ไข
      createdDate: customer.Created_Date ? new Date(customer.Created_Date).toLocaleDateString('th-TH') : '',
      createdBy: customer.Created_By || '',
      modifyDate: customer.Modify_Date ? new Date(customer.Modify_Date).toLocaleDateString('th-TH') : '',
      modifyBy: customer.Modify_By || '',
      
      // เก็บข้อมูลดิบไว้สำหรับการแก้ไขหรือดูรายละเอียด
      rawData: {
        ...customer,
        Created_Date: customer.Created_Date ? new Date(customer.Created_Date).toISOString() : null,
        Modify_Date: customer.Modify_Date ? new Date(customer.Modify_Date).toISOString() : null
      }
    }));

    // ส่งข้อมูลกลับไปยัง client
    res.status(200).json({
      status: 'success',
      data: formattedCustomers
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      status: 'error',
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลลูกค้า',
      error: error.message
    });
  }
};

exports.getCustomerbyDepot = async (req, res, next) => {
  try {
    const { depotCode } = req.query;
    
    if (!depotCode) {
      return res.status(400).json({
        status: 'error',
        message: 'กรุณาระบุรหัสคลัง (Depot Code)'
      });
    }

    console.log(`ค้นหาลูกค้าจากคลัง: ${depotCode}`);

    // ดึงข้อมูลลูกค้าที่มี Depot_Number ตรงกับที่ส่งมา
    // แก้ไขโดยลบเงื่อนไข Blocked_or_Suspend ที่มีปัญหา
    const customers = await prisma.entity_Customer.findMany({
      where: {
        Depot_Number: depotCode,
        // เอาเงื่อนไข Blocked_or_Suspend ออก เพราะมีปัญหากับ enum
      },
      select: {
        Id: true,
        ref_Customer_Name: true,
        entity_CustomerCode: true,
        entity_Customer_Area: true,
        entity_Customer_Address: true,
        Depot_Number: true,
        area: {
          select: {
            Code: true,
            Name: true
          }
        }
      },
      orderBy: {
        ref_Customer_Name: 'asc'
      }
    });

    console.log(`พบลูกค้าทั้งหมด ${customers.length} ราย`);

    // จัดรูปแบบข้อมูลให้เหมาะสมสำหรับการแสดงผลใน AgGrid
    const formattedCustomers = customers.map(customer => ({
      id: customer.Id,
      name: customer.ref_Customer_Name,
      codeJDE: customer.entity_CustomerCode,
      address: customer.entity_Customer_Address || '',
      area: customer.area?.Name || '',
      depotCode: customer.Depot_Number,
    }));
   
    // ส่งข้อมูลกลับไปยัง client
    res.status(200).json({
      status: 'success',
      data: {
        customers: formattedCustomers,
        count: formattedCustomers.length
      }
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      status: 'error',
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลลูกค้า',
      error: error.message
    });
  }
};

exports.getAllArea = async (req, res, next) => {
  try {
    // ดึงข้อมูลพื้นที่ทั้งหมดจาก Prisma
    const areas = await prisma.area.findMany({
      where: {
        Status: "ACTIVE"
      },
      orderBy: {
        Code: 'asc'
      },
      select: {
        Code: true,
        Name: true,
        Description: true
      }
    });

    // ส่งข้อมูลกลับไปยัง client
    res.status(200).json({
      message: "ดึงข้อมูลพื้นที่สำเร็จ",
      areas: areas
    });
  } catch (error) {
    console.error('Error fetching areas:', error);
    res.status(500).json({
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลพื้นที่",
      error: error.message
    });
  }
};

exports.getCustomerById = async (req, res, next) => {
  try {
    const { customerid } = req.params;
    
    // ตรวจสอบว่ามี customerid หรือไม่
    if (!customerid) {
      return res.status(400).json({
        status: 'error',
        message: 'ไม่พบรหัสลูกค้า'
      });
    }
    
    console.log("กำลังค้นหาลูกค้ารหัส:", customerid);
    
    const customer = await prisma.entity_Customer.findUnique({
      where: {
        Id: customerid
      },
      include: {
        Depot: {
          select: {
            Name: true
          }
        },
        area: {
          select: {
            Name: true,
            Code: true
          }
        }
      }
    });
    
    if (!customer) {
      return res.status(404).json({
        status: 'error',
        message: 'ไม่พบข้อมูลลูกค้า'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: customer
    });
  } catch (err) {
    console.error("Error in getCustomerById:", err);
    res.status(500).json({
      status: 'error',
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลลูกค้า',
      error: err.message
    });
  }
};


/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// สร้าง
exports.movemententry = async (req, res, next) => {
  try {
    const { header, assets } = req.body;
    
    // สร้างเลขเอกสาร หรือ Document Number
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const documentNumber = `MOV${dateStr}${randomStr}`;
    
    // แปลง origin/destination type
    const originLocationType = header.originType === 'Depot' ? 'D' : 'C';
    const destinationLocationType = header.destinationType === 'Depot' ? 'D' : 'C';
    
    // ดึงข้อมูล entity_depot ที่สร้างเอกสาร เพื่อดึงผู้อนุมัติ
    const entity_depot = await prisma.depot.findUnique({
      where: { Code: header.createdDepot }
    });
    
    if (!entity_depot) {
      throw new Error('ไม่พบข้อมูล Depot');
    }
    
    // ตรวจสอบเงื่อนไขว่าเป็น usecase ไหน
    const isBKK = header.createdDepot === 'BKK';
    const isDepotOrigin = originLocationType === 'D';
    const isDepotDestination = destinationLocationType === 'D';
    const isDestinationBKK = destinationLocationType === 'D' && header.destinationLocationName === 'BKK';
    
    // ตรวจสอบว่ามี approver ครบตามเงื่อนไขหรือไม่
    let missingApprovers = [];
    
    // Usecase 1: HQ To Depot
    if (isBKK && isDepotOrigin && isDepotDestination) {
      if (!entity_depot.Approval1ref_User) missingApprovers.push('Approver 1');
      if (!entity_depot.Approval3ref_User) missingApprovers.push('Approver 3');
    }
    // Usecase 2: HQ To entity_Customer & entity_Customer to HQ
    else if (isBKK || !isDepotOrigin) {
      if (!entity_depot.Approval1ref_User) missingApprovers.push('Approver 1');
      if (!entity_depot.Approval2ref_User) missingApprovers.push('Approver 2');
      if (!entity_depot.Approval4ref_User) missingApprovers.push('Approver 4');
    }
    // Usecase 3: Depot to HQ
    else if (!isBKK && isDepotOrigin && isDestinationBKK) {
      if (!entity_depot.Approval1ref_User) missingApprovers.push('Approver 1');
      if (!entity_depot.Approval4ref_User) missingApprovers.push('Approver 4');
    }
    // Usecase 4: Depot to entity_Customer & entity_Customer to Depot
    else {
      if (!entity_depot.Approval1ref_User) missingApprovers.push('Approver 1');
      if (!entity_depot.Approval2ref_User) missingApprovers.push('Approver 2');
      if (!entity_depot.Approval3ref_User) missingApprovers.push('Approver 3');
    }
    
    // หากมี approver ไม่ครบ ให้แจ้งเตือนและยกเลิกการทำงาน
    if (missingApprovers.length > 0) {
      let usecaseText = '';
      if (isBKK && isDepotOrigin && isDepotDestination) usecaseText = 'HQ To Depot';
      else if (isBKK || !isDepotOrigin) usecaseText = 'HQ To entity_Customer หรือ entity_Customer to HQ';
      else if (!isBKK && isDepotOrigin && isDestinationBKK) usecaseText = 'Depot to HQ';
      else usecaseText = 'Depot to entity_Customer หรือ entity_Customer to Depot';
      
      throw new Error(
        `ไม่สามารถดำเนินรายการได้ Approver ไม่ครบถ้วน (${missingApprovers.join(', ')}) ในกรณี ${usecaseText}`
      );
    }
    
    // หา user ID จากฐานข้อมูลก่อนสร้างเอกสาร
    const user = await prisma.user.findUnique({
      where: { code: header.createdBy }
    });
    
    if (!user) {
      throw new Error('ไม่พบข้อมูลผู้ใช้');
    }
    
    // กำหนดค่าเริ่มต้นสำหรับผู้อนุมัติ
    let approvalData = {
      // ค่าเริ่มต้นเป็น null
      Next_Approval_User_Id: null,
      Move_Approval_1_User_Id: null,
      Move_Approval_1_Name: null,
      Move_Approval_1_Email: null,
      Move_Approval_2_User_Id: null,
      Move_Approval_2_Name: null,
      Move_Approval_2_Email: null,
      Move_Approval_3_User_Id: null,
      Move_Approval_3_Name: null,
      Move_Approval_3_Email: null,
      Move_Approval_4_User_Id: null,
      Move_Approval_4_Name: null,
      Move_Approval_4_Email: null,
      Acknowledge_User_Id: entity_depot.Acknowledge_User_Id,
      Acknowledge_User_Name: entity_depot.Acknowledge_User_Name,
      Acknowledge_User_Email: entity_depot.Acknowledge_User_Email
    };
    
    // กำหนดผู้อนุมัติตาม usecase ต่างๆ
    if (isBKK && isDepotOrigin && isDepotDestination) {
      console.log("Usecase 1: HQ To Depot");
      approvalData.Move_Approval_1_User_Id = entity_depot.Approval1ref_User;
      approvalData.Move_Approval_1_Name = entity_depot.ref_User1Name;
      approvalData.Move_Approval_1_Email = entity_depot.moveApproval1Email;
      
      approvalData.Move_Approval_2_User_Id = entity_depot.Approval3ref_User;
      approvalData.Move_Approval_2_Name = entity_depot.ref_User3Name;
      approvalData.Move_Approval_2_Email = entity_depot.moveApproval3Email;
    } 
    // ... (โค้ดเดิมของ usecase อื่นๆ) ...
    
    // กำหนด Next_Approval_User_Id เป็นผู้อนุมัติคนแรกที่มีค่า
    if (approvalData.Move_Approval_1_User_Id) {
      approvalData.Next_Approval_User_Id = approvalData.Move_Approval_1_User_Id;
    } else if (approvalData.Move_Approval_2_User_Id) {
      approvalData.Next_Approval_User_Id = approvalData.Move_Approval_2_User_Id;
    } else if (approvalData.Move_Approval_3_User_Id) {
      approvalData.Next_Approval_User_Id = approvalData.Move_Approval_3_User_Id;
    } else if (approvalData.Move_Approval_4_User_Id) {
      approvalData.Next_Approval_User_Id = approvalData.Move_Approval_4_User_Id;
    }
    
    // ตรวจสอบความสำเร็จในการส่งอีเมลก่อนสร้างเอกสาร
    let approverEmailResult = { success: false, message: 'ไม่มีผู้อนุมัติที่ต้องส่งอีเมล' };
    
    if (approvalData.Next_Approval_User_Id && approvalData.Move_Approval_1_Email) {
      try {
        const emailService = require('../utils/email-service');
        
        console.log('====== เริ่มส่งอีเมลแจ้งเตือนผู้อนุมัติ ======');
        console.log('- ผู้รับ:', approvalData.Move_Approval_1_Email);
        console.log('- ชื่อผู้รับ:', approvalData.Move_Approval_1_Name || 'ไม่ระบุ');
        console.log('- เลขเอกสาร:', documentNumber);
        
        // แก้ไข URL ที่มีปัญหา
        const formattedBaseURL = process.env.APP_URL.endsWith('/') 
          ? process.env.APP_URL.slice(0, -1) 
          : process.env.APP_URL || 'https://assettrackmove.com';
          
        let approvalType = 'origin';
        
        approverEmailResult = await emailService.sendApprovalEmail({
          recipientEmail: approvalData.Move_Approval_1_Email,
          documentNumber: documentNumber,
          approverName: approvalData.Move_Approval_1_Name || '',
          depotName: entity_depot.Name || header.createdDepot,
          originLocation: header.originLocationName,
          destinationLocation: header.destinationLocationName,
          totalAssets: assets.length,
          baseURL: formattedBaseURL,
          approvalType: approvalType
        });
        
        console.log('====== ผลการส่งอีเมลแจ้งเตือนผู้อนุมัติ ======');
        console.log('- สถานะ:', approverEmailResult.success ? 'สำเร็จ' : 'ล้มเหลว');
        console.log('- รายละเอียด:', approverEmailResult.success ? approverEmailResult.messageId : approverEmailResult.error);
        
      } catch (emailError) {
        console.error('====== เกิดข้อผิดพลาดในการส่งอีเมล ======');
        console.error('- ข้อความผิดพลาด:', emailError.message);
        console.error('- ผู้รับที่ส่งไม่สำเร็จ:', approvalData.Move_Approval_1_Email);
        console.error('=======================================');
        
        approverEmailResult = { success: false, error: emailError.message };
      }
    }
    
    // 2. ส่งอีเมลแจ้งเตือนผู้สร้างเอกสาร (ยังคงส่งอีเมลนี้)
    let creatorEmailResult = { success: false };
    if (user.Contact_Email) {
      try {
        const emailService = require('../utils/email-service');
        
        console.log('====== เริ่มส่งอีเมลแจ้งเตือนผู้สร้างเอกสาร ======');
        console.log('- ผู้รับ:', user.Contact_Email);
        console.log('- เลขเอกสาร:', documentNumber);
        
        // แก้ไข URL ที่มีปัญหา
        const formattedBaseURL = process.env.APP_URL.endsWith('/') 
          ? process.env.APP_URL.slice(0, -1) 
          : process.env.APP_URL || 'https://assettrackmove.com';
          
        creatorEmailResult = await emailService.sendNewDocumentEmail({
          recipientEmail: user.Contact_Email,
          documentNumber: documentNumber,
          depotName: entity_depot.Name || header.createdDepot,
          originLocation: header.originLocationName,
          destinationLocation: header.destinationLocationName,
          createdBy: user.nameEng || user.name || user.code,
          totalAssets: assets.length,
          baseURL: formattedBaseURL
        });
        
        console.log('====== ผลการส่งอีเมลแจ้งเตือนผู้สร้างเอกสาร ======');
        console.log('- สถานะ:', creatorEmailResult.success ? 'สำเร็จ' : 'ล้มเหลว');
        console.log('- รายละเอียด:', creatorEmailResult.success ? creatorEmailResult.messageId : creatorEmailResult.error);
        
      } catch (emailError) {
        console.error('====== เกิดข้อผิดพลาดในการส่งอีเมลแจ้งเตือนผู้สร้างเอกสาร ======');
        console.error('- ข้อความผิดพลาด:', emailError.message);
        console.error('- ผู้รับที่ส่งไม่สำเร็จ:', user.Contact_Email);
        console.error('=======================================');
        
        creatorEmailResult = { success: false, error: emailError.message };
      }
    }
    
    // ส่งผลลัพธ์กลับไปยังผู้ใช้
    res.status(201).json({
      status: 'success',
      message: 'สร้างเอกสารเคลื่อนย้ายทรัพย์สินสำเร็จ',
      data: {
        documentNumber,
        totalAssets: assets.length,
        approvalFlow: {
          firstApprover: {
            userId: approvalData.Move_Approval_1_User_Id,
            name: approvalData.Move_Approval_1_Name,
            email: approvalData.Move_Approval_1_Email
          },
          secondApprover: {
            userId: approvalData.Move_Approval_2_User_Id,
            name: approvalData.Move_Approval_2_Name,
            email: approvalData.Move_Approval_2_Email
          }
        },
        emailSent: {
          toApprover: approverEmailResult.success,
          toCreator: creatorEmailResult.success
        },
        usecaseInfo: {
          isBKK,
          isDepotOrigin,
          isDepotDestination,
          isDestinationBKK,
          origin: header.originLocationName,
          destination: header.destinationLocationName
        }
      }
    });
    
  } catch (error) {
    console.error('Error creating movement entry:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'ไม่สามารถสร้างเอกสารเคลื่อนย้ายทรัพย์สินได้',
      error: error.message
    });
  }
};

exports.getAllmovemententry = async (req, res, next) => {
  try {
    // รับพารามิเตอร์การค้นหาจาก query string
    const { 
      documentNumber, 
      fromDate, 
      toDate, 
      createdDepot,
      status
    } = req.query;
    
    // สร้างเงื่อนไขสำหรับการค้นหา
    let whereCondition = {};
    
    // เพิ่มเงื่อนไขตามพารามิเตอร์ที่รับมา
    if (documentNumber) {
      whereCondition.Document_Number = {
        contains: documentNumber
      };
    }
    
    if (createdDepot) {
      whereCondition.Created_Depot_Code = createdDepot;
    }
    
    // เงื่อนไขวันที่สร้าง
    if (fromDate || toDate) {
      whereCondition.Created_Date = {};
      
      if (fromDate) {
        const startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
        whereCondition.Created_Date.gte = startDate;
      }
      
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        whereCondition.Created_Date.lte = endDate;
      }
    }
    
    // เงื่อนไขสถานะเอกสาร
    if (status) {
      whereCondition.Document_Status = status;
    }
    
    // ค้นหาข้อมูลจากฐานข้อมูล
    const movements = await prisma.movement_Doccument.findMany({
      where: whereCondition,
      orderBy: {
        Created_Date: 'desc'  // เรียงตามวันที่สร้างล่าสุดก่อน
      },
      include: {
        Created_Depot: {
          select: {
            Name: true
          }
        },
        MovementDetails: {
          include: {
            AssetEntity: true
          }
        }
      }
    });
    
    // แปลงข้อมูลให้เหมาะสมสำหรับการแสดงผลใน AgGrid
    const formattedMovements = movements.map(movement => {
      // ตรวจสอบว่ามี MovementDetails หรือไม่
      const hasDetails = movement.MovementDetails.length > 0;
      
      return {
        documentNumber: movement.Document_Number,
        createdDate: movement.Created_Date,
        createdDepot: movement.Created_Depot_Code,
        createdDepotName: movement.Created_Depot?.Name || movement.Created_Depot_Code,
        originLocation: movement.Origin_Location,
        originType: movement.Origin_Location_Type,
        destinationLocation: movement.Destination_Location,
        destinationType: movement.Destination_Location_Type,
        documentStatus: movement.Document_Status,
        totalAssets: movement.MovementDetails.length,
        nextApproverUser: movement.Next_Approval_User_Id || '',
        // เพิ่มข้อมูลเกี่ยวกับผู้อนุมัติและการลงนาม
        approvalInfo: {
          approver1: movement.Move_Approval_1_User_Id || '',
          approver1Status: movement.Move_Approval_1_Status || '',
          approver2: movement.Move_Approval_2_User_Id || '',
          approver2Status: movement.Move_Approval_2_Status || '',
          approver3: movement.Move_Approval_3_User_Id || '',
          approver3Status: movement.Move_Approval_3_Status || '',
          originSignatureRequired: movement.Origin_Customer_Signature_Required,
          originSignatureDate: movement.Origin_Customer_Signature_Date,
          destinationSignatureRequired: movement.Destination_Customer_Signature_Required,
          destinationSignatureDate: movement.Destination_Customer_Signature_Date
        }
      };
    });
    
    // ส่งข้อมูลกลับไปยังผู้ใช้
    res.status(200).json({
      status: 'success',
      count: formattedMovements.length,
      data: formattedMovements
    });
    
  } catch (error) {
    console.error('Error fetching movement entries:', error);
    res.status(500).json({
      status: 'error',
      message: 'ไม่สามารถดึงข้อมูลเอกสารเคลื่อนย้ายทรัพย์สินได้',
      error: error.message
    });
  }
};

exports.updateMovementStatus = async (req, res, next) => {
  try {
    const { documentNumber } = req.params;
    const { status } = req.body;
    
    // ตรวจสอบว่ามีเอกสารนี้อยู่หรือไม่
    const existingMovement = await prisma.movement_Doccument.findUnique({
      where: { Document_Number: documentNumber }
    });
    
    if (!existingMovement) {
      return res.status(404).json({ message: 'ไม่พบเอกสาร' });
    }
    
    // อัปเดตสถานะเอกสาร
    const updatedMovement = await prisma.movement_Doccument.update({
      where: { Document_Number: documentNumber },
      data: { Document_Status: status }
    });
    
    // หาผู้อนุมัติแรกที่มีสถานะอนุมัติเรียบร้อยแล้ว
    const firstApprover = await prisma.movement_Doccument.findFirst({
      where: {
        Document_Number: documentNumber,
        Move_Approval_1_Status: 'Approved'
      },
      select: {
        Move_Approval_1_User_Id: true,
        Move_Approval_1_Name: true,
        Move_Approval_1_Email: true
      }
    });
    
    let approverName = '';
    let isFirstApprover = false;
    let isSecondApprover = false;
    
    if (firstApprover) {
      approverName = firstApprover.Move_Approval_1_Name;
      isFirstApprover = true;
    }
    
    // หาผู้อนุมัติที่สองที่มีสถานะอนุมัติเรียบร้อยแล้ว
    const secondApprover = await prisma.movement_Doccument.findFirst({
      where: {
        Document_Number: documentNumber,
        Move_Approval_2_Status: 'Approved'
      },
      select: {
        Move_Approval_2_User_Id: true,
        Move_Approval_2_Name: true,
        Move_Approval_2_Email: true
      }
    });
    
    if (secondApprover) {
      approverName = secondApprover.Move_Approval_2_Name;
      isSecondApprover = true;
    }
    
    // ส่งอีเมลแจ้งเตือนทุกคนที่เกี่ยวข้อง
    const emailService = require('../utils/email-service');
    const notificationResult = await emailService.notifyAllRelatedParties(
      existingMovement, 
      status, 
      approverName, 
      isFirstApprover ? 1 : isSecondApprover ? 2 : 0,
      process.env.APP_URL
    );
    
    console.log('ผลการส่งอีเมลแจ้งเตือน:', notificationResult);
    
    res.status(200).json({
      status: 'success',
      message: 'อัพเดตสถานะเอกสารสำเร็จ',
      data: {
        documentNumber,
        status: 'อนุมัติเรียบร้อยแล้ว',
        depotName: existingMovement.Created_Depot?.Name || existingMovement.Created_Depot_Code,
        statusBy: approverName,
        baseURL: process.env.APP_URL || 'https://assettrackmove.com'
      }
    });
    
  } catch (error) {
    console.error('Error updating movement status:', error);
    res.status(500).json({
      status: 'error',
      message: 'ไม่สามารถอัพเดตสถานะเอกสารได้',
      error: error.message
    });
  }
};

exports.getmovemententryById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // ดึงข้อมูล header
    const movementHeader = await prisma.movement_Doccument.findUnique({
      where: { Document_Number: id }
    });
    
    if (!movementHeader) {
      return res.status(404).json({
        status: 'error',
        message: 'ไม่พบข้อมูลเอกสาร'
      });
    }

    // สร้างข้อมูลการอนุมัติ
    const approvals = [];
    
    // ตรวจสอบและเพิ่มข้อมูลผู้อนุมัติแต่ละคน
    for (let i = 1; i <= 4; i++) {
      const userId = movementHeader[`Move_Approval_${i}_User_Id`];
      if (userId) {
        approvals.push({
          userId: userId,
          name: movementHeader[`Move_Approval_${i}_Name`],
          email: movementHeader[`Move_Approval_${i}_Email`],
          status: movementHeader[`Move_Approval_${i}_Status`] === 'Y' ? 'Approved' : 
                 movementHeader[`Move_Approval_${i}_Status`] === 'R' ? 'Rejected' : 'Pending',
          approveDate: movementHeader[`Move_Approval_${i}_Date`]
        });
      }
    }

    // สร้างข้อมูลการรับทราบ
    const acknowledge = movementHeader.Acknowledge_User_Id ? {
      userId: movementHeader.Acknowledge_User_Id,
      name: movementHeader.Acknowledge_User_Name,
      email: movementHeader.Acknowledge_User_Email,
      status: movementHeader.Acknowledge_Status === 'Y' ? 'Acknowledged' : 'Pending',
      acknowledgeDate: movementHeader.Acknowledge_Date
    } : null;

    // สร้างข้อมูลลายเซ็น
    const signatures = {
      origin: {
        required: movementHeader.Origin_Customer_Signature_Required === 'Y',
        signature: movementHeader.Origin_Customer_Signature,
        date: movementHeader.Origin_Customer_Signature_Date
      },
      destination: {
        required: movementHeader.Destination_Customer_Signature_Required === 'Y',
        signature: movementHeader.Destination_Customer_Signature,
        date: movementHeader.Destination_Customer_Signature_Date
      }
    };
    
    // ดึงข้อมูล details (assets)
    const movementDetails = await prisma.movementDetail.findMany({
      where: { Document_Number: id },
      include: {
        AssetEntity: true
      }
    });
    
    // จัดรูปแบบข้อมูลทั้งหมด
    const formattedData = {
      header: {
        documentNumber: movementHeader.Document_Number,
        createdDate: movementHeader.Created_Date,
        createdDepot: movementHeader.Created_Depot_Code,
        status: movementHeader.Document_Status,
        details: movementHeader.Details || '',
        originType: movementHeader.Origin_Location_Type === 'D' ? 'Depot' : 'entity_Customer',
        originLocationId: movementHeader.Origin_Location,
        originLocationName: movementHeader.Origin_Location,
        originDescription: movementHeader.Origin_Description || '',
        destinationType: movementHeader.Destination_Location_Type === 'D' ? 'Depot' : 'entity_Customer',
        destinationLocationId: movementHeader.Destination_Location,
        destinationLocationName: movementHeader.Destination_Location,
        destinationDescription: movementHeader.Destination_Description || '',
        createdBy: movementHeader.Created_By,
        totalAssets: movementDetails.length
      },
      assets: movementDetails.map(detail => ({
        serialNumber: detail.AssetEntity.Asset_ID_Number,
        sapAssetNumber: detail.AssetEntity.Running_Asset_Number || 'ไม่ระบุ',
        assetDescription: detail.AssetEntity.Asset_Description || 'ไม่ระบุ',
        modelNo: detail.AssetEntity.Model_No || 'ไม่ระบุ',
        equipmentDescription: detail.AssetEntity.Equipment_Description || 'ไม่ระบุ',
        assetType: detail.AssetEntity.Asset_Type || 'ไม่ระบุ'
      })),
      approvals,        // เพิ่มข้อมูลการอนุมัติ
      acknowledge,      // เพิ่มข้อมูลการรับทราบ
      signatures       // เพิ่มข้อมูลลายเซ็น
    };

    // เพิ่ม console.log เพื่อดูข้อมูลที่จะส่งกลับ
    console.log('=== ข้อมูลที่จะส่งกลับ ===');
    console.log('Approvals:', formattedData.approvals);
    console.log('Acknowledge:', formattedData.acknowledge);
    console.log('Signatures:', formattedData.signatures);
    
    res.status(200).json({
      status: 'success',
      data: formattedData
    });
    
  } catch (error) {
    console.error('Error fetching movement entry:', error);
    res.status(500).json({
      status: 'error',
      message: 'ไม่สามารถดึงข้อมูลเอกสารได้',
      error: error.message
    });
  }
};



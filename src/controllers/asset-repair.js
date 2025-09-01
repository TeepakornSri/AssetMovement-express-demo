const bcrypt = require("bcryptjs");
const JWT = require("jsonwebtoken");
const { loginSchema, passwordSchema } = require("../validators/auth-validator");
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const createError = require("../utils/create-error");
const emailService = require("../utils/email-service");


// ฟังก์ชันแปลงรหัสสถานะเป็นข้อความ (เพิ่มใหม่)
function getStatusText(statusCode) {
  switch (statusCode) {
    case 'O': return 'Open';
    case 'I': return 'In-Progress';
    case 'C': return 'Completed';
    case 'R': return 'Rejected';
    case 'X': return 'Cancelled';
    default: return statusCode;
  }
}


exports.repairentry = async (req, res, next) => {
  try {
    const { header, assets } = req.body;
    
    // แสดงข้อมูลทั้งหมดที่ได้รับมาจาก frontend
    // แสดงข้อมูลที่ได้รับมาอย่างละเอียด
    
    // ตรวจสอบค่า originDescription ที่ได้รับมา
    
    // ตรวจสอบว่ามีข้อมูลทรัพย์สินหรือไม่
    if (!assets || assets.length === 0) {
      throw new Error('ไม่มีรายการทรัพย์สินที่ต้องการซ่อม กรุณาระบุทรัพย์สินอย่างน้อย 1 รายการ');
    }
    
    // ตรวจสอบว่าข้อมูลทรัพย์สินมี serial number ครบทุกรายการหรือไม่
    const missingSerialNumber = assets.some(asset => !asset.serialNumber && !asset.assetSerialNumber);
    if (missingSerialNumber) {
      throw new Error('มีรายการทรัพย์สินที่ไม่มีหมายเลข Serial Number');
    }
    
    // สร้างเลขเอกสาร หรือ Document Number
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const documentNumber = `REP${dateStr}${randomStr}`;
    
    // แปลง Location type
    const repairLocationType = header.locationType === 'Depot' ? 'D' : 'C';
    
    // ดึงข้อมูล entity_depot ที่สร้างเอกสาร เพื่อดึงผู้อนุมัติ
    const entity_depot = await prisma.depot.findUnique({
      where: { Code: header.createdDepot }
    });
    
    if (!entity_depot) {
      throw new Error('ไม่พบข้อมูล Depot');
    }
    
    // กำหนดค่าเริ่มต้นสำหรับผู้อนุมัติ
    let approvalData = {
      // ค่าเริ่มต้นเป็น null
      Next_Approval_User_Id: null,
      Repair_Approval_1_User_Id: null,
      Repair_Approval_1_Name: null,
      Repair_Approval_1_Email: null,
      Repair_Approval_2_User_Id: null,
      Repair_Approval_2_Name: null,
      Repair_Approval_2_Email: null,
      Repair_Approval_3_User_Id: null,
      Repair_Approval_3_Name: null,
      Repair_Approval_3_Email: null,
      Repair_Approval_4_User_Id: null,
      Repair_Approval_4_Name: null,
      Repair_Approval_4_Email: null
    };
    
    // ตรวจสอบว่ามี approver จาก entity_depot หรือไม่
    let missingApprovers = [];
    let approverCount = 0;
    
    // ตรวจสอบและดึงข้อมูลของ Approver ทั้งหมดจาก entity_depot
    if (entity_depot.repairApproval1UserId) {
      approvalData.Repair_Approval_1_User_Id = entity_depot.repairApproval1UserId;
      approvalData.Repair_Approval_1_Name = entity_depot.repairApproval1Name;
      approvalData.Repair_Approval_1_Email = entity_depot.repairApproval1Email;
      approverCount++;
    }
    
    if (entity_depot.repairApproval2UserId) {
      approvalData.Repair_Approval_2_User_Id = entity_depot.repairApproval2UserId;
      approvalData.Repair_Approval_2_Name = entity_depot.repairApproval2Name;
      approvalData.Repair_Approval_2_Email = entity_depot.repairApproval2Email;
      approverCount++;
    }
    
    if (entity_depot.repairApproval3UserId) {
      approvalData.Repair_Approval_3_User_Id = entity_depot.repairApproval3UserId;
      approvalData.Repair_Approval_3_Name = entity_depot.repairApproval3Name;
      approvalData.Repair_Approval_3_Email = entity_depot.repairApproval3Email;
      approverCount++;
    }
    
    if (entity_depot.repairApproval4UserId) {
      approvalData.Repair_Approval_4_User_Id = entity_depot.repairApproval4UserId;
      approvalData.Repair_Approval_4_Name = entity_depot.repairApproval4Name;
      approvalData.Repair_Approval_4_Email = entity_depot.repairApproval4Email;
      approverCount++;
    }
    
    // ตรวจสอบว่ามีผู้อนุมัติอย่างน้อย 1 คนหรือไม่
    if (approverCount === 0) {
      throw new Error(`ไม่สามารถดำเนินรายการได้ เนื่องจากไม่มีผู้อนุมัติในข้อมูล Depot ${entity_depot.Name || entity_depot.Code}`);
    }
    
    // หา user ID จากฐานข้อมูลก่อนสร้างเอกสาร
    const user = await prisma.user.findUnique({
      where: { code: header.createdBy }
    });
    
    if (!user) {
      throw new Error('ไม่พบข้อมูลผู้ใช้');
    }
    
    // กำหนด Next_Approval_User_Id เป็นผู้อนุมัติคนแรกที่มีค่า
    if (approvalData.Repair_Approval_1_User_Id) {
      approvalData.Next_Approval_User_Id = approvalData.Repair_Approval_1_User_Id;
    } else if (approvalData.Repair_Approval_2_User_Id) {
      approvalData.Next_Approval_User_Id = approvalData.Repair_Approval_2_User_Id;
    } else if (approvalData.Repair_Approval_3_User_Id) {
      approvalData.Next_Approval_User_Id = approvalData.Repair_Approval_3_User_Id;
    } else if (approvalData.Repair_Approval_4_User_Id) {
      approvalData.Next_Approval_User_Id = approvalData.Repair_Approval_4_User_Id;
    }
    
    // สร้างข้อมูลสำหรับบันทึกลง RepairHeader
    const headerData = {
      Document_Number: documentNumber,
      Created_Date: new Date(),
      Created_By: header.createdBy,
      Created_Depot_Code: header.createdDepot,
      Document_Status: 'I',
      Repair_Location: header.locationName,
      Repair_Location_Type: repairLocationType,
      Description: header.description || '',
      Location_Description: header.locationDescription || '',
      Next_Approval_User_Id: approvalData.Next_Approval_User_Id,
      repairApproval1UserId: approvalData.Repair_Approval_1_User_Id,
      repairApproval1Name: approvalData.Repair_Approval_1_Name,
      repairApproval1Email: approvalData.Repair_Approval_1_Email,
      repairApproval1Status: null,
      repairApproval1Date: null,
      repairApproval2UserId: approvalData.Repair_Approval_2_User_Id,
      repairApproval2Name: approvalData.Repair_Approval_2_Name,
      repairApproval2Email: approvalData.Repair_Approval_2_Email,
      repairApproval2Status: null,
      repairApproval2Date: null,
      repairApproval3UserId: approvalData.Repair_Approval_3_User_Id,
      repairApproval3Name: approvalData.Repair_Approval_3_Name,
      repairApproval3Email: approvalData.Repair_Approval_3_Email,
      repairApproval3Status: null,
      repairApproval3Date: null,
      repairApproval4UserId: approvalData.Repair_Approval_4_User_Id,
      repairApproval4Name: approvalData.Repair_Approval_4_Name,
      repairApproval4Email: approvalData.Repair_Approval_4_Email,
      repairApproval4Status: null,
      repairApproval4Date: null
    };
    
    // ตรวจสอบค่า Location_Description ในตัวแปร headerData
    
    // บันทึกข้อมูล header ลงฐานข้อมูล
    const createdHeader = await prisma.repairHeader.create({
      data: headerData
    });
    
    // ตรวจสอบว่า Location_Description ถูกบันทึกลงฐานข้อมูลหรือไม่
    
    console.log('====================================================');
    
    // บันทึกข้อมูล assets ลงฐานข้อมูล
    const assetDetailsPromises = assets.map(asset => {
      return prisma.repairDetail.create({
        data: {
          RepairHeader: {
            connect: {
              Document_Number: documentNumber
            }
          },
          AssetEntity: {
            connect: {
              Asset_ID_Number: asset.serialNumber || asset.assetSerialNumber
            }
          },
          Created_Date: new Date(),
          Created_By_User: {
            connect: {
              code: header.createdBy
            }
          }
        }
      });
    });
    
    // รอให้บันทึกข้อมูล assets เสร็จทั้งหมด
    const createdAssetDetails = await Promise.all(assetDetailsPromises);

    // อัพเดตสถานะทรัพย์สินเป็น R (Repairing)
    const assetUpdatePromises = assets.map(asset => {
      const assetSerialNumber = asset.serialNumber || asset.assetSerialNumber;
      
      return prisma.assetEntity.update({
        where: { Asset_ID_Number: assetSerialNumber },
        data: { Asset_Status: 'R' }
      });
    });
    
    // รอให้อัพเดตสถานะทรัพย์สินเสร็จทั้งหมด
    const updatedAssets = await Promise.all(assetUpdatePromises);

    // ตรวจสอบความสำเร็จในการส่งอีเมลก่อนสร้างเอกสาร
    let approverEmailResult = { success: false, message: 'ไม่มีผู้อนุมัติที่ต้องส่งอีเมล' };
    
    if (approvalData.Next_Approval_User_Id && approvalData.Repair_Approval_1_Email) {
      try {
        // แก้ไข URL ที่มีปัญหา
        const formattedBaseURL = process.env.APP_URL.endsWith('/') 
          ? process.env.APP_URL.slice(0, -1) 
          : process.env.APP_URL || 'https://assettrackmove.com';
          
        approverEmailResult = await emailService.sendRepairApprovalEmail({
          recipientEmail: approvalData.Repair_Approval_1_Email,
          documentNumber: documentNumber,
          approverName: approvalData.Repair_Approval_1_Name || '',
          depotName: entity_depot.Name || header.createdDepot,
          repairLocation: header.locationName,
          totalAssets: assets.length,
          baseURL: formattedBaseURL
        });
      } catch (emailError) {
        approverEmailResult = { success: false, error: emailError.message };
      }
    }
    
    // ส่งอีเมลแจ้งเตือนผู้สร้างเอกสาร
    let creatorEmailResult = { success: false };
    if (user.Contact_Email) {
      try {
        // แก้ไข URL ที่มีปัญหา
        const formattedBaseURL = process.env.APP_URL.endsWith('/') 
          ? process.env.APP_URL.slice(0, -1) 
          : process.env.APP_URL || 'https://assettrackmove.com';
          
        creatorEmailResult = await emailService.sendNewRepairDocumentEmail({
          recipientEmail: user.Contact_Email,
          documentNumber: documentNumber,
          depotName: entity_depot.Name || header.createdDepot,
          repairLocation: header.locationName,
          createdBy: user.nameEng || user.name || user.code,
          totalAssets: assets.length,
          baseURL: formattedBaseURL
        });
      } catch (emailError) {
        creatorEmailResult = { success: false, error: emailError.message };
      }
    }
    
    // แสดงข้อมูลผลลัพธ์ทั้งหมดก่อนส่งกลับให้ client
    // ส่งผลลัพธ์กลับไปยังผู้ใช้
    res.status(201).json({
      status: 'success',
      message: 'สร้างเอกสารแจ้งซ่อมทรัพย์สินสำเร็จ',
      data: {
        documentNumber,
        totalAssets: assets.length,
        approvalFlow: {
          totalApprovers: approverCount,
          firstApprover: {
            userId: approvalData.Repair_Approval_1_User_Id,
            name: approvalData.Repair_Approval_1_Name,
            email: approvalData.Repair_Approval_1_Email
          }
        },
        emailSent: {
          toApprover: approverEmailResult.success,
          toCreator: creatorEmailResult.success
        }
      }
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'ไม่สามารถสร้างเอกสารแจ้งซ่อมทรัพย์สินได้',
      error: error.message
    });
  }
};

exports.getAllrepair = async (req, res, next) => {
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
    const repairs = await prisma.repairHeader.findMany({
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
        RepairDetails: {
          include: {
            AssetEntity: true
          }
        }
      }
    });
    
    // สร้าง mapping ระหว่าง entity_depot code กับชื่อสถานที่ที่กำหนด
    const depotLocationMap = {
      'AYT': 'Ayuthaya',
      'BKK': 'Bangkok (HQ)',
      'CHM': 'Chiang Mai',
      'CHN': 'Chonburi',
      'CHR': 'Chiang Rai',
      'CTN': 'Chantaburi',
      'HAD': 'Had Yai',
      'KKN': 'Khon Kaen',
      'KOR': 'Korat',
      'NPT': 'Nakhon Pathom',
      'PIT': 'Pitsanulok',
      'RAT': 'Ratchaburi',
      'SRI': 'Surin',
      'SUR': 'Surat',
      'UBN': 'Ubonrachathani',
      'UDN': 'Udonthani',
      'YAL': 'Yala'
    };
    
    // กรองข้อมูลจาก user.ref_depot_code
    const userDepotCode = createdDepot;
    const userLocation = depotLocationMap[userDepotCode];
    
    // กรองเฉพาะรายการที่ user สามารถเข้าถึงได้ (มี location ตรงกับ entity_depot ของ user)
    let filteredRepairs = repairs;
    
    if (userDepotCode) {
      // ตรวจสอบว่า repair location ตรงกับ user entity_depot หรือไม่
      filteredRepairs = repairs.filter(repair => {
        // ถ้าเป็น repair ที่สร้างจาก entity_depot ของตัวเอง สามารถเข้าถึงได้เสมอ
        if (repair.Created_Depot_Code === userDepotCode) {
          return true;
        }
        
        // ถ้าเป็น location ของ entity_depot ตัวเอง สามารถเข้าถึงได้
        const repairLocation = repair.Repair_Location || '';
        const canAccess = repairLocation.includes(userLocation);
        
        return canAccess;
      });
    }
    
    // แปลงข้อมูลให้เหมาะสมสำหรับการแสดงผลใน AgGrid
    const formattedRepairs = filteredRepairs.map(repair => {
      // ตรวจสอบว่ามี RepairDetails หรือไม่
      const hasDetails = repair.RepairDetails.length > 0;
      
      return {
        documentNumber: repair.Document_Number,
        createdDate: repair.Created_Date,
        createdDepot: repair.Created_Depot_Code,
        createdDepotName: repair.Created_Depot?.Name || repair.Created_Depot_Code,
        repairLocation: repair.Repair_Location,
        locationType: repair.Repair_Location_Type,
        description: repair.Description,
        documentStatus: repair.Document_Status,
        totalAssets: repair.RepairDetails.length,
        nextApproverUser: repair.Next_Approval_User_Id || '',
        // เพิ่มข้อมูลเกี่ยวกับผู้อนุมัติ
        approvalInfo: {
          approver1: repair.repairApproval1UserId || '',
          approver1Status: repair.repairApproval1Status || '',
          approver2: repair.repairApproval2UserId || '',
          approver2Status: repair.repairApproval2Status || '',
          approver3: repair.repairApproval3UserId || '',
          approver3Status: repair.repairApproval3Status || '',
          approver4: repair.repairApproval4UserId || '',
          approver4Status: repair.repairApproval4Status || ''
        }
      };
    });
    
    // ส่งข้อมูลกลับไปหน้าบ้าน:
    res.status(200).json({
      status: 'success',
      count: formattedRepairs.length,
      data: formattedRepairs
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'ไม่สามารถดึงข้อมูลเอกสารซ่อมทรัพย์สินได้',
      error: error.message
    });
  }
};

exports.getrepairById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    // ดึงข้อมูล header
    const repairHeader = await prisma.repairHeader.findUnique({
      where: { Document_Number: id },
      include: {
        RepairDetails: true,
        Created_Depot: {
          select: {
            Name: true
          }
        }
      }
    });
    
    if (!repairHeader) {
      return res.status(404).json({
        status: 'error',
        message: 'ไม่พบข้อมูลเอกสาร'
      });
    }

    // ตรวจสอบสิทธิ์ในการเข้าถึงเอกสาร
    // อนุญาตเฉพาะ Admin หรือคนที่อยู่ entity_depot เดียวกับเอกสารเท่านั้น
    const isAdmin = user.role_code.toUpperCase() === 'ADMIN';
    const isSameDepot = user.ref_depot_code === repairHeader.Created_Depot_Code;
    
    if (!isAdmin && !isSameDepot) {
      return res.status(403).json({
        status: 'error',
        message: 'คุณไม่มีสิทธิ์ในการเข้าถึงเอกสารนี้'
      });
    }

    // ดึงข้อมูล assets
    const repairDetails = await prisma.repairDetail.findMany({
      where: { Document_Number: id },
      include: {
        AssetEntity: true
      }
    });

    // สร้างข้อมูลการอนุมัติ
    const approvals = [];
    
    // ตรวจสอบและเพิ่มข้อมูลผู้อนุมัติแต่ละคน
    for (let i = 1; i <= 4; i++) {
      const userId = repairHeader[`repairApproval${i}UserId`];
      if (userId) {
        // แปลงสถานะให้อ่านง่ายขึ้น
        let status = 'Pending';
        if (repairHeader[`repairApproval${i}Status`] === 'Y' || 
            repairHeader[`repairApproval${i}Status`] === 'Approved') {
          status = 'Approved';
        } else if (repairHeader[`repairApproval${i}Status`] === 'R' || 
                   repairHeader[`repairApproval${i}Status`] === 'Rejected') {
          status = 'Rejected';
        }
        
        // ดึง case_action จากผู้ใช้
        let case_action = null;
        try {
          const approverUser = await prisma.user.findUnique({
            where: { code: userId },
            select: { case_action: true }
          });
          case_action = approverUser?.case_action || null;
        } catch (error) {
          console.error(`Error fetching case_action for user ${userId}:`, error);
        }
        
        approvals.push({
          userId: userId,
          name: repairHeader[`repairApproval${i}Name`],
          email: repairHeader[`repairApproval${i}Email`],
          status: status,
          approveDate: repairHeader[`repairApproval${i}Date`],
          case_action: case_action,
          comment: repairHeader[`repairApproval${i}comment`] || '' // เพิ่ม comment ถ้ามี
        });
      }
    }

    // จัดรูปแบบข้อมูลทั้งหมด
    const formattedData = {
      header: {
        documentNumber: repairHeader.Document_Number,
        createdDate: repairHeader.Created_Date,
        createdDepot: repairHeader.Created_Depot_Code,
        createdDepotName: repairHeader.Created_Depot?.Name || repairHeader.Created_Depot_Code,
        status: repairHeader.Document_Status,
        statusDisplay: getStatusText(repairHeader.Document_Status),
        details: repairHeader.Description || '',
        originType: repairHeader.Repair_Location_Type === 'D' ? 'Depot' : 'entity_Customer',
        originLocationId: repairHeader.Repair_Location,
        originLocationName: repairHeader.Repair_Location,
        originDescription: repairHeader.Location_Description || '',
        currentStep: repairHeader.Current_step || '',
        nextApprovalUserId: repairHeader.Next_Approval_User_Id || ''
      },
      assets: repairDetails.map(detail => ({
        serialNumber: detail.AssetEntity?.Asset_ID_Number || '',
        sapAssetNumber: detail.AssetEntity?.Running_Asset_Number || 'ไม่ระบุ',
        assetDescription: detail.AssetEntity?.Asset_Description || 'ไม่ระบุ',
        modelNo: detail.AssetEntity?.Model_No || 'ไม่ระบุ',
        equipmentDescription: detail.AssetEntity?.Equipment_Description || 'ไม่ระบุ',
        assetType: detail.AssetEntity?.Asset_Type || 'ไม่ระบุ'
      })),
      approvals,
      acknowledge: null, // RepairHeader อาจไม่มี field นี้
      signatures: null // RepairHeader อาจไม่มี field นี้
    };
    
    res.status(200).json({
      status: 'success',
      data: formattedData
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'ไม่สามารถดึงข้อมูลเอกสารซ่อมทรัพย์สินได้',
      error: error.message
    });
  }
};

exports.getRepairApprovalList = async (req, res) => {
  try {
    const { 
      userId,
      documentNumber,
      fromDate,
      toDate,
      status,
      createdDepot
    } = req.query;

    // ตรวจสอบว่ามี userId หรือไม่
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'ต้องระบุรหัสผู้ใช้ (User ID)'
      });
    }

    // ตรวจสอบว่าผู้ใช้มีอยู่ในระบบหรือไม่
    const user = await prisma.user.findUnique({
      where: { code: userId }
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'ไม่พบข้อมูลผู้ใช้'
      });
    }

    // ตรวจสอบว่าผู้ใช้เป็น admin หรือไม่
    const isAdmin = user?.role_code?.toUpperCase() === 'ADMIN';

    // สร้างเงื่อนไขการค้นหา
    let whereConditions = {};
    
    // ถ้าไม่ใช่ admin ให้กรองเฉพาะรายการที่ต้องอนุมัติ
    if (!isAdmin) {
      whereConditions = {
        // เฉพาะผู้ที่เป็นผู้อนุมัติในลำดับปัจจุบันเท่านั้นที่จะเห็นเอกสาร
        Next_Approval_User_Id: userId
      };
    }

    // เพิ่มเงื่อนไขการค้นหาอื่นๆ
    if (documentNumber) {
      whereConditions.Document_Number = {
        contains: documentNumber
      };
    }

    if (fromDate || toDate) {
      whereConditions.Created_Date = {};
      if (fromDate) {
        whereConditions.Created_Date.gte = new Date(fromDate);
      }
      if (toDate) {
        whereConditions.Created_Date.lte = new Date(toDate);
      }
    }

    if (status) {
      whereConditions.Document_Status = status;
    }

    if (createdDepot) {
      whereConditions.Created_Depot_Code = createdDepot;
    }

    // ดึงข้อมูลจาก DB
    const documents = await prisma.repairHeader.findMany({
      where: whereConditions,
      orderBy: {
        Created_Date: 'desc'
      }
    });

    // กรองเอกสารให้เฉพาะที่ผู้ใช้มีสิทธิ์อนุมัติในขั้นตอนปัจจุบัน
    let filteredDocuments = documents;
    
    if (!isAdmin) {
      filteredDocuments = documents.filter(doc => {
        // เฉพาะผู้ที่เป็นผู้อนุมัติในลำดับปัจจุบันเท่านั้นที่จะเห็นเอกสาร
        return doc.Next_Approval_User_Id === userId;
      });
    }

    // แปลงข้อมูลให้เหมาะกับการแสดงผล
    const formattedDocuments = filteredDocuments.map(doc => {
      // หาผู้อนุมัติปัจจุบัน
      let currentStep = 0;
      let nextApproverName = '';
      
      for (let i = 1; i <= 4; i++) {
        if (!doc[`repairApproval${i}Status`] && doc[`repairApproval${i}UserId`]) {
          currentStep = i;
          nextApproverName = doc[`repairApproval${i}Name`] || '';
          break;
        }
      }
      
      // กำหนดสถานะอนุมัติสำหรับแสดงผล
      let approvalStatus = 'รออนุมัติ';
      if (doc.Document_Status === 'I') {
        approvalStatus = 'อยู่ระหว่างการดำเนินการ';
      } else if (doc.Document_Status === 'C') {
        approvalStatus = 'เสร็จสมบูรณ์';
      } else if (doc.Document_Status === 'R') {
        approvalStatus = 'ปฏิเสธ';
      } else if (doc.Document_Status === 'X') {
        approvalStatus = 'ยกเลิก';
      }
      
      return {
        documentNumber: doc.Document_Number,
        createdDate: doc.Created_Date,
        createdDepot: doc.Created_Depot_Code,
        repairLocation: doc.Repair_Location,
        locationType: doc.Repair_Location_Type === 'D' ? 'Depot' : 'entity_Customer',
        description: doc.Description,
        locationDescription: doc.Location_Description,
        currentApprover: nextApproverName,
        currentStep: currentStep,
        documentStatus: doc.Document_Status,
        approvalStatus: approvalStatus,
        isCurrentUserApprover: doc.Next_Approval_User_Id === userId
      };
    });

    res.status(200).json({
      status: 'success',
      data: formattedDocuments
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'ไม่สามารถดึงข้อมูลรายการรออนุมัติได้',
      error: error.message
    });
  }
};

exports.getrepairApprovalById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    // ดึงข้อมูล header
    const repairHeader = await prisma.repairHeader.findUnique({
      where: { Document_Number: id },
      include: {
        RepairDetails: true,
        Created_Depot: {
          select: {
            Name: true
          }
        }
      }
    });
    
    if (!repairHeader) {
      return res.status(404).json({
        status: 'error',
        message: 'ไม่พบข้อมูลเอกสาร'
      });
    }

    // ตรวจสอบสิทธิ์ในการเข้าถึงเอกสาร
    // อนุญาตเฉพาะ Admin หรือคนที่อยู่ entity_depot เดียวกับเอกสารเท่านั้น
    const isAdmin = user.role_code.toUpperCase() === 'ADMIN';
    const isSameDepot = user.ref_depot_code === repairHeader.Created_Depot_Code;
    
    
    // เพิ่มการตรวจสอบว่าเป็นผู้อนุมัติของเอกสารหรือไม่
    let isApprover = false;
    for (let i = 1; i <= 4; i++) {
      if (repairHeader[`repairApproval${i}UserId`] === user.code) {
        isApprover = true;
        break;
      }
    }
    
    if (!isAdmin && !isSameDepot && !isApprover) {
      return res.status(403).json({
        status: 'error',
        message: 'คุณไม่มีสิทธิ์ในการเข้าถึงเอกสารนี้'
      });
    }

    // ดึงข้อมูล assets
    const repairDetails = await prisma.repairDetail.findMany({
      where: { Document_Number: id },
      include: {
        AssetEntity: true
      }
    });

    // สร้างข้อมูลการอนุมัติ
    const approvals = [];
    
    // ตรวจสอบและเพิ่มข้อมูลผู้อนุมัติแต่ละคน
    for (let i = 1; i <= 4; i++) {
      const userId = repairHeader[`repairApproval${i}UserId`];
      if (userId) {
        // แปลงสถานะให้อ่านง่ายขึ้น
        let status = 'Pending';
        if (repairHeader[`repairApproval${i}Status`] === 'Y' || 
            repairHeader[`repairApproval${i}Status`] === 'Approved') {
          status = 'Approved';
        } else if (repairHeader[`repairApproval${i}Status`] === 'R' || 
                   repairHeader[`repairApproval${i}Status`] === 'Rejected') {
          status = 'Rejected';
        }
        
        // ดึง case_action จากผู้ใช้
        let case_action = null;
        try {
          const approverUser = await prisma.user.findUnique({
            where: { code: userId },
            select: { case_action: true }
          });
          case_action = approverUser?.case_action || null;
        } catch (error) {
          console.error(`Error fetching case_action for user ${userId}:`, error);
        }
        
        approvals.push({
          userId: userId,
          name: repairHeader[`repairApproval${i}Name`],
          email: repairHeader[`repairApproval${i}Email`],
          status: status,
          approveDate: repairHeader[`repairApproval${i}Date`],
          case_action: case_action,
          comment: repairHeader[`repairApproval${i}comment`] || '' // เพิ่ม comment
        });
      }
    }
    
    // จัดรูปแบบข้อมูลทั้งหมด
    const formattedData = {
      header: {
        documentNumber: repairHeader.Document_Number,
        createdDate: repairHeader.Created_Date,
        createdDepot: repairHeader.Created_Depot_Code,
        createdDepotName: repairHeader.Created_Depot?.Name || repairHeader.Created_Depot_Code,
        status: repairHeader.Document_Status,
        statusDisplay: getStatusText(repairHeader.Document_Status),
        details: repairHeader.Description || '',
        originType: repairHeader.Repair_Location_Type === 'D' ? 'Depot' : 'entity_Customer',
        originLocationId: repairHeader.Repair_Location,
        originLocationName: repairHeader.Repair_Location,
        originDescription: repairHeader.Location_Description || '',
        currentStep: repairHeader.Current_step || '',
        nextApprovalUserId: repairHeader.Next_Approval_User_Id || ''
      },
      Document_Number: repairHeader.Document_Number,
      Current_step: repairHeader.Current_step || '',
      Next_Approval_User_Id: repairHeader.Next_Approval_User_Id || '',
      assets: repairDetails.map(detail => ({
        serialNumber: detail.AssetEntity?.Asset_ID_Number || '',
        sapAssetNumber: detail.AssetEntity?.Running_Asset_Number || 'ไม่ระบุ',
        assetDescription: detail.AssetEntity?.Asset_Description || 'ไม่ระบุ',
        modelNo: detail.AssetEntity?.Model_No || 'ไม่ระบุ',
        equipmentDescription: detail.AssetEntity?.Equipment_Description || 'ไม่ระบุ',
        assetType: detail.AssetEntity?.Asset_Type || 'ไม่ระบุ'
      })),
      approvals
    };
    
    res.status(200).json({
      status: 'success',
      data: formattedData
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'ไม่สามารถดึงข้อมูลเอกสารซ่อมทรัพย์สินได้',
      error: error.message
    });
  }
};






const bcrypt = require("bcryptjs");
const JWT = require("jsonwebtoken");
const { loginSchema, passwordSchema } = require("../validators/auth-validator");
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const createError = require("../utils/create-error");
const emailService = require("../utils/email-service");
const { uploadToS3 } = require('../config/aws');
const upload = require('../middlewares/upload');
const fs = require('fs/promises');
const path = require('path');

exports.assetapprove = async (req, res, next) => {
  try {
    // รับ id จาก route parameter
    const documentNumber = req.params.id;
    const { userId, signatureData, comment } = req.body;

    // ตรวจสอบข้อมูลที่จำเป็น
    if (!documentNumber || !userId) {
      return res.status(400).json({
        status: 'error',
        message: 'ข้อมูลไม่ครบถ้วน กรุณาระบุ id และ userId'
      });
    }

    // ดึงข้อมูลเอกสาร
    const document = await prisma.movement_Doccument.findUnique({
      where: {
        Document_Number: documentNumber
      },
      include: {
        Created_Depot: true,
        MovementDetails: {
          include: {
            AssetEntity: true
          }
        }
      }
    });

    if (!document) {
      return res.status(404).json({
        status: 'error',
        message: 'ไม่พบเอกสารที่ระบุ'
      });
    }

    // ตัวแปรสำหรับตรวจสอบขั้นตอนที่ต้องการลายเซ็น
    let isCustomerSignatureStep = false;
    let signatureUrl = null;

    // เพิ่มการตรวจสอบว่ามี signatureData หรือไม่
    console.log(`ข้อมูลลายเซ็น: ${signatureData ? 'มีข้อมูล' : 'ไม่มีข้อมูล'}`);
    console.log(`ขั้นตอนปัจจุบัน: ${document.Current_step}`);
    console.log(`เป็นขั้นตอนของลูกค้าหรือไม่: ${
      document.Current_step === 'Waiting_Customer' || 
      document.Current_step === 'Waiting_Customer_Old' || 
      document.Current_step === 'Waiting_Customer_New' ? 'ใช่' : 'ไม่ใช่'
    }`);

    // เช็คว่าเป็นขั้นตอนที่ต้องการลายเซ็นหรือไม่
    if (document.Current_step === 'Waiting_Customer' || 
        document.Current_step === 'Waiting_Customer_Old' ||
        document.Current_step === 'Waiting_Customer_New') {
      
      isCustomerSignatureStep = true;
      
      // ตรวจสอบว่ามีข้อมูลลายเซ็นมาหรือไม่
      if (signatureData) {
        try {
          // เก็บข้อมูลลายเซ็นลงไฟล์ชั่วคราว
          const base64Data = signatureData.replace(/^data:image\/png;base64,/, "");
          const tempFilePath = path.join('public', `temp-signature-${Date.now()}.png`);
          await fs.writeFile(tempFilePath, base64Data, 'base64');
          
          // อัพโหลดลงใน S3
          signatureUrl = await uploadToS3(tempFilePath, `signature-${documentNumber}.png`);
          
          // ลบไฟล์ชั่วคราว
          await fs.unlink(tempFilePath);
          
          console.log(`บันทึกลายเซ็นสำเร็จ: ${signatureUrl}`);
          console.log(`บันทึก comment: ${comment || 'ไม่มี'}`);
          
        } catch (signatureError) {
          console.error('เกิดข้อผิดพลาดในการบันทึกลายเซ็น:', signatureError);
          // ไม่ return error ที่นี่ แต่ดำเนินการต่อไป
        }
      } else {
        console.log('ไม่มีข้อมูลลายเซ็น (signatureData) แต่เป็นขั้นตอนของลูกค้า');
      }
    } else {
      console.log('ขั้นตอนนี้ไม่ต้องการลายเซ็น');
    }

    // ดึงข้อมูลผู้ใช้ที่อนุมัติ
    const approver = await prisma.user.findUnique({
      where: {
        code: userId
      }
    });

    if (!approver) {
      return res.status(404).json({
        status: 'error',
        message: 'ไม่พบข้อมูลผู้อนุมัติ'
      });
    }

    // ตรวจสอบว่าผู้ใช้เป็น ADMIN หรือไม่
    const isAdmin = approver.role_code === 'ADMIN' || approver.role_code === 'admin';

    // ค้นหาว่าผู้ใช้นี้อยู่ในขั้นตอนการอนุมัติใด
    let approverStep = 0;
    for (let i = 1; i <= 4; i++) {
      if (document[`Move_Approval_${i}_User_Id`] === userId) {
        approverStep = i;
        break;
      }
    }

    // ถ้าไม่ใช่ ADMIN และไม่มีสิทธิ์อนุมัติ
    if (approverStep === 0 && !isAdmin) {
      return res.status(403).json({
        status: 'error',
        message: 'คุณไม่มีสิทธิ์อนุมัติเอกสารนี้'
      });
    }

    // ถ้าเป็น ADMIN และไม่ได้อยู่ในสิทธิ์อนุมัติ ให้กำหนดเป็นขั้นตอนปัจจุบัน
    if (approverStep === 0 && isAdmin) {
      // ตรวจสอบว่าอยู่ขั้นตอนไหน และกำหนด approverStep ตามนั้น
      for (let i = 1; i <= 4; i++) {
        if (document[`Move_Approval_${i}_Status`] !== 'Y' && document[`Move_Approval_${i}_User_Id`]) {
          approverStep = i;
          break;
        }
      }
      // ถ้าไม่พบขั้นตอนที่ยังไม่อนุมัติ ให้เป็นขั้นตอนที่ 1
      if (approverStep === 0) {
        approverStep = 1;
      }
    }

    // ตรวจสอบว่าผู้อนุมัติคนก่อนหน้าได้อนุมัติหรือยัง (ข้ามสำหรับ ADMIN)
    if (!isAdmin) {
      for (let i = 1; i < approverStep; i++) {
        if (document[`Move_Approval_${i}_Status`] !== 'Y') {
          return res.status(403).json({
            status: 'error',
            message: `ผู้อนุมัติขั้นที่ ${i} ยังไม่ได้อนุมัติเอกสารนี้`
          });
        }
      }
    }

    // ตรวจสอบสถานะการอนุมัติปัจจุบัน (ยกเว้น ADMIN)
    // เพิ่มเงื่อนไขเช็คถ้าเคย approve หรือ reject แล้วไม่ให้ทำซ้ำในขั้นตอนนั้น
    if (!isAdmin) {
      // ตรวจสอบว่าเป็น Sales หรือไม่
      const isSalesUser = approver.case_action === 'Sales';
      
      // ถ้าไม่ใช่ Sales จึงจะตรวจสอบสถานะการอนุมัติซ้ำ
      if (!isSalesUser) {
        const currentStatus = document[`Move_Approval_${approverStep}_Status`];
        if (currentStatus === 'Y') {
          return res.status(400).json({
            status: 'error',
            message: 'คุณได้อนุมัติเอกสารนี้ไปแล้ว ไม่สามารถอนุมัติซ้ำได้'
          });
        } else if (currentStatus === 'R') {
          return res.status(400).json({
            status: 'error',
            message: 'คุณได้ปฏิเสธเอกสารนี้ไปแล้ว ไม่สามารถอนุมัติซ้ำได้'
          });
        }
      } else {
        // กรณีเป็น Sales ต้องตรวจสอบว่าอยู่ใน step ไหน
        console.log(`ผู้ใช้เป็น Sales และกำลังพยายามอนุมัติที่ step ${approverStep} และ Current_step คือ ${document.Current_step}`);
        // อนุญาตให้ Sales อนุมัติซ้ำได้เพื่อให้ flow ไปต่อ
      }
    }

    // ตรวจสอบสถานะการอนุมัติปัจจุบัน (ยกเว้น ADMIN)
    if (!isAdmin && document[`Move_Approval_${approverStep}_Status`] === 'Y') {
      // ตรวจสอบว่าเป็น Sales หรือไม่
      const isSalesUser = approver.case_action === 'Sales';
      
      // ถ้าไม่ใช่ Sales จึงจะตรวจสอบสถานะการอนุมัติซ้ำ
      if (!isSalesUser) {
        return res.status(400).json({
          status: 'error',
          message: 'คุณได้อนุมัติเอกสารนี้ไปแล้ว'
        });
      } else {
        // กรณีเป็น Sales อนุญาตให้อนุมัติซ้ำได้
        console.log(`ผู้ใช้เป็น Sales อนุญาตให้อนุมัติซ้ำใน step ${approverStep} ได้ (Current_step: ${document.Current_step})`);
      }
    }

    // ตรวจสอบ case_action กับ Current_step (ยกเว้น ADMIN)
    if (!isAdmin && approver.case_action) {
      // Map case_action กับ Current_step ที่ตรงกัน
      const actionStepMapping = {
        'CaseAction1': 'Waiting_CaseAction1',
        'CaseAction2': 'Waiting_CaseAction2',
        'CaseAction3': 'Waiting_CaseAction3',
        'CaseAction4': 'Waiting_CaseAction4',
        'CaseAction5': 'Waiting_CaseAction5',
        'Customer_Old': 'Waiting_Customer_Old',
        'Customer_New': 'Waiting_Customer_New',
        'Account': 'Waiting_CaseAction6',
        'Sales': ['Waiting_Customer', 'Waiting_Customer_Old', 'Waiting_Customer_New'] // Sales สามารถเข้าถึงขั้นตอน entity_Customer ได้ทั้ง 3 ประเภท
      };

      const matchingStep = actionStepMapping[approver.case_action];
      
      // กรณีเป็น Sales ให้สามารถอนุมัติได้ทั้ง entity_Customer, Customer_Old, Customer_New
      if (approver.case_action === 'Sales') {
        const customerSteps = ['Waiting_Customer', 'Waiting_Customer_Old', 'Waiting_Customer_New'];
        if (customerSteps.includes(document.Current_step)) {
          // ตรวจสอบว่ามีชื่ออยู่ในเอกสารหรือไม่
          const userInDocument = [1, 2, 3, 4].some(i => document[`Move_Approval_${i}_User_Id`] === userId);
          if (userInDocument) {
            // อนุญาตให้ดำเนินการต่อได้
            console.log(`ผู้ใช้เป็น Sales และมีชื่อในเอกสาร สามารถดำเนินการแทนลูกค้าได้ในขั้นตอน ${document.Current_step}`);
            
            // ตรวจสอบว่าเป็นกรณีลูกค้าปลายทางหรือไม่
            if (document.Current_step === 'Waiting_Customer_New' && approverStep === 3) {
              // กรณีพิเศษ: Sales ต้องอนุมัติในขั้นตอนที่ 4 แทนที่จะเป็นขั้นตอนที่ 3
              approverStep = 4;
              console.log(`แก้ไข approverStep เป็น ${approverStep} เพื่อให้สอดคล้องกับขั้นตอน ${document.Current_step}`);
            }
          } else {
            return res.status(403).json({
              status: 'error',
              message: `ไม่มีสิทธิ์ในการอนุมัติขั้นตอนนี้ (ไม่พบชื่อคุณในเอกสาร)`
            });
          }
        } else {
          return res.status(403).json({
            status: 'error',
            message: `ไม่มีสิทธิ์ในการอนุมัติขั้นตอนนี้ (ขั้นตอนปัจจุบันคือ ${document.Current_step}, Sales สามารถอนุมัติได้เฉพาะขั้นตอน entity_Customer เท่านั้น)`
          });
        }
      } else if (document.Current_step !== null && document.Current_step !== matchingStep) {
        return res.status(403).json({
          status: 'error',
          message: `ไม่มีสิทธิ์ในการอนุมัติขั้นตอนนี้ (ขั้นตอนปัจจุบันคือ ${document.Current_step}, ขั้นตอนที่คุณมีสิทธิ์คือ ${matchingStep})`
        });
      }
    }

    // เตรียมข้อมูลสำหรับปรับปรุง
    const updateData = {};
    const currentDateTime = new Date();

    // เพิ่มข้อมูลลายเซ็นในการอัพเดต (ถ้ามี)
    if (isCustomerSignatureStep && signatureUrl) {
      // กำหนดค่าลายเซ็นตามประเภทขั้นตอน
      if (document.Current_step === 'Waiting_Customer_New') {
        // ปลายทาง
        updateData.Destination_Customer_Signature = signatureUrl;
        updateData.Destination_Customer_Signature_Date = new Date();
        // เพิ่ม comment สำหรับปลายทาง ถ้ามี
        if (comment !== undefined) {
          updateData.Move_Approval_4_comment = comment;
        }
      } else {
        // ต้นทาง (ทั้ง Waiting_Customer และ Waiting_Customer_Old)
        updateData.Origin_Customer_Signature = signatureUrl;
        updateData.Origin_Customer_Signature_Date = new Date();
        // เพิ่ม comment สำหรับต้นทาง ถ้ามี
        if (comment !== undefined) {
          updateData.Move_Approval_3_comment = comment;
        }
      }
      
      console.log(`กำลังบันทึกลายเซ็น URL: ${signatureUrl} ลงในฐานข้อมูล`);
    }

    // 1. ปรับปรุงสถานะการอนุมัติตามขั้นตอน
    updateData[`Move_Approval_${approverStep}_Status`] = 'Y';
    updateData[`Move_Approval_${approverStep}_Date`] = currentDateTime;
    
    // บันทึก comment ถ้ามี
    if (comment !== undefined) {
      updateData[`Move_Approval_${approverStep}_comment`] = comment;
    }

    // กำหนดให้ Document_Status เป็น I ตลอดระหว่างการอนุมัติ
    updateData.Document_Status = 'I';
    
    // ตรวจสอบว่ามีการกำหนดค่า Current_step หรือไม่
    const originalCurrentStep = document.Current_step;
    console.log(`ค่า Current_step ก่อนอนุมัติ: ${originalCurrentStep}`);
    
    // ตรวจสอบกรณี entity_Customer to entity_Customer
    const isCustomerToCustomer = document.Origin_Location_Type === 'C' && document.Destination_Location_Type === 'C';
    
    // 4. ดึงข้อมูล entity_depot และกำหนดค่าตัวแปรสำคัญ - ย้ายขึ้นมาประกาศก่อนใช้งาน
    const originDepotCode = document.Origin_Location_Type === 'D' ? document.Origin_Location : document.Created_Depot_Code;
    const destinationDepotCode = document.Destination_Location_Type === 'D' ? document.Destination_Location : null;
    
    // ตรวจสอบประเภทต้นทางและปลายทาง
    const isDepotOrigin = document.Origin_Location_Type === 'D';
    const isDepotDestination = document.Destination_Location_Type === 'D';

    // ดึงข้อมูล entity_depot ต้นทางและปลายทาง
    const originDepot = await prisma.depot.findUnique({
      where: { Code: originDepotCode }
    });

    let destinationDepot = null;
    if (destinationDepotCode) {
      destinationDepot = await prisma.depot.findUnique({
        where: { Code: destinationDepotCode }
      });
    }

    // ตรวจสอบว่าเป็น BKK หรือไม่
    const isBKKCode = (code) => ['BKK', 'BANGKOK', 'Bangkok'].includes(code);
    
    // แก้ไขการกำหนดค่า isBKK ให้พิจารณาทั้ง entity_depot และรหัส
    const isBKK = originDepot ? 
      (originDepot.Store_Type === 'BKK' || isBKKCode(originDepotCode)) : 
      isBKKCode(originDepotCode);
    
    const isDestinationBKK = destinationDepot ? 
      (destinationDepot.Store_Type === 'BKK' || isBKKCode(destinationDepotCode)) : 
      (destinationDepotCode ? isBKKCode(destinationDepotCode) : false);
    
    // DEBUG: แสดงข้อมูล use case และเงื่อนไขการตัดสินใจ
    console.log("\n");
    console.log("==========================================================");
    console.log("                 ข้อมูล USE CASE การอนุมัติ                ");
    console.log("==========================================================");
    console.log(`Document: ${documentNumber}`);
    console.log(`Origin Type: ${document.Origin_Location_Type}, Location: ${document.Origin_Location}`);
    console.log(`Destination Type: ${document.Destination_Location_Type}, Location: ${document.Destination_Location}`);
    console.log(`isBKK: ${isBKK}, isDestinationBKK: ${isDestinationBKK}`);
    console.log(`isDepotOrigin: ${isDepotOrigin}, isDepotDestination: ${isDepotDestination}`);
    console.log(`originDepotCode: ${originDepotCode}, destinationDepotCode: ${destinationDepotCode || 'ไม่มี'}`);
    console.log(`Current Approval Step: ${approverStep}`);
    console.log(`Current Step (ขั้นตอนปัจจุบัน): ${originalCurrentStep}`);
    console.log(`isCustomerToCustomer: ${isCustomerToCustomer}`);
    console.log(`Origin Type: ${document.Origin_Location_Type}, Destination Type: ${document.Destination_Location_Type}`);
    console.log("==========================================================");
    console.log("\n");
    
    // 2. ตรวจสอบการกำหนด Next Approval User และ Current_step
    let nextApprovalStep = 0;
    let nextApproverUserId = null;
    let nextApproverName = null;
    let nextApproverEmail = null;
    let emailRecipient = null;
    let emailRecipientName = null;
    
    // ******** CRITICAL SECTION - กรณี CUSTOMER TO CUSTOMER (C to C) ********
    if (isCustomerToCustomer) {
      console.log('**** พบว่าเป็นกรณี CUSTOMER TO CUSTOMER (C to C) ****');
      
      if (approverStep === 1) {
        // ผู้อนุมัติที่ 1: "Area Sales Manager" (Approval1ref_User จาก entity_depot ต้นทาง)
        // ขั้นตอนต่อไปคือ ผู้อนุมัติคนที่ 2
        nextApprovalStep = 2;
        nextApproverUserId = document.Move_Approval_2_User_Id;
        nextApproverName = document.Move_Approval_2_Name;
        nextApproverEmail = document.Move_Approval_2_Email;
        
        emailRecipient = nextApproverEmail;
        emailRecipientName = nextApproverName;
        
        // อัพเดต Current_step
        updateData.Current_step = 'Waiting_CaseAction2';
        console.log(`CUSTOMER TO CUSTOMER: ขั้นตอนที่ 1 อนุมัติแล้ว -> เปลี่ยนเป็น Waiting_CaseAction2`);
      } 
      else if (approverStep === 2) {
        // ผู้อนุมัติที่ 2: "Sales AssetEntity Manager" (Approval2ref_User จาก entity_depot ต้นทาง)
        // ขั้นตอนต่อไปคือ ผู้อนุมัติคนที่ 3 (entity_Customer ต้นทาง)
        nextApprovalStep = 3;
        nextApproverUserId = document.Move_Approval_3_User_Id;
        nextApproverName = document.Move_Approval_3_Name;
        nextApproverEmail = document.Move_Approval_3_Email;
        
        emailRecipient = nextApproverEmail;
        emailRecipientName = nextApproverName;
        
        // อัพเดต Current_step เป็น Waiting_Customer_Old เสมอในกรณี C to C
        updateData.Current_step = 'Waiting_Customer_Old';
        console.log(`CUSTOMER TO CUSTOMER: ขั้นตอนที่ 2 อนุมัติแล้ว -> เปลี่ยนเป็น Waiting_Customer_Old (ลูกค้าต้นทาง)`);
      } 
      else if (approverStep === 3 || originalCurrentStep === 'Waiting_Customer_Old') {
        // ผู้อนุมัติที่ 3: "entity_Customer (ต้นทาง)" (Approval3ref_User จาก entity_depot ต้นทาง)
        // ขั้นตอนต่อไปคือ entity_Customer ปลายทาง
        nextApprovalStep = 4;
        nextApproverUserId = document.Move_Approval_3_User_Id; // ซ้ำกับอนุมัติที่ 3 ตามที่ต้องการ
        nextApproverName = document.Move_Approval_3_Name;
        nextApproverEmail = document.Move_Approval_3_Email;
        
        emailRecipient = nextApproverEmail;
        emailRecipientName = nextApproverName;
        
        // อัพเดต Current_step เป็น Waiting_Customer_New เสมอหลังจาก Customer_Old
        updateData.Current_step = 'Waiting_Customer_New';
        console.log(`CUSTOMER TO CUSTOMER: ขั้นตอนที่ 3 อนุมัติแล้ว -> เปลี่ยนเป็น Waiting_Customer_New (ลูกค้าปลายทาง)`);
      } 
      else if (approverStep === 4 || originalCurrentStep === 'Waiting_Customer_New') {
        // ผู้อนุมัติที่ 4: "entity_Customer (ปลายทาง)" (ใช้ ID เดียวกับขั้นตอนที่ 3)
        // เมื่อผู้อนุมัติคนที่ 4 อนุมัติแล้ว ส่งไปยังผู้รับทราบ
        updateData.Document_Status = 'A'; // เปลี่ยนสถานะเป็น Acknowledge
        updateData.Current_step = 'Waiting_CaseAction6';
        
        // ส่งข้อมูลไปยังผู้รับทราบ (Acknowledge_User_Id จาก entity_depot ต้นทาง)
        if (originDepot && originDepot.Acknowledge_User_Email) {
          emailRecipient = originDepot.Acknowledge_User_Email;
          emailRecipientName = originDepot.Acknowledge_User_Name;
          
          // กำหนด Next_Approval_User_Id เป็นผู้รับทราบ
          nextApproverUserId = originDepot.Acknowledge_User_Id;
          console.log(`CUSTOMER TO CUSTOMER: ขั้นตอนที่ 4 อนุมัติแล้ว -> เปลี่ยนเป็น Waiting_CaseAction6`);
        }
      }
    }
    // กรณีไม่ใช่ entity_Customer to entity_Customer
    else if (isDepotOrigin && isDepotDestination) {
      // Use case 1: Depot to Depot
      if (isBKK && !isDestinationBKK) {
        // Use case 1: BKK to Depot (ต้นทางเป็น BKK และปลายทางเป็น Depot อื่น)
      if (approverStep === 1) {
          // ผู้อนุมัติที่ 1: "Branch Manager" (Approval1ref_User จาก entity_depot ต้นทาง BKK)
        // ขั้นตอนต่อไปคือ ผู้อนุมัติคนที่ 2
        nextApprovalStep = 2;
        nextApproverUserId = document.Move_Approval_2_User_Id;
        nextApproverName = document.Move_Approval_2_Name;
        nextApproverEmail = document.Move_Approval_2_Email;
        
        emailRecipient = nextApproverEmail;
        emailRecipientName = nextApproverName;
        
        // อัพเดต Current_step
          updateData.Current_step = 'Waiting_CaseAction3';
          console.log(`กำหนด Current_step = 'Waiting_CaseAction3' (Use case 1, step 1)`);
      } else if (approverStep === 2) {
          // ผู้อนุมัติที่ 2: "Branch Manager" (Approval2ref_User จาก entity_depot ปลายทาง)
          // เมื่อผู้อนุมัติคนที่ 2 อนุมัติแล้ว ส่งไปยังผู้รับทราบ (Account จาก entity_depot ต้นทาง BKK)
        updateData.Document_Status = 'A'; // เปลี่ยนสถานะเป็น Acknowledge
        updateData.Current_step = 'Waiting_CaseAction6';
        
          // ส่งข้อมูลไปยังผู้รับทราบ (Acknowledge_User_Id จาก entity_depot ต้นทาง BKK)
        if (originDepot && originDepot.Acknowledge_User_Email) {
          emailRecipient = originDepot.Acknowledge_User_Email;
          emailRecipientName = originDepot.Acknowledge_User_Name;
          
          // กำหนด Next_Approval_User_Id เป็นผู้รับทราบ
          nextApproverUserId = originDepot.Acknowledge_User_Id;
        }
          
          console.log(`กำหนด Current_step = 'Waiting_CaseAction6' (Use case 1, step 2)`);
      }
      } else if (!isBKK && isDestinationBKK) {
        // Use case 2: Depot to BKK (ต้นทางเป็น Depot อื่น และปลายทางเป็น BKK)
      if (approverStep === 1) {
          // ผู้อนุมัติที่ 1: "Branch Manager" (Approval1ref_User จาก entity_depot ต้นทาง)
        // ขั้นตอนต่อไปคือ ผู้อนุมัติคนที่ 2
        nextApprovalStep = 2;
        nextApproverUserId = document.Move_Approval_2_User_Id;
        nextApproverName = document.Move_Approval_2_Name;
        nextApproverEmail = document.Move_Approval_2_Email;
        
        emailRecipient = nextApproverEmail;
        emailRecipientName = nextApproverName;
        
        // อัพเดต Current_step
        updateData.Current_step = 'Waiting_CaseAction2';
          console.log(`กำหนด Current_step = 'Waiting_CaseAction2' (Use case 2, step 1)`);
        } else if (approverStep === 2) {
          // ผู้อนุมัติที่ 2: "Sales AssetEntity Manager" (Approval2ref_User จาก entity_depot ปลายทาง BKK)
          // เมื่อผู้อนุมัติคนที่ 2 อนุมัติแล้ว ส่งไปยังผู้รับทราบ (Account จาก entity_depot ต้นทาง)
          updateData.Document_Status = 'A'; // เปลี่ยนสถานะเป็น Acknowledge
          updateData.Current_step = 'Waiting_CaseAction6';
          
          // ส่งข้อมูลไปยังผู้รับทราบ (Acknowledge_User_Id จาก entity_depot ต้นทาง)
          if (originDepot && originDepot.Acknowledge_User_Email) {
            emailRecipient = originDepot.Acknowledge_User_Email;
            emailRecipientName = originDepot.Acknowledge_User_Name;
            
            // กำหนด Next_Approval_User_Id เป็นผู้รับทราบ
            nextApproverUserId = originDepot.Acknowledge_User_Id;
          }
          
          console.log(`กำหนด Current_step = 'Waiting_CaseAction6' (Use case 2, step 2)`);
        }
      }
    }
    // Use case 3: BKK to entity_Customer หรือ entity_Customer to BKK
    else if ((isBKK && !isDepotDestination) || (!isDepotOrigin && isDestinationBKK)) {
      console.log('**** พบว่าเป็นกรณี BKK TO CUSTOMER หรือ CUSTOMER TO BKK ****');
      
      if (approverStep === 1) {
        // ผู้อนุมัติที่ 1: "Area Sales Manager" (Approval1ref_User จาก entity_depot ต้นทาง)
        // ขั้นตอนต่อไปคือ ผู้อนุมัติคนที่ 2
        nextApprovalStep = 2;
        nextApproverUserId = document.Move_Approval_2_User_Id;
        nextApproverName = document.Move_Approval_2_Name;
        nextApproverEmail = document.Move_Approval_2_Email;
        
        emailRecipient = nextApproverEmail;
        emailRecipientName = nextApproverName;
        
        // อัพเดต Current_step
        updateData.Current_step = 'Waiting_CaseAction2';
        console.log(`กำหนด Current_step = 'Waiting_CaseAction2' (Use case 3, step 1)`);
      } else if (approverStep === 2) {
        // ผู้อนุมัติที่ 2: "Sales AssetEntity Manager" (Approval2ref_User จาก entity_depot ต้นทาง)
        // ขั้นตอนต่อไปคือ ผู้อนุมัติคนที่ 3 (entity_Customer)
        nextApprovalStep = 3;
        nextApproverUserId = document.Move_Approval_3_User_Id;
        nextApproverName = document.Move_Approval_3_Name;
        nextApproverEmail = document.Move_Approval_3_Email;
        
        emailRecipient = nextApproverEmail;
        emailRecipientName = nextApproverName;
        
        // อัพเดต Current_step
        updateData.Current_step = 'Waiting_Customer';
        console.log(`กำหนด Current_step = 'Waiting_Customer' (Use case 3, step 2)`);
      } else if (approverStep === 3) {
        // ผู้อนุมัติที่ 3: "entity_Customer" (Approval3ref_User จาก entity_depot ต้นทาง)
        // เมื่อผู้อนุมัติคนที่ 3 อนุมัติแล้ว ส่งไปยังผู้รับทราบ
        updateData.Document_Status = 'A'; // เปลี่ยนสถานะเป็น Acknowledge
        updateData.Current_step = 'Waiting_CaseAction6';
        
        // ส่งข้อมูลไปยังผู้รับทราบ (Acknowledge_User_Id จาก entity_depot ต้นทาง)
        if (originDepot && originDepot.Acknowledge_User_Email) {
          emailRecipient = originDepot.Acknowledge_User_Email;
          emailRecipientName = originDepot.Acknowledge_User_Name;
          
          // กำหนด Next_Approval_User_Id เป็นผู้รับทราบ
          nextApproverUserId = originDepot.Acknowledge_User_Id;
        }
        
        console.log(`กำหนด Current_step = 'Waiting_CaseAction6' (Use case 3, step 3)`);
      }
    }
    // Use case 4: Depot to entity_Customer หรือ entity_Customer to Depot ที่ไม่เกี่ยวกับ BKK
    else if (document.Origin_Location_Type !== 'C' || document.Destination_Location_Type !== 'C') {
      console.log('**** พบว่าเป็นกรณี DEPOT TO CUSTOMER หรือ CUSTOMER TO DEPOT ที่ไม่เกี่ยวกับ BKK ****');
      
      if (approverStep === 1) {
        // ผู้อนุมัติที่ 1: "Branch Manager" (Approval1ref_User จาก entity_depot ต้นทาง)
        // ขั้นตอนต่อไปคือ ผู้อนุมัติคนที่ 2
        nextApprovalStep = 2;
        nextApproverUserId = document.Move_Approval_2_User_Id;
        nextApproverName = document.Move_Approval_2_Name;
        nextApproverEmail = document.Move_Approval_2_Email;
        
        emailRecipient = nextApproverEmail;
        emailRecipientName = nextApproverName;
        
        // อัพเดต Current_step
        updateData.Current_step = 'Waiting_CaseAction5';
        console.log(`กำหนด Current_step = 'Waiting_CaseAction5' (Use case 4, step 1)`);
      } else if (approverStep === 2) {
        // ผู้อนุมัติที่ 2: "Area Sales Manager" (Approval2ref_User จาก entity_depot ต้นทาง)
        // ขั้นตอนต่อไปคือ ผู้อนุมัติคนที่ 3 (entity_Customer)
        nextApprovalStep = 3;
        nextApproverUserId = document.Move_Approval_3_User_Id;
        nextApproverName = document.Move_Approval_3_Name;
        nextApproverEmail = document.Move_Approval_3_Email;
        
        emailRecipient = nextApproverEmail;
        emailRecipientName = nextApproverName;
        
        // อัพเดต Current_step
        updateData.Current_step = 'Waiting_Customer';
        console.log(`กำหนด Current_step = 'Waiting_Customer' (Use case 4, step 2)`);
      } else if (approverStep === 3) {
        // ผู้อนุมัติที่ 3: "entity_Customer" (Approval3ref_User จาก entity_depot ต้นทาง)
        // เมื่อผู้อนุมัติคนที่ 3 อนุมัติแล้ว ส่งไปยังผู้รับทราบ
        updateData.Document_Status = 'A'; // เปลี่ยนสถานะเป็น Acknowledge
        updateData.Current_step = 'Waiting_CaseAction6';
        
        // ส่งข้อมูลไปยังผู้รับทราบ (Acknowledge_User_Id จาก entity_depot ต้นทาง)
        if (originDepot && originDepot.Acknowledge_User_Email) {
          emailRecipient = originDepot.Acknowledge_User_Email;
          emailRecipientName = originDepot.Acknowledge_User_Name;
          
          // กำหนด Next_Approval_User_Id เป็นผู้รับทราบ
          nextApproverUserId = originDepot.Acknowledge_User_Id;
        }
        
        console.log(`กำหนด Current_step = 'Waiting_CaseAction6' (Use case 4, step 3)`);
      }
    }

    // อัพเดตข้อมูลในฐานข้อมูล
    try {
      updatedMovement = await prisma.movement_Doccument.update({
        where: {
          Document_Number: documentNumber
        },
        data: updateData
      });
      
      console.log(`อัพเดตข้อมูลสำเร็จ: Document_Number=${documentNumber}`);
      
      // ตรวจสอบว่าการอัพเดตค่า Current_step สำเร็จหรือไม่
      if (updateData.Current_step && updatedMovement.Current_step !== updateData.Current_step) {
        console.error(`การอัพเดต Current_step เป็น ${updateData.Current_step} ไม่สำเร็จ (ค่าหลังบันทึก: ${updatedMovement.Current_step})`);
        
        // พยายามแก้ไขอีกครั้ง
        try {
          console.log(`พยายามอัพเดต Current_step อีกครั้ง...`);
          const secondUpdate = await prisma.movement_Doccument.update({
            where: { Document_Number: documentNumber },
            data: { Current_step: updateData.Current_step }
          });
          
          if (secondUpdate.Current_step !== updateData.Current_step) {
            throw new Error(`ไม่สามารถอัพเดต Current_step ได้แม้จะพยายามแล้ว`);
          }
          
          console.log(`การอัพเดต Current_step ครั้งที่สองสำเร็จ: ${secondUpdate.Current_step}`);
          
          // อัพเดตค่าใน updatedMovement
          updatedMovement.Current_step = secondUpdate.Current_step;
        } catch (secondUpdateError) {
          console.error(`การอัพเดต Current_step ครั้งที่สองล้มเหลว:`, secondUpdateError);
          return res.status(500).json({
            status: 'error',
            message: 'ไม่สามารถอัพเดตขั้นตอนการอนุมัติได้',
            detail: secondUpdateError.message
          });
        }
      } else {
        console.log(`การอัพเดต Current_step เป็น ${updatedMovement.Current_step} สำเร็จ`);
      }
    
      // ส่งอีเมลแจ้งเตือน
      if (emailRecipient) {
        try {
          await emailService.sendApprovalEmail({
            recipientEmail: emailRecipient,
            documentNumber: document.Document_Number,
            approverName: emailRecipientName,
            depotName: document.Created_Depot?.Name || document.Created_Depot_Code,
            originLocation: document.Origin_Description,
            destinationLocation: document.Destination_Description,
            totalAssets: document.MovementDetails.length,
            approvalType: nextApprovalStep > 0 ? 'origin' : 'destination'
          });

          console.log(`ส่งอีเมลแจ้งเตือนไปยัง ${emailRecipient} สำเร็จ`);
          
          // เพิ่ม console.log ที่เด่นชัด
          console.log('\n');
          console.log('*******************************************************');
          console.log('************ การแจ้งเตือนการอนุมัติเอกสาร *************');
          console.log('*******************************************************');
          console.log(`* เอกสารเลขที่: ${document.Document_Number}`);
          console.log(`* ส่งอีเมลแจ้งเตือนไปยัง: ${emailRecipient}`);
          console.log(`* ชื่อผู้รับ: ${emailRecipientName || 'ไม่ระบุ'}`);
          console.log(`* ประเภท: ${nextApprovalStep > 0 ? 'รออนุมัติ (ขั้นที่ ' + nextApprovalStep + ')' : 'แจ้งเสร็จสิ้น'}`);
          console.log(`* เวลาที่ส่ง: ${new Date().toLocaleString('th-TH')}`);
          console.log('*******************************************************');
          console.log('\n');
        } catch (emailError) {
          console.error('เกิดข้อผิดพลาดในการส่งอีเมล:', emailError);
        }
      }

      // ส่งการแจ้งเตือนไปยังทุกคนที่เกี่ยวข้อง
      try {
        // สร้างข้อความสถานะตาม Current_step
        let statusMessage = '';
        
        // Map Current_step เป็นข้อความที่เข้าใจง่าย
        const stepStatusMapping = {
          'Waiting_CaseAction1': 'รอการอนุมัติจากฝ่ายจัดการทรัพย์สิน',
          'Waiting_CaseAction2': 'รอการอนุมัติจากผู้จัดการฝ่ายทรัพย์สิน',
          'Waiting_CaseAction3': 'รอการอนุมัติจากผู้จัดการสาขา',
          'Waiting_CaseAction4': 'รอการอนุมัติจากหัวหน้าฝ่ายขาย',
          'Waiting_CaseAction5': 'รอการอนุมัติจากผู้จัดการฝ่ายขายประจำพื้นที่',
          'Waiting_Customer_Old': 'รอการอนุมัติจากลูกค้าเดิม',
          'Waiting_Customer': 'รอการอนุมัติจากลูกค้า',
          'Waiting_Customer_New': 'รอการอนุมัติจากลูกค้าใหม่',
          'Waiting_CaseAction6': 'รอการอนุมัติจากฝ่ายบัญชี'
        };
        
        // ใช้สถานะใหม่จาก updateData หรือใช้สถานะปัจจุบันจากเอกสารถ้าไม่มีการอัพเดต
        const currentStep = updateData.Current_step || document.Current_step;
        
        if (currentStep && stepStatusMapping[currentStep]) {
          statusMessage = stepStatusMapping[currentStep];
        } else if (document.Document_Status === 'C') {
          statusMessage = 'เสร็จสมบูรณ์การอนุมัติ';
        } else {
          statusMessage = 'อนุมัติในขั้นที่ ' + approverStep;
        }
        
        await emailService.notifyAllRelatedParties(
          document,
          'Y', // อนุมัติ
          `${approver.prefix || ''} ${approver.name || ''} ${approver.surname || ''}`.trim() || approver.code,
          approverStep,
          process.env.APP_URL || 'https://assettrackmove.com',
          statusMessage // ส่งข้อความสถานะที่ถูกต้องไปยังฟังก์ชัน
        );
        
        // เพิ่ม console.log การแจ้งเตือนทุกคนที่เกี่ยวข้อง
        console.log('\n');
        console.log('*******************************************************');
        console.log('************* การแจ้งเตือนผู้ที่เกี่ยวข้อง **************');
        console.log('*******************************************************');
        console.log(`* เอกสารเลขที่: ${document.Document_Number}`);
        console.log(`* ผู้อนุมัติ: ${approver.prefix || ''} ${approver.name || ''} ${approver.surname || ''}`.trim() || approver.code);
        console.log(`* ขั้นตอนที่: ${approverStep}`);
        console.log(`* สถานะ: ${statusMessage}`);
        console.log('*******************************************************');
        console.log('\n');
      } catch (notifyError) {
        console.error('เกิดข้อผิดพลาดในการแจ้งเตือนผู้ที่เกี่ยวข้อง:', notifyError);
      }
    } catch (updateError) {
      console.error('เกิดข้อผิดพลาดในการอัพเดตข้อมูลในฐานข้อมูล:', updateError);
      return res.status(500).json({
        status: 'error',
        message: 'เกิดข้อผิดพลาดในการอัพเดตข้อมูลในฐานข้อมูล',
        detail: updateError.message
      });
    }

    // Debug log ขณะอยู่นอก try/catch
    console.log('กำลังเตรียมส่งข้อมูลกลับให้ผู้ใช้...');
    console.log(`updatedMovement มีค่า: ${updatedMovement ? 'มี' : 'ไม่มี'}`);

    // เช็คว่ามีการกำหนดค่า updatedMovement หรือไม่
    const responseData = updatedMovement || {
      Document_Number: documentNumber,
      Current_step: updateData.Current_step,
      Document_Status: updateData.Document_Status,
      Updated_At: new Date()
    };

    // เพิ่มข้อมูลลายเซ็นในการตอบกลับ
    if (isCustomerSignatureStep && signatureUrl) {
      responseData.signatureUrl = signatureUrl;
      responseData.signatureUpdated = true;
      if (comment !== undefined) {
        responseData.comment = comment;
      }
    }

    console.log(`ข้อมูลที่จะส่งกลับ: ${JSON.stringify(responseData)}`);

    return res.status(200).json({
      status: 'success',
      message: isCustomerSignatureStep && signatureUrl ? 
              'บันทึกลายเซ็นและอนุมัติเอกสารสำเร็จ' : 
              'อัพเดตข้อมูลเอกสารสำเร็จ',
      data: responseData
    });
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการดำเนินการ:', error);
    return res.status(500).json({
      status: 'error',
      message: 'เกิดข้อผิดพลาดในการดำเนินการ',
      detail: error.message
    });
  }
};
  
exports.assetreject = async (req, res, next) => {
  try {
    // รับ id จาก route parameter และข้อมูลจาก request body
    const documentNumber = req.params.id;
    const { userId, reason, comment } = req.body;

    // ตรวจสอบข้อมูลที่จำเป็น
    if (!documentNumber || !userId || !reason) {
      return res.status(400).json({
        status: 'error',
        message: 'ข้อมูลไม่ครบถ้วน กรุณาระบุ id, userId และ reason'
      });
    }

    // ตรวจสอบสถานะเอกสารปัจจุบัน
    if (document.Document_Status === 'C' || document.Document_Status === 'R') {
      return res.status(400).json({
        status: 'error',
        message: `ไม่สามารถปฏิเสธเอกสารนี้ได้ เนื่องจากเอกสารมีสถานะ ${document.Document_Status} แล้ว`
      });
    }

    // ดึงข้อมูลผู้ใช้ที่ปฏิเสธ
    const rejecter = await prisma.user.findUnique({
      where: {
        code: userId
      }
    });

    if (!rejecter) {
      return res.status(404).json({
        status: 'error',
        message: 'ไม่พบข้อมูลผู้ปฏิเสธ'
      });
    }

    // ตรวจสอบว่าผู้ใช้เป็น ADMIN หรือไม่
    const isAdmin = rejecter.role_code === 'ADMIN' || rejecter.role_code === 'admin';

    // ค้นหาว่าผู้ใช้นี้อยู่ในขั้นตอนการอนุมัติใด
    let rejecterStep = 0;
    for (let i = 1; i <= 4; i++) {
      if (document[`Move_Approval_${i}_User_Id`] === userId) {
        rejecterStep = i;
        break;
      }
    }

    // ถ้าไม่ใช่ ADMIN และไม่มีสิทธิ์อนุมัติ ก็ไม่มีสิทธิ์ปฏิเสธเช่นกัน
    if (rejecterStep === 0 && !isAdmin) {
      return res.status(403).json({
        status: 'error',
        message: 'คุณไม่มีสิทธิ์ปฏิเสธเอกสารนี้'
      });
    }

    // ถ้าเป็น ADMIN และไม่ได้อยู่ในสิทธิ์อนุมัติ ให้กำหนดเป็นขั้นตอนปัจจุบัน
    if (rejecterStep === 0 && isAdmin) {
      // ตรวจสอบว่าอยู่ขั้นตอนไหน และกำหนด rejecterStep ตามนั้น
      for (let i = 1; i <= 4; i++) {
        if (document[`Move_Approval_${i}_Status`] !== 'Y' && document[`Move_Approval_${i}_User_Id`]) {
          rejecterStep = i;
          break;
        }
      }
      // ถ้าไม่พบขั้นตอนที่ยังไม่อนุมัติ ให้เป็นขั้นตอนที่ 1
      if (rejecterStep === 0) {
        rejecterStep = 1;
      }
    }

    // เตรียมข้อมูลสำหรับบันทึกการปฏิเสธ
    const currentDateTime = new Date();
    const updateData = {
      // ตั้งค่าสถานะเอกสารเป็น Rejected
      Document_Status: 'R',
      // บันทึกขั้นตอนที่ปฏิเสธ
      Current_step: 'Rejected',
      // ล้างค่า Next_Approval_User_Id เพื่อป้องกันไม่ให้มีการอนุมัติต่อ
      Next_Approval_User_Id: null,
      // บันทึกสถานะการปฏิเสธในขั้นตอนปัจจุบัน
      [`Move_Approval_${rejecterStep}_Status`]: 'R',
      [`Move_Approval_${rejecterStep}_Date`]: currentDateTime,
      // ใช้ฟิลด์ comment เก็บเหตุผลการปฏิเสธ
      [`Move_Approval_${rejecterStep}_comment`]: reason
    };

    // ถ้ามี comment เพิ่มเติม ให้ต่อท้าย reason
    if (comment && comment !== reason) {
      updateData[`Move_Approval_${rejecterStep}_comment`] = `${reason} - ${comment}`;
    }

    // อัพเดตข้อมูลในฐานข้อมูล
    try {
      const updatedMovement = await prisma.movement_Doccument.update({
        where: {
          Document_Number: documentNumber
        },
        data: updateData
      });

      console.log(`=========== ผลการปฏิเสธเอกสาร ===========`);
      console.log(`Document_Number: ${documentNumber}`);
      console.log(`Rejected by: ${userId}`);
      console.log(`Rejection Step: ${rejecterStep}`);
      console.log(`Rejection Reason: ${reason}`);
      console.log(`Rejection Comment: ${comment || 'ไม่มี'}`);
      console.log(`Status: Rejected (R)`);
      console.log(`===========================================`);

      // พยายามแจ้งเตือนผู้เกี่ยวข้องทั้งหมด
      try {
        // สร้างข้อความสถานะ
        const statusMessage = `เอกสารถูกปฏิเสธในขั้นตอนที่ ${rejecterStep} โดย ${rejecter.name || rejecter.code}`;
        
        await emailService.notifyAllRelatedParties(
          document,
          'R', // Rejected
          `${rejecter.prefix || ''} ${rejecter.name || ''} ${rejecter.surname || ''}`.trim() || rejecter.code,
          rejecterStep,
          process.env.APP_URL || 'https://assettrackmove.com',
          statusMessage
        );
        
        console.log(`ส่งการแจ้งเตือนไปยังผู้เกี่ยวข้องสำเร็จ`);
      } catch (notifyError) {
        console.error('เกิดข้อผิดพลาดในการแจ้งเตือนผู้ที่เกี่ยวข้อง:', notifyError);
      }

      // ส่งข้อมูลกลับไปยังผู้ใช้
      return res.status(200).json({
        status: 'success',
        message: 'ปฏิเสธเอกสารสำเร็จ',
        data: {
          Document_Number: updatedMovement.Document_Number,
          Document_Status: updatedMovement.Document_Status,
          Current_step: updatedMovement.Current_step,
          Rejected_By: userId,
          Rejected_At: currentDateTime,
          Rejection_Step: rejecterStep,
          Rejection_Comment: updatedMovement[`Move_Approval_${rejecterStep}_comment`] || reason
        }
      });
    } catch (updateError) {
      console.error('เกิดข้อผิดพลาดในการอัพเดตข้อมูลในฐานข้อมูล:', updateError);
      return res.status(500).json({
        status: 'error',
        message: 'เกิดข้อผิดพลาดในการอัพเดตข้อมูลในฐานข้อมูล',
        detail: updateError.message
      });
    }
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการดำเนินการ:', error);
    return res.status(500).json({
      status: 'error',
      message: 'เกิดข้อผิดพลาดในการดำเนินการ',
      detail: error.message
    });
  }
};


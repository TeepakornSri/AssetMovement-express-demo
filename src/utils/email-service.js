const nodemailer = require('nodemailer');
require('dotenv').config();

// สร้าง transporter สำหรับส่งอีเมล
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_SERVER,
    port: process.env.SMTP_PORT,
    secure: true, // ใช้สำหรับพอร์ต 465
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
};

/**
 * ส่งอีเมลแจ้งเตือนให้ผู้อนุมัติ
 * @param {string} recipientEmail - อีเมลของผู้รับ
 * @param {string} documentNumber - เลขที่เอกสาร
 * @param {string} approverName - ชื่อผู้อนุมัติ
 * @param {string} depotName - ชื่อคลัง
 * @param {string} originLocation - สถานที่ต้นทาง
 * @param {string} destinationLocation - สถานที่ปลายทาง
 * @param {number} totalAssets - จำนวนทรัพย์สินทั้งหมด
 * @param {string} baseURL - URL พื้นฐานของเว็บแอปพลิเคชัน
 * @param {string} approvalType - ประเภทการอนุมัติ ('origin' หรือ 'destination')
 */
const sendApprovalEmail = async ({
  recipientEmail,
  documentNumber,
  approverName,
  depotName,
  originLocation,
  destinationLocation,
  totalAssets,
  baseURL = process.env.APP_URL,
  approvalType = 'origin' // ค่าเริ่มต้นเป็นการอนุมัติต้นทาง
}) => {
  try {
    console.log(`[EMAIL-SERVICE] กำลังส่งอีเมลการอนุมัติไปยัง: ${recipientEmail}`);
    
    const transporter = createTransporter();
    
    // แสดงรายละเอียดการตั้งค่า SMTP
    console.log('[EMAIL-SERVICE] การตั้งค่า SMTP:');
    console.log('- Host:', process.env.SMTP_SERVER);
    console.log('- Port:', process.env.SMTP_PORT);
    console.log('- User:', process.env.MAIL_USER);
    console.log('- APP_URL:', process.env.APP_URL);
    
    const approveLink = `${baseURL}/approve-movement/${documentNumber}/approve`;
    const rejectLink = `${baseURL}/approve-movement/${documentNumber}/reject`;
    const viewDocLink = `${baseURL}/movement/view/${documentNumber}`;
    
    // กำหนดหัวข้ออีเมลตามประเภทการอนุมัติ
    let subject = `[รอการอนุมัติ] เอกสารเคลื่อนย้ายทรัพย์สิน ${documentNumber}`;
    let additionalInfo = '';
    
    if (approvalType === 'origin') {
      subject = `[รอการอนุมัติจากต้นทาง] เอกสารเคลื่อนย้ายทรัพย์สิน ${documentNumber}`;
      additionalInfo = '<p><strong style="color: #0769de;">ขั้นตอนนี้คือการอนุมัติจากต้นทาง</strong></p>';
    } else if (approvalType === 'destination') {
      subject = `[รอการอนุมัติจากปลายทาง] เอกสารเคลื่อนย้ายทรัพย์สิน ${documentNumber}`;
      additionalInfo = '<p><strong style="color: #0769de;">ขั้นตอนนี้คือการอนุมัติจากปลายทาง</strong></p>';
    }
    
    const mailOptions = {
      from: process.env.EMAIL || 'fnu_it_support@fnnfoods.com',
      to: recipientEmail,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #333;">
          <p>เรียน ${approverName || 'ผู้อนุมัติ'},</p>
          <p>เอกสารเคลื่อนย้ายทรัพย์สินหมายเลข <strong>${documentNumber}</strong> รอการอนุมัติจากท่าน</p>
          
          ${additionalInfo}
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p style="margin: 5px 0;"><strong>คลังที่สร้าง:</strong> ${depotName || '-'}</p>
            <p style="margin: 5px 0;"><strong>ต้นทาง:</strong> ${originLocation || '-'}</p>
            <p style="margin: 5px 0;"><strong>ปลายทาง:</strong> ${destinationLocation || '-'}</p>
            <p style="margin: 5px 0;"><strong>จำนวนทรัพย์สิน:</strong> ${totalAssets || '0'} รายการ</p>
          </div>
          
          <div style="margin: 20px 0; text-align: center;">
            <a href="${approveLink}" style="display: inline-block; padding: 10px 20px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px; margin: 5px;">อนุมัติ</a>
            <a href="${rejectLink}" style="display: inline-block; padding: 10px 20px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 5px; margin: 5px;">ปฏิเสธ</a>
            <a href="${viewDocLink}" style="display: inline-block; padding: 10px 20px; background-color: #0769de; color: white; text-decoration: none; border-radius: 5px; margin: 5px;">ดูรายละเอียด</a>
          </div>
          
          <p style="color: #6c757d; font-size: 0.9em;">
            นี่คืออีเมลอัตโนมัติ กรุณาอย่าตอบกลับ
          </p>
        </div>
      `,
    };
    
    console.log('[EMAIL-SERVICE] กำลังส่งอีเมล...');
    const info = await transporter.sendMail(mailOptions);
    console.log('[EMAIL-SERVICE] ส่งอีเมลสำเร็จ!');
    console.log('- MessageId:', info.messageId);
    console.log('- Response:', info.response);
    
    return { success: true, messageId: info.messageId, response: info.response };
  } catch (error) {
    console.error('[EMAIL-SERVICE] เกิดข้อผิดพลาดในการส่งอีเมล:', error);
    console.error('- ข้อความผิดพลาด:', error.message);
    console.error('- สาเหตุ:', error.cause || 'ไม่ทราบสาเหตุ');
    
    return { success: false, error: error.message, cause: error.cause };
  }
};

/**
 * ส่งอีเมลแจ้งเตือนการสร้างเอกสารใหม่
 * @param {string} recipientEmail - อีเมลของผู้รับ
 * @param {string} documentNumber - เลขที่เอกสาร
 * @param {string} depotName - ชื่อคลัง
 * @param {string} originLocation - สถานที่ต้นทาง
 * @param {string} destinationLocation - สถานที่ปลายทาง
 * @param {string} createdBy - ชื่อผู้สร้างเอกสาร
 * @param {number} totalAssets - จำนวนทรัพย์สินทั้งหมด
 * @param {string} baseURL - URL พื้นฐานของเว็บแอปพลิเคชัน
 */
const sendNewDocumentEmail = async ({
  recipientEmail,
  documentNumber,
  depotName,
  originLocation,
  destinationLocation,
  createdBy,
  totalAssets,
  baseURL = process.env.APP_URL
}) => {
  try {
    const transporter = createTransporter();
    
    const viewDocLink = `${baseURL}/movement/view/${documentNumber}`;
    
    const subject = `[เอกสารใหม่] เอกสารเคลื่อนย้ายทรัพย์สิน ${documentNumber}`;
    
    const mailOptions = {
      from: process.env.EMAIL || 'fordeveloptest0@gmail.com',
      to: recipientEmail,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #333;">
          <p>เรียนท่านผู้เกี่ยวข้อง,</p>
          <p>เอกสารเคลื่อนย้ายทรัพย์สินหมายเลข <strong>${documentNumber}</strong> ได้ถูกสร้างในระบบ</p>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p style="margin: 5px 0;"><strong>สร้างโดย:</strong> ${createdBy || '-'}</p>
            <p style="margin: 5px 0;"><strong>คลังที่สร้าง:</strong> ${depotName || '-'}</p>
            <p style="margin: 5px 0;"><strong>ต้นทาง:</strong> ${originLocation || '-'}</p>
            <p style="margin: 5px 0;"><strong>ปลายทาง:</strong> ${destinationLocation || '-'}</p>
            <p style="margin: 5px 0;"><strong>จำนวนทรัพย์สิน:</strong> ${totalAssets || '0'} รายการ</p>
          </div>
          
          <div style="margin: 20px 0; text-align: center;">
            <a href="${viewDocLink}" style="display: inline-block; padding: 10px 20px; background-color: #0769de; color: white; text-decoration: none; border-radius: 5px;">ดูรายละเอียด</a>
          </div>
          
          <p style="color: #6c757d; font-size: 0.9em;">
            นี่คืออีเมลอัตโนมัติ กรุณาอย่าตอบกลับ
          </p>
        </div>
      `,
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('New document email sent successfully:', info.response);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending new document email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * ส่งอีเมลแจ้งเตือนการอัปเดตสถานะเอกสาร
 * @param {string} recipientEmail - อีเมลของผู้รับ
 * @param {string} documentNumber - เลขที่เอกสาร
 * @param {string} status - สถานะใหม่ของเอกสาร
 * @param {string} depotName - ชื่อคลัง
 * @param {string} statusBy - ชื่อผู้อัปเดตสถานะ
 * @param {string} baseURL - URL พื้นฐานของเว็บแอปพลิเคชัน
 * @param {string} statusMessage - ข้อความสถานะที่ต้องการแสดง
 */
const sendStatusUpdateEmail = async ({
  recipientEmail,
  documentNumber,
  status,
  depotName,
  statusBy,
  baseURL = process.env.APP_URL,
  statusMessage
}) => {
  try {
    const transporter = createTransporter();
    
    const viewDocLink = `${baseURL}/movement/view/${documentNumber}`;
    let statusText = '';
    let statusColor = '';
    
    // กำหนดข้อความและสีตามสถานะ
    if (statusMessage) {
      // ใช้ข้อความสถานะที่ส่งมาจากภายนอก
      statusText = statusMessage;
      statusColor = '#ffc107'; // สีเหลืองสำหรับสถานะรอดำเนินการ
    } else {
      // กำหนดตามสถานะเดิม
      switch (status) {
        case 'Y':
          statusText = 'อนุมัติแล้ว';
          statusColor = '#28a745';
          break;
        case 'R':
          statusText = 'ถูกปฏิเสธ';
          statusColor = '#dc3545';
          break;
        case 'I':
          statusText = 'กำลังดำเนินการ';
          statusColor = '#ffc107';
          break;
        case 'C':
          statusText = 'เสร็จสมบูรณ์';
          statusColor = '#0069d9';
          break;
        case 'X':
          statusText = 'ถูกยกเลิก';
          statusColor = '#6c757d';
          break;
        case 'O':
          // ไม่ควรส่งอีเมลแจ้งเตือนสถานะ 'O' เพราะใช้ sendNewDocumentEmail แทน
          return { success: false, error: 'ไม่ควรส่งอีเมลแจ้งเตือนสำหรับสถานะ O' };
        default:
          statusText = status;
          statusColor = '#6c757d';
      }
    }
    
    const subject = `[อัปเดตสถานะ] เอกสารเคลื่อนย้ายทรัพย์สิน ${documentNumber} - ${statusText}`;
    
    const mailOptions = {
      from: process.env.EMAIL || 'fordeveloptest0@gmail.com',
      to: recipientEmail,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #333;">
          <p>เรียนท่านผู้เกี่ยวข้อง,</p>
          <p>เอกสารเคลื่อนย้ายทรัพย์สินหมายเลข <strong>${documentNumber}</strong> ได้รับการอัปเดตสถานะเป็น:</p>
          
          <div style="text-align: center; margin: 20px 0;">
            <span style="background-color: ${statusColor}; color: white; padding: 8px 15px; border-radius: 5px; font-weight: bold;">
              ${statusText}
            </span>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p style="margin: 5px 0;"><strong>คลังที่สร้าง:</strong> ${depotName || '-'}</p>
            <p style="margin: 5px 0;"><strong>อัปเดตโดย:</strong> ${statusBy || '-'}</p>
          </div>
          
          <div style="margin: 20px 0; text-align: center;">
            <a href="${viewDocLink}" style="display: inline-block; padding: 10px 20px; background-color: #0769de; color: white; text-decoration: none; border-radius: 5px;">ดูรายละเอียด</a>
          </div>
          
          <p style="color: #6c757d; font-size: 0.9em;">
            นี่คืออีเมลอัตโนมัติ กรุณาอย่าตอบกลับ
          </p>
        </div>
      `,
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Status update email sent successfully:', info.response);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending status update email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * ส่งอีเมลแจ้งเตือนต่อผู้เกี่ยวข้องทั้งหมด
 * @param {Array} emails - อาร์เรย์ของอีเมลที่ต้องการส่ง
 * @param {Object} data - ข้อมูลที่ใช้ในการส่งอีเมล
 */
const notifyAllParties = async (emails, data) => {
  if (!emails || emails.length === 0) {
    console.log('No emails to notify');
    return { success: false, message: 'No emails to notify' };
  }
  
  const results = [];
  
  for (const email of emails) {
    if (email) {
      try {
        const result = await sendStatusUpdateEmail({
          recipientEmail: email,
          ...data
        });
        results.push({ email, result });
      } catch (error) {
        console.error(`Failed to send email to ${email}:`, error);
        results.push({ email, error: error.message });
      }
    }
  }
  
  return { success: true, results };
};

/**
 * รวบรวมอีเมลของผู้เกี่ยวข้องทั้งหมดในเอกสาร
 * @param {Object} movementHeader - ข้อมูลหัวเอกสารการเคลื่อนย้าย
 * @param {Object} options - ตัวเลือกเพิ่มเติม
 * @param {boolean} options.includeOrigin - รวมผู้อนุมัติต้นทางหรือไม่
 * @param {boolean} options.includeDestination - รวมผู้อนุมัติปลายทางหรือไม่
 * @returns {Array} อาร์เรย์ของอีเมลที่ไม่ซ้ำกัน
 */
const getAllRelatedEmails = (movementHeader, options = {}) => {
  const { includeOrigin = true, includeDestination = true } = options;
  const emails = [];
  
  // เพิ่มอีเมลของผู้อนุมัติตามเงื่อนไข
  if (includeOrigin && movementHeader.Move_Approval_1_Email) {
    emails.push(movementHeader.Move_Approval_1_Email);
  }
  
  if (includeDestination && movementHeader.Move_Approval_2_Email) {
    emails.push(movementHeader.Move_Approval_2_Email);
  }
  
  // เพิ่มอีเมลของผู้อนุมัติคนอื่นๆ (ถ้ามี)
  if (movementHeader.Move_Approval_3_Email) {
    emails.push(movementHeader.Move_Approval_3_Email);
  }
  
  if (movementHeader.Move_Approval_4_Email) {
    emails.push(movementHeader.Move_Approval_4_Email);
  }
  
  // เพิ่มอีเมลของผู้รับทราบ (acknowledge)
  if (movementHeader.Acknowledge_User_Email) {
    emails.push(movementHeader.Acknowledge_User_Email);
  }
  
  // กรองอีเมลที่ซ้ำกันออก
  return [...new Set(emails)].filter(email => email);
};

/**
 * ส่งอีเมลแจ้งเตือนทุกคนที่เกี่ยวข้องเมื่อมีการเปลี่ยนแปลงสถานะเอกสาร
 * @param {Object} movementHeader - ข้อมูลหัวเอกสารการเคลื่อนย้าย
 * @param {string} status - สถานะใหม่ของเอกสาร (Y=อนุมัติ, R=ปฏิเสธ, C=เสร็จสมบูรณ์, X=ยกเลิก)
 * @param {string} actionBy - ชื่อผู้ดำเนินการ
 * @param {number} approvalStep - ขั้นตอนการอนุมัติ (1, 2, 3, หรือ 4)
 * @param {string} baseURL - URL พื้นฐานของเว็บแอปพลิเคชัน
 * @param {string} statusMessage - ข้อความสถานะที่ต้องการแสดง
 */
const notifyAllRelatedParties = async (movementHeader, status, actionBy, approvalStep, baseURL, statusMessage) => {
  const emailList = [];
  const results = [];
  
  // 1. รวมอีเมลของผู้เกี่ยวข้องตามเงื่อนไข
  
  // เพิ่มอีเมลของผู้สร้างเอกสารเสมอ (ถ้ามีข้อมูล)
  const creatorEmail = await getUserEmailByUsercode(movementHeader.Created_By);
  if (creatorEmail) {
    emailList.push(creatorEmail);
  }
  
  // กรณีอนุมัติ (Y) โดยผู้อนุมัติที่ 1 ให้ส่งอีเมลแจ้งเตือนผู้อนุมัติที่ 2
  if (status === 'Y' && approvalStep === 1 && movementHeader.Move_Approval_2_Email) {
    if (movementHeader.Move_Approval_1_Email) {
      emailList.push(movementHeader.Move_Approval_1_Email); // แจ้งผู้อนุมัติที่ 1 ด้วย
    }
    emailList.push(movementHeader.Move_Approval_2_Email); // แจ้งผู้อนุมัติคนต่อไป
  }
  // กรณีปฏิเสธ (R) โดยผู้อนุมัติที่ 1 แจ้งเฉพาะผู้อนุมัติที่ 1 และผู้สร้าง
  else if (status === 'R' && approvalStep === 1 && movementHeader.Move_Approval_1_Email) {
    emailList.push(movementHeader.Move_Approval_1_Email);
  }
  // กรณีอนุมัติ (Y) โดยผู้อนุมัติที่ 2 ให้ส่งอีเมลแจ้งเตือนผู้อนุมัติที่ 3 ถ้ามี
  else if (status === 'Y' && approvalStep === 2) {
    if (movementHeader.Move_Approval_1_Email) {
      emailList.push(movementHeader.Move_Approval_1_Email);
    }
    if (movementHeader.Move_Approval_2_Email) {
      emailList.push(movementHeader.Move_Approval_2_Email);
    }
    if (movementHeader.Move_Approval_3_Email) {
      emailList.push(movementHeader.Move_Approval_3_Email);
    }
  }
  // กรณีปฏิเสธ (R) โดยผู้อนุมัติที่ 2 แจ้งผู้อนุมัติที่ 1, 2 และผู้สร้าง
  else if (status === 'R' && approvalStep === 2) {
    if (movementHeader.Move_Approval_1_Email) {
      emailList.push(movementHeader.Move_Approval_1_Email);
    }
    if (movementHeader.Move_Approval_2_Email) {
      emailList.push(movementHeader.Move_Approval_2_Email);
    }
  }
  // กรณียกเลิก (X) แจ้งทุกคนที่เกี่ยวข้อง
  else if (status === 'X') {
    if (movementHeader.Move_Approval_1_Email) {
      emailList.push(movementHeader.Move_Approval_1_Email);
    }
    if (movementHeader.Move_Approval_2_Email) {
      emailList.push(movementHeader.Move_Approval_2_Email);
    }
    if (movementHeader.Move_Approval_3_Email) {
      emailList.push(movementHeader.Move_Approval_3_Email);
    }
    if (movementHeader.Move_Approval_4_Email) {
      emailList.push(movementHeader.Move_Approval_4_Email);
    }
  }
  // กรณีเสร็จสมบูรณ์ (C) แจ้งทุกคนที่เกี่ยวข้อง
  else if (status === 'C') {
    if (movementHeader.Move_Approval_1_Email) {
      emailList.push(movementHeader.Move_Approval_1_Email);
    }
    if (movementHeader.Move_Approval_2_Email) {
      emailList.push(movementHeader.Move_Approval_2_Email);
    }
    if (movementHeader.Move_Approval_3_Email) {
      emailList.push(movementHeader.Move_Approval_3_Email);
    }
    if (movementHeader.Move_Approval_4_Email) {
      emailList.push(movementHeader.Move_Approval_4_Email);
    }
    if (movementHeader.Acknowledge_User_Email) {
      emailList.push(movementHeader.Acknowledge_User_Email);
    }
  }
  
  // ลบอีเมลที่ซ้ำกัน
  const uniqueEmails = [...new Set(emailList)].filter(email => email);
  
  // แสดงรายการอีเมลที่จะส่ง
  console.log(`กำลังส่งอีเมลแจ้งเตือนไปยัง ${uniqueEmails.length} อีเมล:`, uniqueEmails);
  
  // ถ้าไม่มีอีเมลที่ต้องแจ้งเตือน
  if (uniqueEmails.length === 0) {
    return { success: false, message: 'ไม่มีอีเมลที่ต้องแจ้งเตือน' };
  }
  
  // แก้ไข URL ที่มีปัญหา
  const formattedBaseURL = baseURL.endsWith('/') 
    ? baseURL.slice(0, -1) 
    : baseURL || 'https://assettrackmove.com';
  
  // 2. ส่งอีเมลแจ้งเตือนไปยังทุกคนที่เกี่ยวข้อง
  for (const email of uniqueEmails) {
    try {
      const result = await sendStatusUpdateEmail({
        recipientEmail: email,
        documentNumber: movementHeader.Document_Number,
        status: status,
        depotName: await getDepotNameByCode(movementHeader.Created_Depot_Code),
        statusBy: actionBy,
        baseURL: formattedBaseURL,
        statusMessage: statusMessage
      });
      
      results.push({ email, success: result.success });
      
    } catch (error) {
      console.error(`เกิดข้อผิดพลาดในการส่งอีเมลไปยัง ${email}:`, error);
      results.push({ email, success: false, error: error.message });
    }
  }
  
  return {
    success: true,
    totalEmails: uniqueEmails.length,
    successCount: results.filter(r => r.success).length,
    failCount: results.filter(r => !r.success).length,
    results
  };
};

// ฟังก์ชันช่วยเหลือสำหรับดึงข้อมูลอีเมลของผู้ใช้
async function getUserEmailByUsercode(code) {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const user = await prisma.user.findUnique({
      where: { code }
    });
    
    return user?.Contact_Email || null;
  } catch (error) {
    console.error('ไม่สามารถดึงข้อมูลอีเมลของผู้ใช้:', error);
    return null;
  }
}

// ฟังก์ชันช่วยเหลือสำหรับดึงชื่อคลัง
async function getDepotNameByCode(depotCode) {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const entity_depot = await prisma.entity_depot.findUnique({
      where: { Code: depotCode }
    });
    
    return entity_depot?.Name || depotCode;
  } catch (error) {
    console.error('ไม่สามารถดึงข้อมูลชื่อคลัง:', error);
    return depotCode;
  }
}

/**
 * ส่งอีเมลแจ้งเตือนให้ผู้อนุมัติเอกสารซ่อม
 * @param {string} recipientEmail - อีเมลของผู้รับ
 * @param {string} documentNumber - เลขที่เอกสาร
 * @param {string} approverName - ชื่อผู้อนุมัติ
 * @param {string} depotName - ชื่อคลัง
 * @param {string} repairLocation - สถานที่ซ่อม
 * @param {number} totalAssets - จำนวนทรัพย์สินทั้งหมด
 * @param {string} baseURL - URL พื้นฐานของเว็บแอปพลิเคชัน
 */
const sendRepairApprovalEmail = async ({
  recipientEmail,
  documentNumber,
  approverName,
  depotName,
  repairLocation,
  totalAssets,
  baseURL = process.env.APP_URL
}) => {
  try {
    console.log(`[EMAIL-SERVICE] กำลังส่งอีเมลการอนุมัติเอกสารซ่อมไปยัง: ${recipientEmail}`);
    
    const transporter = createTransporter();
    
    // แสดงรายละเอียดการตั้งค่า SMTP
    console.log('[EMAIL-SERVICE] การตั้งค่า SMTP:');
    console.log('- Host:', process.env.SMTP_SERVER);
    console.log('- Port:', process.env.SMTP_PORT);
    console.log('- User:', process.env.MAIL_USER);
    console.log('- APP_URL:', process.env.APP_URL);
    
    const approveLink = `${baseURL}/approve-repair/${documentNumber}/approve`;
    const rejectLink = `${baseURL}/approve-repair/${documentNumber}/reject`;
    const viewDocLink = `${baseURL}/repair/view/${documentNumber}`;
    
    const subject = `[รอการอนุมัติ] เอกสารแจ้งซ่อมทรัพย์สิน ${documentNumber}`;
    
    const mailOptions = {
      from: process.env.EMAIL || 'fnu_it_support@fnnfoods.com',
      to: recipientEmail,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #333;">
          <p>เรียน ${approverName || 'ผู้อนุมัติ'},</p>
          <p>เอกสารแจ้งซ่อมทรัพย์สินหมายเลข <strong>${documentNumber}</strong> รอการอนุมัติจากท่าน</p>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p style="margin: 5px 0;"><strong>คลังที่สร้าง:</strong> ${depotName || '-'}</p>
            <p style="margin: 5px 0;"><strong>สถานที่ซ่อม:</strong> ${repairLocation || '-'}</p>
            <p style="margin: 5px 0;"><strong>จำนวนทรัพย์สิน:</strong> ${totalAssets || '0'} รายการ</p>
          </div>
          
          <div style="margin: 20px 0; text-align: center;">
            <a href="${approveLink}" style="display: inline-block; padding: 10px 20px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px; margin: 5px;">อนุมัติ</a>
            <a href="${rejectLink}" style="display: inline-block; padding: 10px 20px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 5px; margin: 5px;">ปฏิเสธ</a>
            <a href="${viewDocLink}" style="display: inline-block; padding: 10px 20px; background-color: #0769de; color: white; text-decoration: none; border-radius: 5px; margin: 5px;">ดูรายละเอียด</a>
          </div>
          
          <p style="color: #6c757d; font-size: 0.9em;">
            นี่คืออีเมลอัตโนมัติ กรุณาอย่าตอบกลับ
          </p>
        </div>
      `,
    };
    
    console.log('[EMAIL-SERVICE] กำลังส่งอีเมล...');
    const info = await transporter.sendMail(mailOptions);
    console.log('[EMAIL-SERVICE] ส่งอีเมลสำเร็จ!');
    console.log('- MessageId:', info.messageId);
    console.log('- Response:', info.response);
    
    return { success: true, messageId: info.messageId, response: info.response };
  } catch (error) {
    console.error('[EMAIL-SERVICE] เกิดข้อผิดพลาดในการส่งอีเมล:', error);
    console.error('- ข้อความผิดพลาด:', error.message);
    console.error('- สาเหตุ:', error.cause || 'ไม่ทราบสาเหตุ');
    
    return { success: false, error: error.message, cause: error.cause };
  }
};

/**
 * ส่งอีเมลแจ้งเตือนการสร้างเอกสารซ่อมใหม่
 * @param {string} recipientEmail - อีเมลของผู้รับ
 * @param {string} documentNumber - เลขที่เอกสาร
 * @param {string} depotName - ชื่อคลัง
 * @param {string} repairLocation - สถานที่ซ่อม
 * @param {string} createdBy - ชื่อผู้สร้างเอกสาร
 * @param {number} totalAssets - จำนวนทรัพย์สินทั้งหมด
 * @param {string} baseURL - URL พื้นฐานของเว็บแอปพลิเคชัน
 */
const sendNewRepairDocumentEmail = async ({
  recipientEmail,
  documentNumber,
  depotName,
  repairLocation,
  createdBy,
  totalAssets,
  baseURL = process.env.APP_URL
}) => {
  try {
    const transporter = createTransporter();
    
    const viewDocLink = `${baseURL}/repair/view/${documentNumber}`;
    
    const subject = `[เอกสารใหม่] เอกสารแจ้งซ่อมทรัพย์สิน ${documentNumber}`;
    
    const mailOptions = {
      from: process.env.EMAIL || 'fordeveloptest0@gmail.com',
      to: recipientEmail,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #333;">
          <p>เรียนท่านผู้เกี่ยวข้อง,</p>
          <p>เอกสารแจ้งซ่อมทรัพย์สินหมายเลข <strong>${documentNumber}</strong> ได้ถูกสร้างในระบบ</p>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p style="margin: 5px 0;"><strong>สร้างโดย:</strong> ${createdBy || '-'}</p>
            <p style="margin: 5px 0;"><strong>คลังที่สร้าง:</strong> ${depotName || '-'}</p>
            <p style="margin: 5px 0;"><strong>สถานที่ซ่อม:</strong> ${repairLocation || '-'}</p>
            <p style="margin: 5px 0;"><strong>จำนวนทรัพย์สิน:</strong> ${totalAssets || '0'} รายการ</p>
          </div>
          
          <div style="margin: 20px 0; text-align: center;">
            <a href="${viewDocLink}" style="display: inline-block; padding: 10px 20px; background-color: #0769de; color: white; text-decoration: none; border-radius: 5px;">ดูรายละเอียด</a>
          </div>
          
          <p style="color: #6c757d; font-size: 0.9em;">
            นี่คืออีเมลอัตโนมัติ กรุณาอย่าตอบกลับ
          </p>
        </div>
      `,
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('New repair document email sent successfully:', info.response);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending new repair document email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendApprovalEmail,
  sendStatusUpdateEmail,
  sendNewDocumentEmail,
  notifyAllParties,
  getAllRelatedEmails,
  notifyAllRelatedParties,
  getUserEmailByUsercode,
  getDepotNameByCode,
  sendRepairApprovalEmail,
  sendNewRepairDocumentEmail
}; 
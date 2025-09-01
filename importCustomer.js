const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

// รับพารามิเตอร์จากคำสั่ง
const excelFilePath = process.argv[2];

if (!excelFilePath) {
  console.log('กรุณาระบุพาธของไฟล์ Excel');
  process.exit(1);
}

// สร้างฟังก์ชันสำหรับบันทึกล็อก
const logFilePath = path.join(__dirname, 'import_log.txt');
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFilePath, logMessage);
  console.log(message);
}

// ฟังก์ชันสำหรับดึงค่าจากฟิลด์ที่เป็นไปได้หลายชื่อ และแปลงเป็น String เสมอ
function getFieldValue(row, possibleFieldNames, defaultValue = null) {
  // ตรวจสอบว่า row เป็น object หรือไม่
  if (!row || typeof row !== 'object') {
    return defaultValue;
  }
  
  // ค้นหาจากชื่อฟิลด์ที่เป็นไปได้
  for (const fieldName of possibleFieldNames) {
    // ค้นหาแบบตรงๆ
    if (row[fieldName] !== undefined && row[fieldName] !== null && row[fieldName] !== '') {
      // แปลงเป็น String เสมอ
      return String(row[fieldName]);
    }
  }
  
  // ค้นหาแบบไม่สนใจตัวพิมพ์ใหญ่-เล็ก
  for (const fieldName of possibleFieldNames) {
    for (const key in row) {
      if (key.toLowerCase() === fieldName.toLowerCase() && 
          row[key] !== undefined && row[key] !== null && row[key] !== '') {
        // แปลงเป็น String เสมอ
        return String(row[key]);
      }
    }
  }
  
  return defaultValue;
}

// ฟังก์ชันสำหรับดึงค่า entity_Customer_Status โดยเฉพาะ
function getStatusValue(row) {
  // ค้นหาจากชื่อฟิลด์ที่เป็นไปได้
  const possibleFieldNames = ['entity_Customer_Status', 'Status', 'สถานะ'];
  
  for (const fieldName of possibleFieldNames) {
    // ค้นหาแบบตรงๆ
    if (row[fieldName] !== undefined && row[fieldName] !== null) {
      // แปลงเป็น String เสมอ
      return String(row[fieldName]);
    }
  }
  
  // ค้นหาแบบไม่สนใจตัวพิมพ์ใหญ่-เล็ก
  for (const fieldName of possibleFieldNames) {
    for (const key in row) {
      if (key.toLowerCase() === fieldName.toLowerCase() && 
          row[key] !== undefined && row[key] !== null) {
        // แปลงเป็น String เสมอ
        return String(row[key]);
      }
    }
  }
  
  // ถ้าไม่พบ ให้ใช้ค่าเริ่มต้น
  return 'ACTIVE';
}

// แปลงข้อมูลทั้งหมดเป็น String
function convertAllToString(data) {
  const result = {};
  for (const key in data) {
    if (data[key] !== null && data[key] !== undefined) {
      result[key] = String(data[key]);
    } else {
      result[key] = null;
    }
  }
  return result;
}

// ตรวจสอบว่ามี entity_Customer_ID ซ้ำหรือไม่ และดึงข้อมูลเก่ามาเปรียบเทียบ
async function checkSMIDExists(smId) {
  if (!smId) return false;
  
  try {
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        entity_Customer_ID: smId
      }
    });
    
    return existingCustomer ? existingCustomer : false;
  } catch (error) {
    log(`เกิดข้อผิดพลาดในการตรวจสอบ entity_Customer_ID: ${error.message}`);
    return false;
  }
}

// เพิ่มแม็ปปิ้งระหว่างชื่อภาษาไทยและรหัส Depot
const thaiNameToDepotCode = {
  'กรุงเทพ': 'BKK',
  'อยุธยา': 'AYT', 
  'จันทบุรี': 'CTN',
  'เชียงใหม่': 'CHM',
  'เชียงราย': 'CHR',
  'ชลบุรี': 'CHN',
  'หาดใหญ่': 'HAD',
  'ขอนแก่น': 'KKN',
  'โคราช': 'KOR',
  'นครราชสีมา': 'KOR',
  'พิษณุโลก': 'PIT',
  'ราชบุรี': 'RAT',
  'สุราษฎร์': 'SUR',
  'สุรินทร์': 'SRI',
  'อุบลราชธานี': 'UBN',
  'อุดรธานี': 'UDN',
  'ยะลา': 'YAL'
};

// เพิ่ม async ให้กับฟังก์ชัน
async function importCustomerData() {
  log(`เริ่มนำเข้าข้อมูลจากไฟล์: ${excelFilePath}`);
  
  try {
    // อ่านไฟล์ Excel
    const workbook = xlsx.readFile(path.resolve(excelFilePath), {
      type: 'binary',
      cellDates: true,
      cellNF: false,
      cellText: false
    });
    
    // ตรวจสอบว่ามีชีตหรือไม่
    if (workbook.SheetNames.length === 0) {
      log('ไม่พบชีตในไฟล์ Excel');
      return;
    }
    
    // อ่านชีตแรก
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // แปลงข้อมูลทั้งหมดในแต่ละแถวเป็น String
    const customers = xlsx.utils.sheet_to_json(worksheet).map(convertAllToString);
    
    log(`จำนวนข้อมูลทั้งหมด: ${customers.length} รายการ`);
    
    // ตรวจสอบว่ามีข้อมูลหรือไม่
    if (customers.length === 0) {
      log('ไม่พบข้อมูลในไฟล์ Excel');
      return;
    }
    
    // ตรวจสอบคอลัมน์ในไฟล์ Excel
    if (customers.length > 0) {
      const firstRow = customers[0];
      log('คอลัมน์ทั้งหมดในไฟล์ Excel:');
      for (const key in firstRow) {
        log(`  ${key}: ${firstRow[key]}`);
      }
    }
    
    // ดึงข้อมูล Area ทั้งหมด
    const allAreas = await prisma.area.findMany({
      where: {
        Status: "ACTIVE"
      }
    });
    const areaCodes = new Set(allAreas.map(area => area.Code));
    log(`พบ Area ทั้งหมด ${areaCodes.size} รายการ: ${[...areaCodes].join(', ')}`);
    
    // สร้าง mapping ระหว่างชื่อพื้นที่และรหัสพื้นที่
    const areaNameToCode = {};
    allAreas.forEach(area => {
      areaNameToCode[area.Name.toLowerCase()] = area.Code;
    });
    
    // ดึงข้อมูล Depot ทั้งหมด
    const allDepots = await prisma.entity_depot.findMany();
    const depotCodes = new Set(allDepots.map(entity_depot => entity_depot.Code));
    log(`พบ Depot ทั้งหมด ${depotCodes.size} รายการ: ${[...depotCodes].join(', ')}`);
    
    // แสดงข้อมูล Depot ทั้งหมดเพื่อตรวจสอบ
    log("รายละเอียด Depot ทั้งหมด:");
    allDepots.forEach(entity_depot => {
      log(`- Depot Code: ${entity_depot.Code}, Name: ${entity_depot.Name}, Area Code: ${entity_depot.area_code || 'ไม่มี'}`);
    });
    
    // สร้าง mapping ระหว่างชื่อ Depot และรหัส Depot
    const depotNameToCode = {};
    allDepots.forEach(entity_depot => {
      const nameLower = entity_depot.Name.toLowerCase();
      depotNameToCode[nameLower] = entity_depot.Code;
    });
    
    // สร้าง mapping ระหว่างพื้นที่และ Depot
    const areaToDepots = {};
    allDepots.forEach(entity_depot => {
      if (entity_depot.area_code) {
        if (!areaToDepots[entity_depot.area_code]) {
          areaToDepots[entity_depot.area_code] = [];
        }
        areaToDepots[entity_depot.area_code].push(entity_depot.Code);
      }
    });
    
    // กำหนด default entity_depot
    const defaultDepot = depotCodes.has('BKK') ? 'BKK' : (depotCodes.size > 0 ? [...depotCodes][0] : null);
    log(`Default Depot: ${defaultDepot || 'ไม่มี'}`);
    
    // นับจำนวนลูกค้าที่มีอยู่แล้ว
    const customerCount = await prisma.customer.count();
    log(`จำนวนลูกค้าที่มีอยู่แล้ว: ${customerCount} รายการ`);
    
    // นับจำนวนการนำเข้า
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let updatedCount = 0;
    
    // นำเข้าข้อมูล
    for (const [index, customer] of customers.entries()) {
      // แสดงข้อมูลทั้งหมดในแถวนี้เพื่อตรวจสอบ (เฉพาะ 5 แถวแรก)
      if (index < 5) {
        log(`ข้อมูลทั้งหมดในแถวที่ ${index + 1}:`);
        for (const key in customer) {
          log(`  ${key}: ${customer[key]}`);
        }
      }
      
      // ดึงข้อมูลจาก Excel และแปลงเป็น String ทันที
      const smStoName = String(getFieldValue(customer, ['ref_Customer_Name', 'SM_StoName', 'StoName', 'ชื่อร้าน']) || '');
      const smCodeJDE = getFieldValue(customer, ['entity_CustomerCode', 'CodeJDE', 'รหัส JDE']);
      const smArea = String(getFieldValue(customer, ['entity_Customer_Area', 'Area', 'พื้นที่']) || '');
      const smAddress = String(getFieldValue(customer, ['entity_Customer_Address', 'Address', 'ที่อยู่']) || '');
      const smStatus = String(getFieldValue(customer, ['entity_Customer_Status', 'Status', 'สถานะ']) || 'ACTIVE');
      const smId = getFieldValue(customer, ['entity_Customer_ID', 'ID', 'รหัส']);
      
      // แปลงข้อมูลเบอร์โทรเป็น String
      const phoneNumber = String(getFieldValue(customer, ['Phone_Number', 'PhoneNumber', 'เบอร์โทรศัพท์']) || '');
      const smMobile = String(getFieldValue(customer, ['entity_Customer_Mobile', 'Mobile', 'เบอร์มือถือ']) || phoneNumber || '');
      
      // ดึงข้อมูล Email และแปลงเป็น String
      const email = String(getFieldValue(customer, ['Email', 'email', 'E-mail', 'E_mail', 'อีเมล', 'entity_Customer_Presentindentity']) || '');
      
      // ถ้าไม่มี entity_Customer_ID ให้ข้ามไป
      if (!smId) {
        log(`ข้ามการนำเข้าข้อมูลลูกค้า "${smStoName}" เนื่องจากไม่มี entity_Customer_ID`);
        skippedCount++;
        continue;
      }
      
      // ตรวจสอบว่า entity_Customer_ID มีอยู่แล้วหรือไม่
      const existingCustomer = await checkSMIDExists(smId);
      
      // ถ้ามี entity_Customer_ID ซ้ำ และ entity_Customer_Status ไม่ใช่ 8 ให้อัพเดทข้อมูล
      if (existingCustomer && smStatus !== '8') {
        // แสดงข้อมูลที่จะอัพเดท
        log(`พบ entity_Customer_ID "${smId}" ซ้ำ ข้อมูลเดิม: ${existingCustomer.ref_Customer_Name}, สถานะ: ${existingCustomer.entity_Customer_Status}`);
        
        // เตรียมข้อมูลที่จะอัพเดท
        const updateData = {};
        
        // ตรวจสอบและเตรียมข้อมูลที่แตกต่างเพื่ออัพเดท
        if (smStoName && smStoName !== existingCustomer.ref_Customer_Name) {
          updateData.ref_Customer_Name = smStoName;
        }
        
        if (smCodeJDE && smCodeJDE !== existingCustomer.entity_CustomerCode) {
          updateData.entity_CustomerCode = (smCodeJDE === "NULL" || smCodeJDE === "null") ? null : smCodeJDE;
        }
        
        if (smArea && smArea !== existingCustomer.entity_Customer_Area) {
          updateData.entity_Customer_Area = smArea;
        }
        
        if (smAddress && smAddress !== existingCustomer.entity_Customer_Address) {
          updateData.entity_Customer_Address = smAddress;
        }
        
        if (smStatus && smStatus !== existingCustomer.entity_Customer_Status) {
          updateData.entity_Customer_Status = smStatus;
        }
        
        if (smMobile && smMobile !== existingCustomer.entity_Customer_Mobile) {
          updateData.entity_Customer_Mobile = smMobile;
        }
        
        if (email && email !== existingCustomer.entity_Customer_Presentindentity) {
          updateData.entity_Customer_Presentindentity = email;
        }
        
        // หา Depot Code เช่นเดียวกับการสร้างใหม่
        let areaCode = smArea;
        
        // ถ้า areaCode ไม่มีในรายการ ให้ลองค้นหาจากชื่อพื้นที่
        if (!areaCode || !areaCodes.has(areaCode)) {
          // ลองค้นหาจากชื่อพื้นที่
          const areaNameLower = smArea.toLowerCase();
          
          // ตรวจสอบจากชื่อภาษาไทยก่อน
          let foundThaiName = false;
          for (const [thaiName, code] of Object.entries(thaiNameToDepotCode)) {
            if (smArea.includes(thaiName)) {
              areaCode = code;
              foundThaiName = true;
              if (index < 10) {
                log(`พบชื่อพื้นที่ภาษาไทย "${smArea}" ตรงกับรหัส Depot: ${areaCode}`);
              }
              break;
            }
          }
          
          // ถ้าไม่พบจากชื่อภาษาไทย ให้ตรวจสอบจากชื่อพื้นที่
          if (!foundThaiName && areaNameToCode[areaNameLower]) {
            areaCode = areaNameToCode[areaNameLower];
            if (index < 10) {
              log(`พบชื่อพื้นที่ "${smArea}" ตรงกับรหัส: ${areaCode}`);
            }
          } 
          // ถ้ายังไม่พบ ให้ใช้ค่าเริ่มต้น
          else if (!foundThaiName) {
            areaCode = 'BKK'; // ใช้ค่าเริ่มต้นถ้าไม่พบ
            if (index < 10) {
              log(`ไม่พบพื้นที่ "${smArea}" ใช้ค่าเริ่มต้น: ${areaCode}`);
            }
          }
        }
        
        if (areaCode && areaCode !== existingCustomer.area_code) {
          updateData.area_code = areaCode;
        }
        
        // หา Depot Code
        let depotCode = null;
        let depotSource = "ไม่ระบุ";
        
        // กรณีพิเศษ: ประเภทลูกค้าพิเศษหรือไม่ระบุพื้นที่ ให้ใช้ BKK
        const specialTypes = ["Concessionaire", "HORECA", "Indochaina", "MT", "Online", "Sub Distributor", "อื่นๆ"];
        if (!smArea || specialTypes.includes(smArea)) {
          depotCode = "BKK";
          depotSource = "ประเภทลูกค้าพิเศษหรือไม่ระบุพื้นที่";
          if (index < 100) { // เพิ่มจำนวนแถวที่แสดงเป็น 100 เพื่อดูข้อมูลมากขึ้น
            log(`ลูกค้า "${smStoName}" เป็นประเภทพิเศษ: "${smArea || 'ไม่ระบุ'}" กำหนดให้ใช้ Depot: BKK`);
          }
        }
        // วิธีที่ 1: ตรวจสอบว่า smArea ตรงกับ Code ของ Depot หรือไม่
        else if (depotCodes.has(smArea)) {
          depotCode = smArea;
          depotSource = "รหัสพื้นที่ตรงกับรหัส Depot";
        } 
        // วิธีที่ 2: ตรวจสอบว่า smArea ตรงกับชื่อ Depot หรือไม่
        else if (depotNameToCode[smArea.toLowerCase()]) {
          depotCode = depotNameToCode[smArea.toLowerCase()];
          depotSource = "ชื่อพื้นที่ตรงกับชื่อ Depot";
        }
        // วิธีที่ 3: ตรวจสอบว่ามี Depot ในพื้นที่ (areaCode) หรือไม่
        else if (areaToDepots[areaCode] && areaToDepots[areaCode].length > 0) {
          depotCode = areaToDepots[areaCode][0]; // ใช้ Depot แรกในพื้นที่
          depotSource = "Depot ในพื้นที่";
        } 
        // วิธีที่ 4 (เพิ่มเติม): ตรวจสอบจากชื่อภาษาไทย
        else {
          for (const [thaiName, code] of Object.entries(thaiNameToDepotCode)) {
            if (smArea.includes(thaiName)) {
              depotCode = code;
              depotSource = "แปลงจากชื่อภาษาไทย";
              break;
            }
          }
        }
        
        // วิธีที่ 5: ใช้ค่าเริ่มต้นถ้ายังไม่พบ
        if (!depotCode) {
          log(`ไม่ได้กำหนด Depot สำหรับลูกค้า "${smStoName}" (entity_Customer_ID: ${smId}) พื้นที่: "${smArea}" - จะใช้ค่าเริ่มต้น: BKK`);
          depotCode = "BKK";
          depotSource = "ค่าเริ่มต้นเนื่องจากไม่พบ Depot ที่เหมาะสม";
        } else if (!depotCodes.has(depotCode)) {
          log(`ไม่พบ Depot "${depotCode}" ในระบบสำหรับลูกค้า "${smStoName}" (entity_Customer_ID: ${smId}) พื้นที่: "${smArea}" - จะใช้ค่าเริ่มต้น: BKK`);
          depotCode = "BKK";
          depotSource = "ค่าเริ่มต้นเนื่องจาก Depot ที่กำหนดไม่มีในระบบ";
        }
        
        if (depotCode && depotCode !== existingCustomer.Depot_Number) {
          updateData.Depot_Number = depotCode;
          log(`อัพเดทลูกค้า "${smStoName}" ใช้ Depot: ${depotCode} (${depotSource})`);
        }
        
        // เพิ่มข้อมูลการอัพเดท
        updateData.Modify_Date = new Date();
        updateData.Modify_By = "SYSTEM_IMPORT";
        
        // อัพเดทข้อมูลถ้ามีการเปลี่ยนแปลง
        if (Object.keys(updateData).length > 0) {
          try {
            // ตรวจสอบว่า area_code มีอยู่จริงในฐานข้อมูลหรือไม่
            if (updateData.area_code && !areaCodes.has(updateData.area_code)) {
              log(`ไม่พบรหัสพื้นที่ "${updateData.area_code}" ในระบบ กำหนดให้เป็นค่าว่างแทน`);
              updateData.area_code = null; // กำหนดให้เป็นค่าว่างถ้าไม่พบในระบบ
            }
            
            await prisma.customer.update({
              where: {
                Id: existingCustomer.Id
              },
              data: updateData
            });
            
            log(`อัพเดทข้อมูลลูกค้า entity_Customer_ID "${smId}" สำเร็จ`);
            updatedCount++;
          } catch (error) {
            log(`เกิดข้อผิดพลาดในการอัพเดทข้อมูลลูกค้า entity_Customer_ID "${smId}": ${error.message}`);
            errorCount++;
          }
        } else {
          log(`ไม่มีข้อมูลที่แตกต่างสำหรับลูกค้า entity_Customer_ID "${smId}" จึงไม่มีการอัพเดท`);
          skippedCount++;
        }
        
        continue;
      }
      
      // ถ้าเป็นลูกค้าใหม่ หรือเป็นลูกค้าเก่าแต่ entity_Customer_Status เป็น 8 ให้สร้างใหม่
      // ตรวจสอบว่า Area Code มีอยู่จริงหรือไม่
      let areaCode = smArea;
      
      // ถ้า areaCode ไม่มีในรายการ ให้ลองค้นหาจากชื่อพื้นที่
      if (!areaCode || !areaCodes.has(areaCode)) {
        // ลองค้นหาจากชื่อพื้นที่
        const areaNameLower = smArea.toLowerCase();
        
        // ตรวจสอบจากชื่อภาษาไทยก่อน
        let foundThaiName = false;
        for (const [thaiName, code] of Object.entries(thaiNameToDepotCode)) {
          if (smArea.includes(thaiName)) {
            areaCode = code;
            foundThaiName = true;
            if (index < 10) {
              log(`พบชื่อพื้นที่ภาษาไทย "${smArea}" ตรงกับรหัส Depot: ${areaCode}`);
            }
            break;
          }
        }
        
        // ถ้าไม่พบจากชื่อภาษาไทย ให้ตรวจสอบจากชื่อพื้นที่
        if (!foundThaiName && areaNameToCode[areaNameLower]) {
          areaCode = areaNameToCode[areaNameLower];
          if (index < 10) {
            log(`พบชื่อพื้นที่ "${smArea}" ตรงกับรหัส: ${areaCode}`);
          }
        } 
        // ถ้ายังไม่พบ ให้ใช้ค่าเริ่มต้น
        else if (!foundThaiName) {
          areaCode = 'BKK'; // ใช้ค่าเริ่มต้นถ้าไม่พบ
          if (index < 10) {
            log(`ไม่พบพื้นที่ "${smArea}" ใช้ค่าเริ่มต้น: ${areaCode}`);
          }
        }
      }
      
      // หา Depot Code จากหลายวิธี
      let depotCode = null;
      let depotSource = "ไม่ระบุ";
      
      // กรณีพิเศษ: ประเภทลูกค้าพิเศษหรือไม่ระบุพื้นที่ ให้ใช้ BKK
      const specialTypes = ["Concessionaire", "HORECA", "Indochaina", "MT", "Online", "Sub Distributor", "อื่นๆ"];
      if (!smArea || specialTypes.includes(smArea)) {
        depotCode = "BKK";
        depotSource = "ประเภทลูกค้าพิเศษหรือไม่ระบุพื้นที่";
        if (index < 100) { // เพิ่มจำนวนแถวที่แสดงเป็น 100 เพื่อดูข้อมูลมากขึ้น
          log(`ลูกค้า "${smStoName}" เป็นประเภทพิเศษ: "${smArea || 'ไม่ระบุ'}" กำหนดให้ใช้ Depot: BKK`);
        }
      }
      // วิธีที่ 1: ตรวจสอบว่า smArea ตรงกับ Code ของ Depot หรือไม่
      else if (depotCodes.has(smArea)) {
        depotCode = smArea;
        depotSource = "รหัสพื้นที่ตรงกับรหัส Depot";
        if (index < 10) {
          log(`พบ Depot Code "${smArea}" ตรงกับที่มีในระบบ`);
        }
      } 
      // วิธีที่ 2: ตรวจสอบว่า smArea ตรงกับชื่อ Depot หรือไม่
      else if (depotNameToCode[smArea.toLowerCase()]) {
        depotCode = depotNameToCode[smArea.toLowerCase()];
        depotSource = "ชื่อพื้นที่ตรงกับชื่อ Depot";
        if (index < 10) {
          log(`พบชื่อพื้นที่ "${smArea}" ตรงกับชื่อ Depot: ${depotCode}`);
        }
      }
      // วิธีที่ 3: ตรวจสอบว่ามี Depot ในพื้นที่ (areaCode) หรือไม่
      else if (areaToDepots[areaCode] && areaToDepots[areaCode].length > 0) {
        depotCode = areaToDepots[areaCode][0]; // ใช้ Depot แรกในพื้นที่
        depotSource = "Depot ในพื้นที่";
        if (index < 10) {
          log(`พบ Depot "${depotCode}" ในพื้นที่ ${areaCode}`);
        }
      } 
      // วิธีที่ 4 (เพิ่มเติม): ตรวจสอบจากชื่อภาษาไทย
      else {
        for (const [thaiName, code] of Object.entries(thaiNameToDepotCode)) {
          if (smArea.includes(thaiName)) {
            depotCode = code;
            depotSource = "แปลงจากชื่อภาษาไทย";
            break;
          }
        }
      }
      
      // ตรวจสอบว่า depotCode มีค่าและมีอยู่จริงหรือไม่
      if (!depotCode) {
        log(`ไม่ได้กำหนด Depot สำหรับลูกค้า "${smStoName}" (entity_Customer_ID: ${smId}) พื้นที่: "${smArea}" - จะใช้ค่าเริ่มต้น: BKK`);
        depotCode = "BKK";
        depotSource = "ค่าเริ่มต้นเนื่องจากไม่พบ Depot ที่เหมาะสม";
      } else if (!depotCodes.has(depotCode)) {
        log(`ไม่พบ Depot "${depotCode}" ในระบบสำหรับลูกค้า "${smStoName}" (entity_Customer_ID: ${smId}) พื้นที่: "${smArea}" - จะใช้ค่าเริ่มต้น: BKK`);
        depotCode = "BKK";
        depotSource = "ค่าเริ่มต้นเนื่องจาก Depot ที่กำหนดไม่มีในระบบ";
      }
      
      // แสดงข้อมูล Depot ที่เลือกใช้
      if (index < 10 || index % 100 === 0) {
        log(`ลูกค้า "${smStoName}" ใช้ Depot: ${depotCode} (${depotSource})`);
      }
      
      // สร้าง entity_Customer ID
      const customerId = `CUST-${(customerCount + successCount + skippedCount + errorCount + updatedCount + 1).toString().padStart(6, '0')}`;
      
      // ตรวจสอบว่า areaCode มีอยู่จริงในฐานข้อมูลหรือไม่
      if (areaCode && !areaCodes.has(areaCode)) {
        log(`ไม่พบรหัสพื้นที่ "${areaCode}" ในระบบ กำหนดให้เป็นค่าว่างแทน`);
        areaCode = null; // กำหนดให้เป็นค่าว่างถ้าไม่พบในระบบ
      }
      
      try {
        // สร้าง entity_Customer ใหม่
        const customerData = {
          Id: customerId,
          entity_Customer_ID: smId,
          ref_Customer_Name: smStoName,
          entity_CustomerCode: (smCodeJDE === "NULL" || smCodeJDE === "null") ? null : smCodeJDE,
          entity_Customer_Area: smArea,
          entity_Customer_Address: smAddress,
          entity_Customer_Status: smStatus,
          entity_Customer_Mobile: smMobile,
          entity_Customer_Presentindentity: email,
          Depot_Number: depotCode,
          area_code: areaCode,
          Created_Date: new Date(),
          Created_By: "SYSTEM_IMPORT"
        };
        
        // สร้าง entity_Customer
        await prisma.customer.create({
          data: customerData
        });
        
        // เพิ่มจำนวน customer ที่นำเข้าสำเร็จ
        successCount++;
        
        // แสดงข้อมูลการนำเข้าสำเร็จ
        if (index < 10 || index % 100 === 0) {
          log(`นำเข้าลูกค้า "${smStoName}" (entity_Customer_ID: ${smId}) สำเร็จ ใช้ Depot: ${depotCode}`);
        }
        
      } catch (error) {
        // บันทึกข้อผิดพลาด
        log(`เกิดข้อผิดพลาดในการนำเข้าข้อมูลสำหรับลูกค้า ${smStoName || 'ไม่ระบุ'} (entity_Customer_ID: ${smId}):`);
        
        // ตรวจสอบประเภทข้อผิดพลาด
        if (error.code === 'P2002') {
          if (error.meta?.target.includes('entity_Customer_ID')) {
            log(`entity_Customer_ID "${smId}" ซ้ำกับที่มีอยู่แล้วในฐานข้อมูล`);
          } else if (error.meta?.target.includes('entity_CustomerCode')) {
            log(`รหัส JDE "${smCodeJDE}" ซ้ำกับที่มีอยู่แล้วในฐานข้อมูล`);
          } else {
            log(`ข้อมูลซ้ำ: ${error.meta?.target}`);
          }
          skippedCount++;
        } else {
          log(error);
          errorCount++;
        }
      }
    }
    
    // สรุปผลการนำเข้า
    log(`สรุปผลการนำเข้าข้อมูล:`);
    log(`- นำเข้าสำเร็จ: ${successCount} รายการ`);
    log(`- อัพเดทสำเร็จ: ${updatedCount} รายการ`);
    log(`- ข้ามไป: ${skippedCount} รายการ`);
    log(`- เกิดข้อผิดพลาด: ${errorCount} รายการ`);
    log(`- รวมทั้งหมด: ${customers.length} รายการ`);
    
    // แสดงข้อมูลสรุปการใช้ Depot
    const depotUsage = {};
    const customersByDepot = await prisma.customer.groupBy({
      by: ['Depot_Number'],
      _count: {
        Id: true
      }
    });
    
    log(`สรุปการใช้ Depot:`);
    customersByDepot.forEach(item => {
      log(`- Depot ${item.Depot_Number}: ${item._count.Id} ลูกค้า`);
    });
    
  } catch (error) {
    log(`เกิดข้อผิดพลาดในการนำเข้าข้อมูล: ${error}`);
  } finally {
    await prisma.$disconnect();
  }
}

// เรียกใช้ฟังก์ชัน
importCustomerData()
  .then(() => {
    log('เสร็จสิ้นการนำเข้าข้อมูล');
  })
  .catch((error) => {
    log(`เกิดข้อผิดพลาดในการนำเข้าข้อมูล: ${error}`);
    process.exit(1);
  });
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
const logFilePath = path.join(__dirname, 'import_asset_log.txt');
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
  
  // ค้นหาแบบบางส่วนของชื่อฟิลด์ (ตรวจสอบว่าคีย์มีคำที่ต้องการหรือไม่)
  for (const fieldName of possibleFieldNames) {
    for (const key in row) {
      if (key.toLowerCase().includes(fieldName.toLowerCase()) && 
          row[key] !== undefined && row[key] !== null && row[key] !== '') {
        // แปลงเป็น String เสมอ
        return String(row[key]);
      }
    }
  }
  
  return defaultValue;
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

// ตรวจสอบว่ามี Asset_ID_Number ซ้ำหรือไม่ และดึงข้อมูลเก่ามาเปรียบเทียบ
async function checkAssetExists(assetSerialNumber) {
  if (!assetSerialNumber) return false;
  
  try {
    const existingAsset = await prisma.asset.findUnique({
      where: {
        Asset_ID_Number: assetSerialNumber
      }
    });
    
    return existingAsset ? existingAsset : false;
  } catch (error) {
    log(`เกิดข้อผิดพลาดในการตรวจสอบ Asset_ID_Number: ${error.message}`);
    return false;
  }
}

// แม็ปปิ้งรหัส Depot ตามที่กำหนด
const depotNameToCode = {
  'KHONKAEN': 'KKN',
  'UBONASSET': 'UBN',
  'KORAT': 'KOR',
  'SURIN': 'SRI',
  'UDORN': 'UDN',
  'AYUTTHAYA': 'AYT',
  'CHANTHABU': 'CTN',
  'CHIANGMAI': 'CHM',
  'CHIANGRAI': 'CHR',
  'CHONBURI': 'CHN',
  'HADYAI': 'HAD',
  'PHITSANUL': 'PIT',
  'RATCHABUR': 'RAT',
  'SURAT': 'SUR',
  'YALA': 'YAL',
  'DONTUM': 'NPT', // กรณีพิเศษ
  'BANGKOK': 'BKK' // เพิ่มเติม
};

// เพิ่ม async ให้กับฟังก์ชัน
async function importAssetData() {
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
    const assets = xlsx.utils.sheet_to_json(worksheet).map(convertAllToString);
    
    log(`จำนวนข้อมูลทั้งหมด: ${assets.length} รายการ`);
    
    // ตรวจสอบว่ามีข้อมูลหรือไม่
    if (assets.length === 0) {
      log('ไม่พบข้อมูลในไฟล์ Excel');
      return;
    }
    
    // ตรวจสอบคอลัมน์ในไฟล์ Excel
    if (assets.length > 0) {
      const firstRow = assets[0];
      log('คอลัมน์ทั้งหมดในไฟล์ Excel:');
      for (const key in firstRow) {
        log(`  ${key}: ${firstRow[key]}`);
      }
      
      // ตรวจสอบเพิ่มเติมว่ามีคอลัมน์ที่เกี่ยวข้องกับประเภททรัพย์สินหรือไม่
      log('ตรวจสอบคอลัมน์ที่เกี่ยวข้องกับประเภททรัพย์สิน:');
      const possibleTypeColumns = ['ประเภททรัพย์สิน', 'ประเภท', 'Asset_Type', 'AssetEntity Type', 'Type'];
      
      for (const key in firstRow) {
        for (const typeColumn of possibleTypeColumns) {
          if (key.toLowerCase().includes(typeColumn.toLowerCase())) {
            log(`  พบคอลัมน์ที่เกี่ยวข้อง: ${key}: ${firstRow[key]}`);
          }
        }
      }
    }
    
    // ดึงข้อมูล User ที่จะใช้เป็นผู้สร้าง AssetEntity (ใช้ user แรกที่พบ)
    const user = await prisma.user.findFirst({
      where: {
        status: 'ACTIVE'
      }
    });
    
    // กำหนด code สำหรับใช้เป็นผู้สร้าง AssetEntity
    let userCode = "888";  // กำหนดค่าคงที่เป็น 888
    
    if (user) {
      log(`พบ User: ${user.code} แต่ใช้ ${userCode} เป็นผู้สร้าง AssetEntity ตามที่กำหนด`);
    } else {
      log(`ไม่พบข้อมูล User ที่ active ใช้ ${userCode} เป็นผู้สร้าง AssetEntity`);
    }
    
    // นับจำนวนการนำเข้า
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let updatedCount = 0;
    
    // นำเข้าข้อมูล
    for (const [index, asset] of assets.entries()) {
      // แสดงข้อมูลทั้งหมดในแถวนี้เพื่อตรวจสอบ (เฉพาะ 5 แถวแรก)
      if (index < 5) {
        log(`ข้อมูลทั้งหมดในแถวที่ ${index + 1}:`);
        for (const key in asset) {
          log(`  ${key}: ${asset[key]}`);
        }
      }
      
      // เพิ่มการตรวจสอบคอลัมน์ที่เกี่ยวข้องกับ Asset_ID_Number
      if (index < 10) {
        log(`ตรวจสอบคอลัมน์ Serial number ในแถวที่ ${index + 1}:`);
        const serialKeys = ['Asset_ID_Number', 'Serial Number', 'Serial_Number', 'เลขที่ซีเรียล', 'Serial number (หมายเลขทรัพย์สิน)', 'หมายเลขทรัพย์สิน'];
        
        // ตรวจสอบแต่ละคีย์ที่เป็นไปได้
        serialKeys.forEach(key => {
          if (asset[key] !== undefined) {
            log(`  พบคีย์ "${key}": ${asset[key]}`);
          }
        });
        
        // ตรวจสอบคีย์ทั้งหมดแบบไม่สนใจตัวพิมพ์ใหญ่-เล็ก
        for (const key in asset) {
          for (const searchKey of serialKeys) {
            if (key.toLowerCase().includes(searchKey.toLowerCase())) {
              log(`  พบคีย์คล้ายกับ "${searchKey}": "${key}" = ${asset[key]}`);
            }
          }
        }
      }
      
      // ดึงข้อมูลจาก Excel
      let assetSerialNumber = getFieldValue(asset, ['Asset_ID_Number', 'Serial Number', 'Serial_Number', 'เลขที่ซีเรียล', 'Serial number (หมายเลขทรัพย์สิน)', 'หมายเลขทรัพย์สิน']);
      
      // ถ้าไม่พบ ลองค้นหาด้วยวิธีพิเศษโดยค้นหาคอลัมน์ที่มีคำว่า serial หรือ หมายเลข
      if (!assetSerialNumber) {
        const keywords = ['serial', 'หมายเลข', 'รหัสทรัพย์สิน'];
        for (const key in asset) {
          for (const keyword of keywords) {
            if (key.toLowerCase().includes(keyword.toLowerCase()) && 
                asset[key] !== undefined && asset[key] !== null && asset[key] !== '') {
              assetSerialNumber = String(asset[key]);
              log(`พบ Asset_ID_Number จากคำสำคัญ "${keyword}" ในคอลัมน์ "${key}": ${assetSerialNumber}`);
              break;
            }
          }
          if (assetSerialNumber) break;
        }
      }
      
      // แสดงผลลัพธ์จากการค้นหา Asset_ID_Number
      if (index < 10) {
        log(`ผลการค้นหา Asset_ID_Number: ${assetSerialNumber || 'ไม่พบ'}`);
      }
      
      // ถ้าไม่มี Asset_ID_Number ให้ข้ามไป
      if (!assetSerialNumber) {
        log(`ข้ามการนำเข้าข้อมูล เนื่องจากไม่มี Asset_ID_Number`);
        skippedCount++;
        continue;
      }
      
      // ดึงข้อมูลตามที่กำหนด
      const assetDescription = getFieldValue(asset, ['AssetEntity description 2(ทะเบียนรถสามล้อ)', 'AssetEntity description 2', 'ทะเบียนรถสามล้อ', 'AssetEntity Description']);
      const modelNo = getFieldValue(asset, ['Model No.', 'Model No', 'Model_No', 'โมเดล', 'Model']);
      const equipmentDescription = getFieldValue(asset, ['Equipment Description(หมายเลขและขนาดตู้)', 'Equipment Description', 'หมายเลขและขนาดตู้', 'Equipment Size']);

      // เพิ่มคำค้นหาสำหรับ Running_Asset_Code ให้ครอบคลุมมากขึ้น
      const jdeCode = getFieldValue(asset, [
        'รหัสJDE', 
        'รหัส JDE', 
        'JDE Code', 
        'Running_Asset_Code', 
        'รหัส', 
        'jde', 
        'JDE',
        'รหัสเครื่อง JDE',
        'รหัสเครื่องJDE',
        'รหัสJDE (8xxxxxxxxx)',
        'รหัส JDE (8xxxxxxxxx)',
        '8xxxxxxxxx'
      ]);

      // ยังคงต้องดึง sapAssetNumber มาใช้สำหรับ Location_Code
      const sapAssetNumber = getFieldValue(asset, ['Partner (เริ่ม8อยู่ที่Depot)', 'Partner', 'SAP AssetEntity Number', 'SAP Number', 'AssetEntity Number']);
      
      // ข้อมูลเพิ่มเติม - ปรับปรุงการค้นหาให้รองรับชื่อคอลัมน์เพิ่มเติม
      const equipment = getFieldValue(asset, ['Equipment', 'อุปกรณ์', 'ชื่ออุปกรณ์']);
      
      // ปรับปรุงการค้นหา Asset_Description_2 ให้รองรับชื่อคอลัมน์เพิ่มเติม
      const assetDescription2 = getFieldValue(asset, [
        'AssetEntity description 2 (ทะเบียนรถสามล้อ)', 
        'AssetEntity description 2', 
        'AssetEntity Description 2',
        'ทะเบียนรถสามล้อ', 
        'ทะเบียนรถ', 
        'License Plate',
        'License'
      ]);
      
      const costCenter = getFieldValue(asset, ['Cost Center', 'ศูนย์ต้นทุน', 'Cost', 'Cost_Center']);
      
      // ปรับปรุงการค้นหา Customer_Name_Thai ให้รองรับชื่อคอลัมน์เพิ่มเติม
      const customerNameThai = getFieldValue(asset, [
        'ชื่อ-ร้านค้า ภาษาไทย', 
        'ชื่อร้านค้า', 
        'ชื่อลูกค้า', 
        'ร้านค้า', 
        'ลูกค้า', 
        'entity_Customer Thai Name', 
        'entity_Customer Name',
        'Shop Name'
      ]);
      
      const address = getFieldValue(asset, ['Address(ที่อยู่1)', 'Address', 'ที่อยู่', 'ที่อยู่1', 'entity_Customer Address']);
      const jdeBrand = getFieldValue(asset, ['ยี่ห้อJDE', 'ยี่ห้อ JDE', 'Brand', 'ยี่ห้อ']);
      const assetClass = getFieldValue(asset, ['AssetEntity Class (Type)', 'AssetEntity Class', 'ประเภททรัพย์สิน', 'Class']);
      const elaNumber = getFieldValue(asset, ['ELA Number (เลขที่เอกสาร)', 'ELA Number', 'เลขที่เอกสาร', 'ELA', 'Document Number']);
      const manufactSerialNo = getFieldValue(asset, ['Manufact Serial No. (หมายเหตุ SD)', 'Manufact Serial No.', 'หมายเหตุ SD', 'Serial No.', 'Manufacturing Serial']);
      const sizeDimension = getFieldValue(asset, ['Size/Dimension(ขนาดและLOT)', 'Size/Dimension', 'ขนาดและLOT', 'ขนาด', 'Size', 'Dimension']);
      const statusDescription = getFieldValue(asset, ['Status Description (สถานะทรัพย์สิน)', 'Status Description', 'สถานะทรัพย์สิน', 'Status']);
      const jdeRemark = getFieldValue(asset, ['หมายเหตุJDE', 'หมายเหตุ JDE', 'JDE Remark', 'Remark JDE']);
      const cabinetSize = getFieldValue(asset, ['ขนาดตู้', 'Cabinet Size', 'Size Cabinet', 'Cabinet']);
      const insuranceRemark = getFieldValue(asset, ['หมายเหตุ ประกัน JDE/capex/PO.', 'หมายเหตุ ประกัน JDE/capex/PO', 'ประกัน', 'Insurance', 'Insurance Remark']);
      const manufacturerNamePlate = getFieldValue(asset, ['Manufacturer Name Plate', 'Name Plate', 'Manufacturer']);
      const newUsageTrackingJDE = getFieldValue(asset, ['หมายเหตุ ใช้งานใหม่ ติดตาม JDE', 'ใช้งานใหม่', 'ติดตาม JDE', 'New Usage', 'JDE Tracking']);
      const marketDescription = getFieldValue(asset, ['Market Description', 'รายละเอียดตลาด', 'Market', 'ตลาด']);
      const tradeChannelDescription = getFieldValue(asset, ['Trade Channel Description', 'รายละเอียดช่องทางการค้า', 'Trade Channel', 'ช่องทางการค้า']);
      const channelTypeDescription = getFieldValue(asset, ['Channel Type Description', 'Channel Type Decription', 'รายละเอียดประเภทช่องทาง', 'ประเภทช่องทาง', 'Channel Type']);
      const usefulLife = getFieldValue(asset, ['Useful life (อายุการใช้งาน_ ปี)', 'Useful life', 'อายุการใช้งาน', 'อายุใช้งาน (ปี)', 'Useful Life']);
      const ageYear = getFieldValue(asset, ['อายุ(ปี)', 'อายุ ปี', 'Age Year', 'อายุปี', 'Age (Year)']);
      const ageMonth = getFieldValue(asset, ['อายุ(เดือน)', 'อายุ เดือน', 'Age Month', 'อายุเดือน', 'Age (Month)']);
      const purchaseMonth = getFieldValue(asset, ['เดือนซื้อ', 'Purchase Month', 'Month Purchase', 'Month']);
      
      // ปรับปรุงการค้นหา purchaseYear ให้รองรับชื่อคอลัมน์เพิ่มเติม
      const purchaseYear = getFieldValue(asset, [
        'ปี ค.ศ. ซื้อ', 
        'ปีซื้อ', 
        'ปี', 
        'Purchase Year', 
        'Year', 
        'Year Purchase',
        'Year of Purchase'
      ]);
      
      // เพิ่มการนำเข้าข้อมูล branchOrZone จากคอลัมน์ "สาขา/เขต"
      const branchOrZone = getFieldValue(asset, [
        'สาขา/เขต',
        'สาขา',
        'เขต',
        'Branch/Zone',
        'Branch',
        'Zone'
      ]);
      
      // แก้ไขการดึงข้อมูล Asset_Type ให้ค้นหาจากคอลัมน์หลายรูปแบบที่เกี่ยวกับประเภททรัพย์สิน
      const assetType = getFieldValue(asset, ['ประเภททรัพย์สิน', 'ประเภท', 'Asset_Type', 'AssetEntity Type', 'Type', 'ประเภททรัพย์สิน/AssetEntity Type']) || 'etc'; // ค่าเริ่มต้นเป็น etc
      
      // กำหนด Current_Location_Type และ Location_Type
      let locationType = 'D'; // ค่าเริ่มต้น
      if (customerNameThai && !customerNameThai.startsWith('FNUL DEPOT') && !customerNameThai.startsWith('FNUL')) {
        locationType = 'C';
      }
      
      // กำหนด Current_Location และ Location_Code
      let currentLocation = '';
      let locationCode = '';
      
      // ตรวจสอบเงื่อนไขตามที่กำหนด
      if (customerNameThai && (customerNameThai.startsWith('FNUL DEPOT') || customerNameThai.startsWith('FNUL'))) {
        // กรณีขึ้นต้นด้วย FNUL DEPOT หรือ FNUL
        let depotName = '';
        
        if (customerNameThai.startsWith('FNUL DEPOT')) {
          // ตัดส่วน "FNUL DEPOT " ออกเพื่อเอาเฉพาะชื่อ entity_depot
          depotName = customerNameThai.replace('FNUL DEPOT ', '').trim();
        } else if (customerNameThai.startsWith('FNUL')) {
          // ตัดส่วน "FNUL " ออกเพื่อเอาเฉพาะชื่อ entity_depot
          depotName = customerNameThai.replace('FNUL ', '').trim();
        }
        
        currentLocation = depotName;
        
        // แปลงเป็น code ตามที่กำหนด
        if (depotName === 'DONTUM') {
          locationCode = 'NPT'; // กรณีพิเศษสำหรับ DONTUM
        } else if (depotNameToCode[depotName]) {
          locationCode = depotNameToCode[depotName];
        } else {
          // หากไม่พบในรายการให้ใช้ค่าเริ่มต้น
          locationCode = 'BKK';
          log(`ไม่พบรหัสที่ตรงกับ ${depotName} ใช้ค่าเริ่มต้น: BKK`);
        }
      } else {
        // กรณีไม่ขึ้นต้นด้วย FNUL DEPOT หรือ FNUL
        currentLocation = customerNameThai || 'ไม่ระบุ';
        locationCode = sapAssetNumber || 'ไม่ระบุ';
      }
      
      // แสดงข้อมูลเพิ่มเติมสำหรับดีบั๊ก
      if (index < 10) {
        log(`ข้อมูลสำคัญในแถวที่ ${index + 1}:`);
        log(`  Asset_Type: ${assetType || 'ไม่พบ'}`);
        log(`  Current_Location: ${currentLocation || 'ไม่พบ'}`);
        log(`  Asset_Description_2: ${assetDescription2 || 'ไม่พบ'}`);
        log(`  Customer_Name_Thai: ${customerNameThai || 'ไม่พบ'}`);
        log(`  purchaseYear: ${purchaseYear || 'ไม่พบ'}`);
        log(`  branchOrZone: ${branchOrZone || 'ไม่พบ'}`);
        
        // ตรวจหาคอลัมน์ที่อาจเกี่ยวข้องกับประเภททรัพย์สิน
        log(`คอลัมน์ที่เกี่ยวข้องกับประเภททรัพย์สินในแถวที่ ${index + 1}:`);
        for (const key in asset) {
          if (key.toLowerCase().includes('ประเภท') || 
              key.toLowerCase().includes('type') || 
              key.toLowerCase().includes('asset')) {
            log(`  ${key}: ${asset[key]}`);
          }
        }
      }
      
      // ตรวจสอบว่า Asset_ID_Number มีอยู่แล้วหรือไม่
      const existingAsset = await checkAssetExists(assetSerialNumber);
      
      if (existingAsset) {
        // เตรียมข้อมูลที่จะอัพเดท
        const updateData = {
          Asset_Type: assetType || existingAsset.Asset_Type,
          Asset_Description: assetDescription || existingAsset.Asset_Description,
          Model_No: modelNo || existingAsset.Model_No,
          Equipment_Description: equipmentDescription || existingAsset.Equipment_Description,
          Running_Asset_Number: jdeCode || existingAsset.Running_Asset_Number,
          Current_Location: currentLocation || existingAsset.Current_Location,
          Current_Location_Type: locationType || existingAsset.Current_Location_Type,
          Location_Code: locationCode || existingAsset.Location_Code,
          Location_Type: locationType || existingAsset.Location_Type,
          Equipment: equipment || existingAsset.Equipment,
          Asset_Description_2: assetDescription2 || existingAsset.Asset_Description_2,
          Cost_Center: costCenter || existingAsset.Cost_Center,
          Running_Asset_Code: jdeCode || existingAsset.Running_Asset_Code,
          Customer_Name_Thai: customerNameThai || existingAsset.Customer_Name_Thai,
          Address: address || existingAsset.Address,
          Asset_Brand: jdeBrand || existingAsset.Asset_Brand,
          Asset_Class: assetClass || existingAsset.Asset_Class,
          Entity_Number: elaNumber || existingAsset.Entity_Number,
          Asset_Serial_No: manufactSerialNo || existingAsset.Asset_Serial_No,
          Size_Dimension: sizeDimension || existingAsset.Size_Dimension,
          Status_Description: statusDescription || existingAsset.Status_Description,
          Asset_Remark: jdeRemark || existingAsset.Asset_Remark,
          Cabinet_Size: cabinetSize || existingAsset.Cabinet_Size,
          Insurance_Remark: insuranceRemark || existingAsset.Insurance_Remark,
          Asset_Made_Name_Plate: manufacturerNamePlate || existingAsset.Asset_Made_Name_Plate,
          Enitity_Usage_Tracking_JDE: newUsageTrackingJDE || existingAsset.Enitity_Usage_Tracking_JDE,
          Market_Description: marketDescription || existingAsset.Market_Description,
          Enitity_Channel_Description: tradeChannelDescription || existingAsset.Enitity_Channel_Description,
          Enitity_ChanneTypel_Description: channelTypeDescription || existingAsset.Enitity_ChanneTypel_Description,
          usefulLife: usefulLife || existingAsset.usefulLife,
          ageYear: ageYear || existingAsset.ageYear,
          ageMonth: ageMonth || existingAsset.ageMonth,
          purchaseMonth: purchaseMonth || existingAsset.purchaseMonth,
          purchaseYear: purchaseYear || existingAsset.purchaseYear,
          branchOrZone: branchOrZone || existingAsset.branchOrZone,
          Modify_Date: new Date(),
          Modify_By: {
            connect: {
              code: userCode
            }
          }
        };
        
        try {
          await prisma.asset.update({
            where: {
              Asset_ID_Number: assetSerialNumber
            },
            data: updateData
          });
          
          log(`อัพเดทข้อมูล AssetEntity ${assetSerialNumber} สำเร็จ`);
          updatedCount++;
        } catch (error) {
          log(`เกิดข้อผิดพลาดในการอัพเดทข้อมูล AssetEntity ${assetSerialNumber}: ${error.message}`);
          errorCount++;
        }
      } else {
        // สร้าง AssetEntity ใหม่
        try {
          await prisma.asset.create({
            data: {
              Asset_ID_Number: assetSerialNumber,
              Asset_Type: assetType || 'F',
              Asset_Description: assetDescription || '',
              Model_No: modelNo || '',
              Equipment_Description: equipmentDescription || '',
              Running_Asset_Number: jdeCode || '',
              Current_Location: currentLocation,
              Current_Location_Type: locationType,
              Location_Code: locationCode,
              Location_Type: locationType,
              Asset_Status: 'Y', // เริ่มต้นด้วย Y ทั้งหมด
              Equipment: equipment,
              Asset_Description_2: assetDescription2,
              Cost_Center: costCenter,
              Running_Asset_Code: jdeCode,
              Customer_Name_Thai: customerNameThai,
              Address: address,
              Asset_Brand: jdeBrand,
              Asset_Class: assetClass,
              Entity_Number: elaNumber,
              Asset_Serial_No: manufactSerialNo,
              Size_Dimension: sizeDimension,
              Status_Description: statusDescription,
              Asset_Remark: jdeRemark,
              Cabinet_Size: cabinetSize,
              Insurance_Remark: insuranceRemark,
              Asset_Made_Name_Plate: manufacturerNamePlate,
              Enitity_Usage_Tracking_JDE: newUsageTrackingJDE,
              Market_Description: marketDescription,
              Enitity_Channel_Description: tradeChannelDescription,
              Enitity_ChanneTypel_Description: channelTypeDescription,
              usefulLife: usefulLife,
              ageYear: ageYear,
              ageMonth: ageMonth,
              purchaseMonth: purchaseMonth,
              purchaseYear: purchaseYear,
              branchOrZone: branchOrZone,
              Created_Date: new Date(),
              Created_By: {
                connect: {
                  code: userCode
                }
              }
            }
          });
          
          log(`นำเข้าข้อมูล AssetEntity ${assetSerialNumber} สำเร็จ`);
          successCount++;
        } catch (error) {
          log(`เกิดข้อผิดพลาดในการนำเข้าข้อมูล AssetEntity ${assetSerialNumber}: ${error.message}`);
          errorCount++;
        }
      }
      
      // แสดงข้อมูลสำคัญเพิ่มเติมในแถวแรกๆ
      if (index < 10) {
        log(`ตรวจสอบค่า JDE Code ในแถวที่ ${index + 1}:`);
        log(`  JDE Code ที่พบ: ${jdeCode || 'ไม่พบ'}`);
        log(`  SAP AssetEntity Number ที่พบ: ${sapAssetNumber || 'ไม่พบ'}`);
        
        // แสดงคอลัมน์ที่อาจเกี่ยวข้องกับ JDE Code
        log(`  คอลัมน์ที่อาจเกี่ยวข้องกับ JDE Code ในแถวที่ ${index + 1}:`);
        for (const key in asset) {
          if (key.toLowerCase().includes('jde') || 
              key.toLowerCase().includes('รหัส') || 
              key.toLowerCase().includes('code') ||
              key.toLowerCase().includes('8') ||
              key.toLowerCase().includes('เครื่อง')) {
            log(`    ${key}: ${asset[key]}`);
          }
        }
      }
    }
    
    // สรุปผลการนำเข้า
    log(`สรุปผลการนำเข้าข้อมูล:`);
    log(`- นำเข้าสำเร็จ: ${successCount} รายการ`);
    log(`- อัพเดทสำเร็จ: ${updatedCount} รายการ`);
    log(`- ข้ามไป: ${skippedCount} รายการ`);
    log(`- เกิดข้อผิดพลาด: ${errorCount} รายการ`);
    log(`- รวมทั้งหมด: ${assets.length} รายการ`);
    
  } catch (error) {
    log(`เกิดข้อผิดพลาดในการนำเข้าข้อมูล: ${error}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// เรียกใช้ฟังก์ชัน
importAssetData()
  .then(() => {
    log('เสร็จสิ้นการนำเข้าข้อมูล');
  })
  .catch((error) => {
    log(`เกิดข้อผิดพลาดในการนำเข้าข้อมูล: ${error}`);
    process.exit(1);
  });
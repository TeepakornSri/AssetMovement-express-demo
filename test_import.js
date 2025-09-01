const excelData = {
  'Serial number (หมายเลขทรัพย์สิน)': '12345',
  'ประเภททรัพย์สิน': 'F',
  'Model No.': 'ABC123',
  'ชื่อ-ร้านค้า ภาษาไทย': 'FNUL DEPOT KHONKAEN'
};

// ฟังก์ชันสำหรับดึงค่าจากฟิลด์ที่เป็นไปได้หลายชื่อ
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
      console.log(`พบคีย์ตรงกับ "${fieldName}": ${row[fieldName]}`);
      return String(row[fieldName]);
    }
  }
  
  // ค้นหาแบบไม่สนใจตัวพิมพ์ใหญ่-เล็ก
  for (const fieldName of possibleFieldNames) {
    for (const key in row) {
      if (key.toLowerCase() === fieldName.toLowerCase() && 
          row[key] !== undefined && row[key] !== null && row[key] !== '') {
        // แปลงเป็น String เสมอ
        console.log(`พบคีย์ตรงกับ (case insensitive) "${fieldName}": "${key}" = ${row[key]}`);
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
        console.log(`พบคีย์คล้ายกับ "${fieldName}": "${key}" = ${row[key]}`);
        return String(row[key]);
      }
    }
  }
  
  return defaultValue;
}

// ทดสอบดึงค่าจากชื่อฟิลด์หลายแบบ
console.log('ทดสอบการดึงค่า Asset_ID_Number:');
const serialKeys = ['Asset_ID_Number', 'Serial Number', 'Serial_Number', 'เลขที่ซีเรียล', 'Serial number (หมายเลขทรัพย์สิน)', 'หมายเลขทรัพย์สิน'];

// แสดงข้อมูลทั้งหมด
console.log('ข้อมูลทั้งหมด:');
for (const key in excelData) {
  console.log(`  ${key}: ${excelData[key]}`);
}

// ทดสอบการดึงค่า
const assetSerialNumber = getFieldValue(excelData, serialKeys, 'ไม่พบค่า');
console.log(`ผลการดึงค่า Asset_ID_Number: ${assetSerialNumber}`);

// ทดลองค้นหาแบบแยกคำ
console.log('\nทดสอบการค้นหาแบบแยกคำ:');
for (const key in excelData) {
  for (const searchKey of serialKeys) {
    if (searchKey.split(' ').some(word => key.toLowerCase().includes(word.toLowerCase()))) {
      console.log(`  พบคำสำคัญ "${searchKey}" ในคีย์ "${key}": ${excelData[key]}`);
    }
  }
} 
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('กรุณาระบุเส้นทางไปยังไฟล์ Excel');
  process.exit(1);
}
const excelFilePath = args[0];

// สร้างไฟล์ log
const logFilePath = path.join(path.dirname(excelFilePath), 'excel_check_log.txt');
const logStream = fs.createWriteStream(logFilePath);

function log(message) {
  console.log(message);
  logStream.write(message + '\n');
}

function checkExcelFile() {
  log('=== เริ่มการตรวจสอบไฟล์ Excel ===');
  log(`เวลา: ${new Date().toLocaleString()}`);
  log(`ไฟล์: ${excelFilePath}`);
  
  try {
    // อ่านไฟล์ Excel
    const workbook = xlsx.readFile(path.resolve(excelFilePath), {
      type: 'binary',
      cellDates: true,
      cellNF: false,
      cellText: false
    });
    
    log(`จำนวนชีต: ${workbook.SheetNames.length}`);
    log(`ชื่อชีต: ${workbook.SheetNames.join(', ')}`);
    
    // ตรวจสอบแต่ละชีต
    for (const sheetName of workbook.SheetNames) {
      log(`\n=== ตรวจสอบชีต: ${sheetName} ===`);
      
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (data.length === 0) {
        log('ไม่พบข้อมูลในชีตนี้');
        continue;
      }
      
      const headers = data[0];
      log(`จำนวนคอลัมน์: ${headers.length}`);
      log(`ชื่อคอลัมน์: ${headers.join(', ')}`);
      log(`จำนวนแถวข้อมูล: ${data.length - 1}`);
      
      // แสดงตัวอย่างข้อมูล 5 แถวแรก
      log('\nตัวอย่างข้อมูล 5 แถวแรก:');
      for (let i = 1; i <= Math.min(5, data.length - 1); i++) {
        log(`\nแถวที่ ${i}:`);
        const row = data[i];
        for (let j = 0; j < headers.length; j++) {
          const value = row[j] !== undefined ? row[j] : 'ไม่มีข้อมูล';
          log(`  ${headers[j]}: ${value}`);
        }
      }
      
      // อ่านข้อมูลแบบ object
      const jsonData = xlsx.utils.sheet_to_json(worksheet);
      log('\nตัวอย่างข้อมูลแบบ object:');
      if (jsonData.length > 0) {
        log(JSON.stringify(jsonData[0], null, 2));
      } else {
        log('ไม่พบข้อมูล');
      }
      
      // ตรวจสอบคอลัมน์ที่ต้องการ
      const requiredColumns = ['entity_CustomerCode', 'entity_Customer_Area', 'entity_Customer_Address', 'entity_Customer_Presentindentity', 'SM_StoName', 'entity_Customer_Mobile'];
      log('\nตรวจสอบคอลัมน์ที่ต้องการ:');
      for (const column of requiredColumns) {
        const found = headers.includes(column);
        log(`  ${column}: ${found ? 'พบ' : 'ไม่พบ'}`);
        
        // แนะนำคอลัมน์ที่อาจใช้แทนได้
        if (!found) {
          const possibleMatches = headers.filter(h => 
            h.toLowerCase().includes(column.toLowerCase().replace('SM_', '')) ||
            column.toLowerCase().replace('SM_', '').includes(h.toLowerCase())
          );
          if (possibleMatches.length > 0) {
            log(`    คอลัมน์ที่อาจใช้แทน ${column}: ${possibleMatches.join(', ')}`);
          }
        }
      }
    }
    
    log('\n=== สรุปผลการตรวจสอบ ===');
    log('การตรวจสอบเสร็จสิ้น กรุณาตรวจสอบรายละเอียดข้างต้นเพื่อปรับปรุงโค้ดการนำเข้าข้อมูล');
    log(`บันทึกผลการตรวจสอบไว้ที่: ${logFilePath}`);
    
  } catch (error) {
    log(`เกิดข้อผิดพลาดในการตรวจสอบไฟล์: ${error.message}`);
    log(error.stack);
  }
}

checkExcelFile();
logStream.end(); 
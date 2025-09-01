const bcrypt = require("bcryptjs");
const JWT = require("jsonwebtoken");
const { loginSchema, passwordSchema } = require("../validators/auth-validator");
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const createError = require("../utils/create-error");



// สร้าง
exports.movemententry = async (req, res, next) => {
    try {
      const { header, assets } = req.body;
      
      // แสดงข้อมูลที่ได้รับมาอย่างละเอียด
      console.log('=========== ข้อมูลที่ได้รับมา (Request Data) ===========');
      console.log('Header:', JSON.stringify(header, null, 2));
      console.log('Assets:', JSON.stringify(assets, null, 2));
      console.log('======================================================');
      
      // ตรวจสอบว่ามีข้อมูลทรัพย์สินหรือไม่
      if (!assets || assets.length === 0) {
        throw new Error('ไม่มีรายการทรัพย์สินที่ต้องการเคลื่อนย้าย กรุณาระบุทรัพย์สินอย่างน้อย 1 รายการ');
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
      const documentNumber = `MOV${dateStr}${randomStr}`;
      
      // แปลง origin/destination type
      const originLocationType = header.originType === 'Depot' ? 'D' : 'C';
      const destinationLocationType = header.destinationType === 'Depot' ? 'D' : 'C';
      
      // ถ้า origin เป็น customer และมี ID ที่ขึ้นต้นด้วย CUST- ให้พยายามหา entity_Customer_ID แทน
      let originCustomerCode = header.originLocationId;
      if (originLocationType === 'C' && originCustomerCode && originCustomerCode.startsWith('CUST-')) {
        try {
          // ค้นหาข้อมูล entity_Customer จาก Id
          const customer = await prisma.entity_Customer.findUnique({
            where: { Id: originCustomerCode }
          });
          
          // ถ้าพบข้อมูล entity_Customer และมี entity_Customer_ID ให้ใช้ entity_Customer_ID แทน
          if (customer && customer.entity_Customer_ID) {
            console.log(`แปลง originCustomerCode จาก ${originCustomerCode} (Id) เป็น ${customer.entity_Customer_ID} (entity_Customer_ID)`);
            originCustomerCode = customer.entity_Customer_ID;
            // อัพเดตค่าใน header เพื่อให้โค้ดส่วนอื่นใช้ค่าที่ถูกต้อง
            header.originLocationId = originCustomerCode;
          }
        } catch (error) {
          console.error(`เกิดข้อผิดพลาดในการค้นหา entity_Customer_ID ของ entity_Customer ต้นทาง: ${error.message}`);
          // ยังคงใช้ค่าเดิมถ้าเกิดข้อผิดพลาด
        }
      }
      
      // ถ้า destination เป็น customer และมี ID ที่ขึ้นต้นด้วย CUST- ให้พยายามหา entity_Customer_ID แทน
      let destinationCustomerCode = header.destinationLocationId;
      if (destinationLocationType === 'C' && destinationCustomerCode && destinationCustomerCode.startsWith('CUST-')) {
        try {
          // ค้นหาข้อมูล entity_Customer จาก Id
          const customer = await prisma.entity_Customer.findUnique({
            where: { Id: destinationCustomerCode }
          });
          
          // ถ้าพบข้อมูล entity_Customer และมี entity_Customer_ID ให้ใช้ entity_Customer_ID แทน
          if (customer && customer.entity_Customer_ID) {
            console.log(`แปลง destinationCustomerCode จาก ${destinationCustomerCode} (Id) เป็น ${customer.entity_Customer_ID} (entity_Customer_ID)`);
            destinationCustomerCode = customer.entity_Customer_ID;
            // อัพเดตค่าใน header เพื่อให้โค้ดส่วนอื่นใช้ค่าที่ถูกต้อง
            header.destinationLocationId = destinationCustomerCode;
          }
        } catch (error) {
          console.error(`เกิดข้อผิดพลาดในการค้นหา entity_Customer_ID ของ entity_Customer ปลายทาง: ${error.message}`);
          // ยังคงใช้ค่าเดิมถ้าเกิดข้อผิดพลาด
        }
      }
      
      // ดึงข้อมูล entity_depot ที่สร้างเอกสาร เพื่อดึงผู้อนุมัติ
      const entity_depot = await prisma.depot.findUnique({
        where: { Code: header.createdDepot }
      });
      
      if (!entity_depot) {
        throw new Error('ไม่พบข้อมูล Depot');
      }
      
      console.log('=========== ข้อมูล Depot ที่ดึงมา ===========');
      console.log('Depot:', JSON.stringify(entity_depot, null, 2));
      console.log('===========================================');
      
      // ตรวจสอบเงื่อนไขว่าเป็น usecase ไหน
      const isDepotOrigin = originLocationType === 'D';
      const isDepotDestination = destinationLocationType === 'D';
      
      // สร้างฟังก์ชันสำหรับแปลงชื่อเต็มเป็นรหัส entity_depot
      const getDepotCodeFromName = (name) => {
        if (!name) return null;
        
        // แปลงเป็นตัวพิมพ์เล็กและตัดช่องว่าง
        const normalizedName = name.toLowerCase().trim();
        
        // แมปสำหรับแปลงชื่อเป็นรหัส
        const nameToCodeMapping = {
          'bangkok': 'BKK',
          'bkk': 'BKK',
          'chonburi': 'CHN',
          'chon': 'CHN',
          'chn': 'CHN',
          'ayuthaya': 'AYT',
          'ayut': 'AYT',
          'ayt': 'AYT',
          'chiangmai': 'CHM',
          'chiang mai': 'CHM',
          'chm': 'CHM',
          'chiangrai': 'CHR',
          'chiang rai': 'CHR',
          'chr': 'CHR',
          'chantaburi': 'CTN',
          'chan': 'CTN',
          'ctn': 'CTN',
          'hadyai': 'HAD',
          'had yai': 'HAD',
          'had': 'HAD',
          'konkean': 'KKN',
          'kon kean': 'KKN',
          'kkn': 'KKN',
          'korat': 'KOR',
          'kor': 'KOR',
          'pitsanulok': 'PIT',
          'pit': 'PIT',
          'ratchaburi': 'RAT',
          'rat': 'RAT',
          'surin': 'SRI',
          'sri': 'SRI',
          'surat': 'SUR',
          'sur': 'SUR',
          'ubonrachathani': 'UBN',
          'ubon': 'UBN',
          'ubn': 'UBN',
          'udonthani': 'UDN',
          'udon': 'UDN',
          'udn': 'UDN',
          'yala': 'YAL',
          'yal': 'YAL'
        };
        
        // ค้นหา code โดยตรง
        if (nameToCodeMapping[normalizedName]) {
          return nameToCodeMapping[normalizedName];
        }
        
        // ค้นหาจากคำที่มีความคล้ายคลึง
        for (const [key, code] of Object.entries(nameToCodeMapping)) {
          if (normalizedName.includes(key) || key.includes(normalizedName)) {
            return code;
          }
        }
        
        // หากไม่พบ ให้คืนค่าเดิม
        return name;
      };
      
      // ถ้าเป็น Depot ให้แปลงชื่อเป็นรหัสก่อน
      const originCode = isDepotOrigin ? getDepotCodeFromName(header.originLocationName) : header.originLocationName;
      
      // เช็คว่าเป็น BKK หรือไม่
      const isBKK = isDepotOrigin && (originCode === 'BKK');
      
      // ดึงข้อมูล entity_depot ปลายทาง หากเป็น Depot
      let destinationDepot = null;
      
      if (isDepotDestination) {
        try {
      
          
          // ดึงข้อมูล depot ทั้งหมดเพื่อใช้ในการค้นหา
          const allDepots = await prisma.depot.findMany();
          
          
          // สร้างแมปความสัมพันธ์ระหว่างชื่อและรหัส
          const nameToCodeMapping = {
            'bangkok': 'BKK',
            'bkk': 'BKK',
            'chonburi': 'CHN',
            'chon': 'CHN',
            'chn': 'CHN',
            'ayuthaya': 'AYT',
            'ayut': 'AYT',
            'ayt': 'AYT',
            'chiangmai': 'CHM',
            'chiang mai': 'CHM',
            'chm': 'CHM',
            'chiangrai': 'CHR',
            'chiang rai': 'CHR',
            'chr': 'CHR',
            'chantaburi': 'CTN',
            'chan': 'CTN',
            'ctn': 'CTN',
            'hadyai': 'HAD',
            'had yai': 'HAD',
            'had': 'HAD',
            'konkean': 'KKN',
            'kon kean': 'KKN',
            'kkn': 'KKN',
            'korat': 'KOR',
            'kor': 'KOR',
            'pitsanulok': 'PIT',
            'pit': 'PIT',
            'ratchaburi': 'RAT',
            'rat': 'RAT',
            'surin': 'SRI',
            'sri': 'SRI',
            'surat': 'SUR',
            'sur': 'SUR',
            'ubonrachathani': 'UBN',
            'ubon': 'UBN',
            'ubn': 'UBN',
            'udonthani': 'UDN',
            'udon': 'UDN',
            'udn': 'UDN',
            'yala': 'YAL',
            'yal': 'YAL'
          };
          
          // ลำดับการค้นหา
          // 1. ค้นหาจาก Code โดยตรง
          destinationDepot = await prisma.depot.findUnique({
            where: { Code: header.destinationLocationName }
          });
          
          if (destinationDepot) {
          } else {
            // 2. ค้นหาจาก Name แบบไม่คำนึงถึงตัวพิมพ์ใหญ่-เล็ก
            const matchByName = allDepots.find(d => 
              d.Name.toLowerCase() === header.destinationLocationName.toLowerCase()
            );
            
            if (matchByName) {
              destinationDepot = matchByName;
            } else {
              // 3. ค้นหาจากแมปที่กำหนดไว้
              const normalizedName = header.destinationLocationName.toLowerCase().trim();
              const matchedCode = nameToCodeMapping[normalizedName];
              
              if (matchedCode) {
                destinationDepot = allDepots.find(d => d.Code === matchedCode);
                if (destinationDepot) {
                }
              }
              
              // 4. ถ้ายังไม่พบ ลองดูคล้ายคลึงกับคำในแมป
              if (!destinationDepot) {
                for (const [key, code] of Object.entries(nameToCodeMapping)) {
                  if (normalizedName.includes(key) || key.includes(normalizedName)) {
                    destinationDepot = allDepots.find(d => d.Code === code);
                    if (destinationDepot) {
                      break;
                    }
                  }
                }
              }
              
              // 5. ถ้ายังไม่พบ ลองดูว่ามีชื่อคล้ายกันไหม (3 ตัวแรก)
              if (!destinationDepot) {
                for (const entity_depot of allDepots) {
                  const depotName = entity_depot.Name.toLowerCase();
                  const searchName = normalizedName;
                  
                  if (depotName.startsWith(searchName.substring(0, 3)) || 
                      searchName.startsWith(depotName.substring(0, 3))) {
                    destinationDepot = entity_depot;
                    break;
                  }
                }
              }
            }
          }
          
          // 6. ถ้ายังไม่พบ ลองใช้ destinationLocationId
          if (!destinationDepot && header.destinationLocationId) {
            
            // ลองหาจาก Code โดยตรง
            destinationDepot = await prisma.depot.findUnique({
              where: { Code: header.destinationLocationId }
            });
            
            if (destinationDepot) {
            } else {
              // ลองหาจาก Name
              const matchById = allDepots.find(d => 
                d.Name.toLowerCase() === header.destinationLocationId.toLowerCase()
              );
              
              if (matchById) {
                destinationDepot = matchById;
              } else {
                // ลองหาจากแมป
                const normalizedId = header.destinationLocationId.toLowerCase().trim();
                const matchedCode = nameToCodeMapping[normalizedId];
                
                if (matchedCode) {
                  destinationDepot = allDepots.find(d => d.Code === matchedCode);
                  if (destinationDepot) {
                  }
                }
              }
            }
          }
          
          // หากยังไม่พบและเป็น usecase 1 (BKK to Depot) ให้แจ้งเตือน
          if (!destinationDepot && isBKK && isDepotOrigin && isDepotDestination) {
            throw new Error(`ไม่พบข้อมูล Depot ปลายทาง "${header.destinationLocationName}". กรุณาตรวจสอบชื่อ Depot ให้ถูกต้อง`);
          }
        } catch (error) {
          if (error.message.includes('ไม่พบข้อมูล Depot ปลายทาง')) {
            throw error; // ส่งต่อข้อผิดพลาดนี้ไป
          } else {
            console.error(`เกิดข้อผิดพลาดในการค้นหา Depot ปลายทาง: ${error.message}`);
            if (isBKK && isDepotOrigin && isDepotDestination) {
              throw new Error('ไม่สามารถค้นหา Depot ปลายทางได้ ไม่สามารถสร้างเอกสารสำหรับ Usecase BKK to Depot ได้');
            }
          }
        }
      }
      
      const isDestinationBKK = isDepotDestination && 
        (getDepotCodeFromName(header.destinationLocationName) === 'BKK' || 
        (destinationDepot && destinationDepot.Code === 'BKK'));
      
      // ตรวจสอบว่าต้นทางและปลายทางเป็น entity_Customer ทั้งคู่หรือไม่
      const isCustomerToCustomer = originLocationType === 'C' && destinationLocationType === 'C';
      
      // กำหนดค่าเริ่มต้นสำหรับผู้อนุมัติ - ย้ายมาไว้ตรงนี้ก่อนการใช้งาน
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
      
      // กำหนด Current_step ตาม usecase
      let currentStep = null;
      
      // ตรวจสอบว่ามี approver ครบตามเงื่อนไขหรือไม่
      let missingApprovers = [];
      
      // ดึงข้อมูล entity_depot ต้นทางจาก Origin_Location (ไม่ใช่ Created_Depot_Code)
      let originDepot = null;
      if (isDepotOrigin) {
        originDepot = await prisma.depot.findUnique({
          where: { Code: getDepotCodeFromName(header.originLocationName) }
        });
        
        if (!originDepot) {
          throw new Error(`ไม่พบข้อมูล Depot ต้นทาง "${header.originLocationName}" จึงไม่สามารถกำหนดผู้อนุมัติได้`);
        }
      } else {
        // ถ้าต้นทางไม่ใช่ Depot ให้ใช้ entity_depot ที่สร้างเอกสาร
        originDepot = entity_depot;
      }
      
      // Usecase 1: BKK to Depot
      if (isBKK && isDepotOrigin && isDepotDestination) {
        
        // ตรวจสอบว่าพบข้อมูล entity_depot ปลายทางหรือไม่
        if (!destinationDepot) {
          throw new Error(`ไม่พบข้อมูล Depot ปลายทาง "${header.destinationLocationName}" จึงไม่สามารถกำหนดผู้อนุมัติสำหรับ Usecase BKK to Depot ได้`);
        }
        
        if (!originDepot.Approval2ref_User) missingApprovers.push('Approver 1 (Sales AssetEntity Manager จาก BKK)');
        if (!destinationDepot.Approval1ref_User) missingApprovers.push('Approver 2 (Branch Manager จากปลายทาง)');
        if (!originDepot.Acknowledge_User_Id) missingApprovers.push('ผู้รับทราบ (Account จากต้นทาง)');
      }
      // Usecase 2: Depot to BKK
      else if (!isBKK && isDepotOrigin && isDestinationBKK) {
        
        // ตรวจสอบว่าพบข้อมูล entity_depot ปลายทางหรือไม่
        if (!destinationDepot) {
          throw new Error(`ไม่พบข้อมูล Depot ปลายทาง "${header.destinationLocationName}" จึงไม่สามารถกำหนดผู้อนุมัติสำหรับ Usecase Depot to BKK ได้`);
        }
        
        if (!originDepot.Approval1ref_User) missingApprovers.push('Approver 1 (Branch Manager จากต้นทาง)');
        if (!destinationDepot.Approval2ref_User) missingApprovers.push('Approver 2 (Sales AssetEntity Manager จาก BKK)');
        if (!originDepot.Acknowledge_User_Id) missingApprovers.push('ผู้รับทราบ (Account จากต้นทาง)');
      }
      // Usecase 3: BKK to entity_Customer หรือ entity_Customer to BKK
      else if ((isBKK && !isDepotDestination) || (!isDepotOrigin && isDestinationBKK)) {
        
        if (!originDepot.Approval1ref_User) missingApprovers.push('Approver 1 (Area Sales Manager)');
        if (!originDepot.Approval2ref_User) missingApprovers.push('Approver 2 (Sales AssetEntity Manager)');
        if (!originDepot.Approval3ref_User) missingApprovers.push('Approver 3 (entity_Customer)');
        if (!originDepot.Acknowledge_User_Id) missingApprovers.push('ผู้รับทราบ (Account)');
      }
      // Usecase 4 & 5: Depot to entity_Customer หรือ entity_Customer to Depot หรือ entity_Customer to entity_Customer
      else {
        if (isCustomerToCustomer) {
          
          if (!originDepot.Approval1ref_User) missingApprovers.push('Approver 1 (Area Sales Manager)');
          if (!originDepot.Approval2ref_User) missingApprovers.push('Approver 2 (Sales AssetEntity Manager)');
          if (!originDepot.Approval3ref_User) missingApprovers.push('Approver 3 (entity_Customer ต้นทาง)');
          if (!originDepot.Approval3ref_User) missingApprovers.push('Approver 4 (entity_Customer ปลายทาง)');
          if (!originDepot.Acknowledge_User_Id) missingApprovers.push('ผู้รับทราบ (Account)');
        } else {
          
          if (!originDepot.Approval1ref_User) missingApprovers.push('Approver 1 (Branch Manager)');
          if (!originDepot.Approval2ref_User) missingApprovers.push('Approver 2 (Area Sales Manager)');
          if (!originDepot.Approval3ref_User) missingApprovers.push('Approver 3 (entity_Customer)');
          if (!originDepot.Acknowledge_User_Id) missingApprovers.push('ผู้รับทราบ (Account)');
        }
      }
      
      // หากมี approver ไม่ครบ ให้แจ้งเตือนและยกเลิกการทำงาน
      if (missingApprovers.length > 0) {
        let usecaseText = '';
        if (isBKK && isDepotOrigin && isDepotDestination) {
          usecaseText = 'BKK to Depot (Usecase 1)';
        } else if (!isBKK && isDepotOrigin && isDestinationBKK) {
          usecaseText = 'Depot to BKK (Usecase 2)';
        } else if ((isBKK && !isDepotDestination) || (!isDepotOrigin && isDestinationBKK)) {
          usecaseText = 'BKK To entity_Customer หรือ entity_Customer to BKK (Usecase 3)';
        } else if (isCustomerToCustomer) {
          usecaseText = 'entity_Customer to entity_Customer (Usecase 5)';
        } else {
          usecaseText = 'Depot to entity_Customer หรือ entity_Customer to Depot (Usecase 4)';
        }
        
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
      // ลบการประกาศตัวแปร approvalData ตรงนี้ออกเพราะประกาศไปแล้ว
      
      // กำหนด Current_step ตาม usecase
      // ลบการประกาศตัวแปร currentStep ตรงนี้ออกเพราะประกาศไปแล้ว
      
      // กำหนดผู้อนุมัติตาม usecase ต่างๆ
      if (isBKK && isDepotOrigin && isDepotDestination) {
        
        // ตรวจสอบว่าพบข้อมูล entity_depot ปลายทางหรือไม่
        if (!destinationDepot) {
          throw new Error(`ไม่พบข้อมูล Depot ปลายทาง "${header.destinationLocationName}" จึงไม่สามารถกำหนดผู้อนุมัติสำหรับ Usecase BKK to Depot ได้`);
        }
        
        // แสดงข้อมูลการตรวจสอบ Usecase 1: BKK to Depot
        console.log('=========== ตรวจสอบข้อมูล Usecase 1: BKK to Depot ===========');
        console.log('Origin Depot:', JSON.stringify(originDepot, null, 2));
        console.log('Approval2ref_User (ที่ควรเป็น Approval 1):', originDepot.Approval2ref_User);
        console.log('ref_User2Name:', originDepot.ref_User2Name);
        console.log('moveApproval2Email:', originDepot.moveApproval2Email);
        console.log('Destination Depot:', JSON.stringify(destinationDepot, null, 2));
        console.log('===========================================================');

        // กำหนด Approver ที่ 1: Sales AssetEntity Manager จาก BKK (originDepot)
        approvalData.Move_Approval_1_User_Id = originDepot.Approval2ref_User;
        approvalData.Move_Approval_1_Name = originDepot.ref_User2Name;
        approvalData.Move_Approval_1_Email = originDepot.moveApproval2Email;
        
        // กำหนด Approver ที่ 2: Branch Manager จาก destination entity_depot
        approvalData.Move_Approval_2_User_Id = destinationDepot.Approval1ref_User;
        approvalData.Move_Approval_2_Name = destinationDepot.ref_User1Name;
        approvalData.Move_Approval_2_Email = destinationDepot.moveApproval1Email;
        
        // ผู้รับทราบ: Account จาก originDepot
        approvalData.Acknowledge_User_Id = originDepot.Acknowledge_User_Id;
        approvalData.Acknowledge_User_Name = originDepot.Acknowledge_User_Name;
        approvalData.Acknowledge_User_Email = originDepot.Acknowledge_User_Email;

        console.log('=========== ผลการกำหนดผู้อนุมัติ Usecase 1 ===========');
        console.log('Approval Data:', JSON.stringify(approvalData, null, 2));
        console.log('=====================================================');
        
        // ตรวจสอบว่าข้อมูลผู้อนุมัติสมบูรณ์หรือไม่
        if (!approvalData.Move_Approval_1_User_Id || !approvalData.Move_Approval_2_User_Id) {
          const missing = [];
          if (!approvalData.Move_Approval_1_User_Id) missing.push("ผู้อนุมัติคนที่ 1 (Sales AssetEntity Manager จาก BKK)");
          if (!approvalData.Move_Approval_2_User_Id) missing.push(`ผู้อนุมัติคนที่ 2 (Branch Manager จาก ${destinationDepot.Name || destinationDepot.Code})`);
          throw new Error(`ข้อมูลผู้อนุมัติไม่ครบถ้วน (${missing.join(', ')}) จึงไม่สามารถสร้างเอกสารได้`);
        }
        
        // กำหนด Current_step เป็น Waiting_CaseAction2
        currentStep = 'Waiting_CaseAction2';
      }
      // Usecase 2: Depot to BKK
      else if (!isBKK && isDepotOrigin && isDestinationBKK) {
        
        // ผู้อนุมัติที่ 1 (ตามคำขอใหม่)
        approvalData.Move_Approval_1_User_Id = originDepot.Approval1ref_User;
        approvalData.Move_Approval_1_Name = originDepot.ref_User1Name;
        approvalData.Move_Approval_1_Email = originDepot.moveApproval1Email;
        
        // ผู้อนุมัติที่ 2 (ตามคำขอใหม่)
        const bkkDepot = await prisma.depot.findUnique({
          where: { Code: 'BKK' }
        });
        
        if (bkkDepot) {
          approvalData.Move_Approval_2_User_Id = bkkDepot.Approval2ref_User;
          approvalData.Move_Approval_2_Name = bkkDepot.ref_User2Name;
          approvalData.Move_Approval_2_Email = bkkDepot.moveApproval2Email;
        }
        
        // ผู้รับทราบ: Account จาก originDepot
        approvalData.Acknowledge_User_Id = originDepot.Acknowledge_User_Id;
        approvalData.Acknowledge_User_Name = originDepot.Acknowledge_User_Name;
        approvalData.Acknowledge_User_Email = originDepot.Acknowledge_User_Email;
        
        // กำหนด Current_step เป็น Waiting_CaseAction3
        currentStep = 'Waiting_CaseAction3';
      }
      // Usecase 3: BKK to entity_Customer หรือ entity_Customer to BKK
      else if ((isBKK && !isDepotDestination) || (!isDepotOrigin && isDestinationBKK)) {
        
        // Approval_1: Area Sales Manager จาก originDepot
        approvalData.Move_Approval_1_User_Id = originDepot.Approval1ref_User;
        approvalData.Move_Approval_1_Name = originDepot.ref_User1Name;
        approvalData.Move_Approval_1_Email = originDepot.moveApproval1Email;
        
        // Approval_2: Sales AssetEntity Manager จาก originDepot
        approvalData.Move_Approval_2_User_Id = originDepot.Approval2ref_User;
        approvalData.Move_Approval_2_Name = originDepot.ref_User2Name;
        approvalData.Move_Approval_2_Email = originDepot.moveApproval2Email;
        
        // Approval_3: entity_Customer จาก originDepot (Approval3ref_User)
        approvalData.Move_Approval_3_User_Id = originDepot.Approval3ref_User;
        approvalData.Move_Approval_3_Name = originDepot.ref_User3Name;
        approvalData.Move_Approval_3_Email = originDepot.moveApproval3Email;
        
        // ผู้รับทราบ: Account จาก originDepot
        approvalData.Acknowledge_User_Id = originDepot.Acknowledge_User_Id;
        approvalData.Acknowledge_User_Name = originDepot.Acknowledge_User_Name;
        approvalData.Acknowledge_User_Email = originDepot.Acknowledge_User_Email;
        
        // กำหนด Current_step เป็น Waiting_CaseAction5
        currentStep = 'Waiting_CaseAction5';
      }
      // Usecase 4 & 5: Depot to entity_Customer หรือ entity_Customer to Depot หรือ entity_Customer to entity_Customer
      else {
        if (isCustomerToCustomer) {
          
          // Approval_1: Area Sales Manager จาก originDepot
          approvalData.Move_Approval_1_User_Id = originDepot.Approval1ref_User;
          approvalData.Move_Approval_1_Name = originDepot.ref_User1Name;
          approvalData.Move_Approval_1_Email = originDepot.moveApproval1Email;
          
          // Approval_2: Sales AssetEntity Manager จาก originDepot
          approvalData.Move_Approval_2_User_Id = originDepot.Approval2ref_User;
          approvalData.Move_Approval_2_Name = originDepot.ref_User2Name;
          approvalData.Move_Approval_2_Email = originDepot.moveApproval2Email;
          
          // ดึงข้อมูล BKK entity_depot ก่อนสำหรับกรณีที่เป็น BKK
          let bkkDepot = null;
          if (originDepot.Code === 'BKK') {
            bkkDepot = await prisma.depot.findUnique({
              where: { Code: 'BKK' }
            });
          }
          
          // Approval_3: ถ้าเป็น BKK ให้ใช้คนที่ 4 จาก BKK
          if (originDepot.Code === 'BKK' && bkkDepot) {
            approvalData.Move_Approval_3_User_Id = bkkDepot.Approval4ref_User;
            approvalData.Move_Approval_3_Name = bkkDepot.ref_User4Name;
            approvalData.Move_Approval_3_Email = bkkDepot.moveApproval4Email;
          } else {
            // ถ้าไม่ใช่ BKK ใช้ entity_Customer (ต้นทาง) จาก originDepot
            approvalData.Move_Approval_3_User_Id = originDepot.Approval3ref_User;
            approvalData.Move_Approval_3_Name = originDepot.ref_User3Name;
            approvalData.Move_Approval_3_Email = originDepot.moveApproval3Email;
          }
          
          // Approval_4: ถ้าเป็น BKK ใช้คนที่ 4 จาก BKK เช่นกัน
          if (originDepot.Code === 'BKK' && bkkDepot) {
            approvalData.Move_Approval_4_User_Id = bkkDepot.Approval4ref_User;
            approvalData.Move_Approval_4_Name = bkkDepot.ref_User4Name;
            approvalData.Move_Approval_4_Email = bkkDepot.moveApproval4Email;
          } else {
            // ถ้าไม่ใช่ BKK ให้ใช้ entity_Customer (ปลายทาง) ซ้ำกับ Approval_3 เหมือนเดิม
            approvalData.Move_Approval_4_User_Id = originDepot.Approval3ref_User;
            approvalData.Move_Approval_4_Name = originDepot.ref_User3Name;
            approvalData.Move_Approval_4_Email = originDepot.moveApproval3Email;
          }
          
          // ผู้รับทราบ: Account จาก originDepot
          approvalData.Acknowledge_User_Id = originDepot.Acknowledge_User_Id;
          approvalData.Acknowledge_User_Name = originDepot.Acknowledge_User_Name;
          approvalData.Acknowledge_User_Email = originDepot.Acknowledge_User_Email;
          
          // กำหนด Current_step เป็น Waiting_CaseAction5
          currentStep = 'Waiting_CaseAction5';
        } else {
          
          // Approval_1: Branch Manager จาก originDepot
          approvalData.Move_Approval_1_User_Id = originDepot.Approval1ref_User;
          approvalData.Move_Approval_1_Name = originDepot.ref_User1Name;
          approvalData.Move_Approval_1_Email = originDepot.moveApproval1Email;
          
          // Approval_2: Area Sales Manager จาก originDepot
          approvalData.Move_Approval_2_User_Id = originDepot.Approval2ref_User;
          approvalData.Move_Approval_2_Name = originDepot.ref_User2Name;
          approvalData.Move_Approval_2_Email = originDepot.moveApproval2Email;
          
          // Approval_3: entity_Customer จาก originDepot หรือจาก BKK ถ้าเป็น BKK
          if (originDepot.Code === 'BKK') {
            const bkkDepot = await prisma.depot.findUnique({
              where: { Code: 'BKK' }
            });
            
            if (bkkDepot) {
              approvalData.Move_Approval_3_User_Id = bkkDepot.Approval4ref_User;
              approvalData.Move_Approval_3_Name = bkkDepot.ref_User4Name;
              approvalData.Move_Approval_3_Email = bkkDepot.moveApproval4Email;
            } else {
              // ถ้าไม่พบข้อมูล BKK ให้ใช้ค่าเดิม
              approvalData.Move_Approval_3_User_Id = originDepot.Approval3ref_User;
              approvalData.Move_Approval_3_Name = originDepot.ref_User3Name;
              approvalData.Move_Approval_3_Email = originDepot.moveApproval3Email;
            }
          } else {
            // ถ้าไม่ใช่ BKK ใช้ค่าเดิม
            approvalData.Move_Approval_3_User_Id = originDepot.Approval3ref_User;
            approvalData.Move_Approval_3_Name = originDepot.ref_User3Name;
            approvalData.Move_Approval_3_Email = originDepot.moveApproval3Email;
          }
          
          // ผู้รับทราบ: Account จาก originDepot
          approvalData.Acknowledge_User_Id = originDepot.Acknowledge_User_Id;
          approvalData.Acknowledge_User_Name = originDepot.Acknowledge_User_Name;
          approvalData.Acknowledge_User_Email = originDepot.Acknowledge_User_Email;
          
          // กำหนด Current_step เป็น Waiting_CaseAction3
          currentStep = 'Waiting_CaseAction3';
        }
      }
      
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
      
      // กำหนดค่า Destination_Code
      let destinationCode = header.destinationLocationId;
      // ถ้าไม่มี destinationLocationId แต่มี destinationDepot ให้ใช้ destinationDepot.Code
      if (!destinationCode && destinationDepot) {
        destinationCode = destinationDepot.Code;
      }
      
      // ต้องมี destinationCode ก่อนสร้างเอกสาร
      if (!destinationCode) {
        throw new Error('ไม่พบค่า Destination Code ที่ถูกต้อง กรุณาระบุ destinationLocationId');
      }

      // สร้างข้อมูลสำหรับบันทึกลง Movement_Doccument
      const headerData = {
        Document_Number: documentNumber,
        Created_Date: new Date(),
        Created_By: header.createdBy,
        Created_Depot_Code: header.createdDepot,
        Document_Status: 'I',
        Origin_Location: header.originLocationName,
        Origin_Location_Type: originLocationType,
        Destination_Location: header.destinationLocationName,
        Destination_Location_Type: destinationLocationType,
        Destination_Code: destinationCode,
        Origin_Description: header.originDescription || '',
        Destination_Description: header.destinationDescription || '',
        Details: header.details || '',
        Origin_Customer_Signature_Required: originLocationType === 'C' ? 'Y' : 'N',
        Origin_Customer_Signature: null,
        Origin_Customer_Signature_Date: null,
        Destination_Customer_Signature_Required: destinationLocationType === 'C' ? 'Y' : 'N',
        Destination_Customer_Signature: null,
        Destination_Customer_Signature_Date: null,
        Move_Approval_1_Status: null,
        Move_Approval_2_Status: null,
        Move_Approval_3_Status: null,
        Move_Approval_4_Status: null,
        Move_Approval_1_Date: null,
        Move_Approval_2_Date: null,
        Move_Approval_3_Date: null,
        Move_Approval_4_Date: null,
        Acknowledge_Status: null,
        Acknowledge_Date: null,
        Next_Approval_User_Id: approvalData.Next_Approval_User_Id,
        Move_Approval_1_User_Id: approvalData.Move_Approval_1_User_Id, 
        Move_Approval_1_Name: approvalData.Move_Approval_1_Name,
        Move_Approval_1_Email: approvalData.Move_Approval_1_Email,
        Move_Approval_2_User_Id: approvalData.Move_Approval_2_User_Id,
        Move_Approval_2_Name: approvalData.Move_Approval_2_Name,
        Move_Approval_2_Email: approvalData.Move_Approval_2_Email,
        Move_Approval_3_User_Id: approvalData.Move_Approval_3_User_Id,
        Move_Approval_3_Name: approvalData.Move_Approval_3_Name,
        Move_Approval_3_Email: approvalData.Move_Approval_3_Email,
        Move_Approval_4_User_Id: approvalData.Move_Approval_4_User_Id,
        Move_Approval_4_Name: approvalData.Move_Approval_4_Name,
        Move_Approval_4_Email: approvalData.Move_Approval_4_Email,
        Acknowledge_User_Id: approvalData.Acknowledge_User_Id,
        Acknowledge_User_Name: approvalData.Acknowledge_User_Name,
        Acknowledge_User_Email: approvalData.Acknowledge_User_Email,
        Current_step: currentStep
      };
      
      // บันทึกข้อมูล header ลงฐานข้อมูล
      const createdHeader = await prisma.movement_Doccument.create({
        data: headerData
      });
      
      console.log('=========== ผลลัพธ์การสร้าง Movement_Doccument ===========');
      console.log('Created Header:', JSON.stringify(createdHeader, null, 2));
      console.log('====================================================');
      
      // บันทึกข้อมูล assets ลงฐานข้อมูล
      const assetDetailsPromises = assets.map(asset => {
   
        
        return prisma.movementDetail.create({
          data: {
            Movement_Doccument: {
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
            Created_By: {
              connect: {
                code: user.code
              }
            }
          }
        });
      });
      
      // รอให้บันทึกข้อมูล assets เสร็จทั้งหมด
      const createdAssetDetails = await Promise.all(assetDetailsPromises);

      console.log('=========== ผลลัพธ์การสร้าง MovementDetails ===========');
      console.log('Created AssetEntity Details Count:', createdAssetDetails.length);
      console.log('Sample AssetEntity Detail:', createdAssetDetails.length > 0 ? JSON.stringify(createdAssetDetails[0], null, 2) : 'ไม่มีข้อมูล');
      console.log('======================================================');
      
      // อัพเดตสถานะทรัพย์สินเป็น M (Moving)
      const assetUpdatePromises = assets.map(asset => {
        const assetSerialNumber = asset.serialNumber || asset.assetSerialNumber;
        
        return prisma.assetEntity.update({
          where: { Asset_ID_Number: assetSerialNumber },
          data: { Asset_Status: 'M' }
        });
      });
      
      // รอให้อัพเดตสถานะทรัพย์สินเสร็จทั้งหมด
      const updatedAssets = await Promise.all(assetUpdatePromises);

      console.log('=========== ผลลัพธ์การอัพเดทสถานะทรัพย์สิน ===========');
      console.log('Updated Assets Count:', updatedAssets.length);
      console.log('Sample Updated AssetEntity:', updatedAssets.length > 0 ? JSON.stringify(updatedAssets[0], null, 2) : 'ไม่มีข้อมูล');
      console.log('=======================================================');
      

      
      // ตรวจสอบความสำเร็จในการส่งอีเมลก่อนสร้างเอกสาร
      let approverEmailResult = { success: false, message: 'ไม่มีผู้อนุมัติที่ต้องส่งอีเมล' };
      
      if (approvalData.Next_Approval_User_Id && approvalData.Move_Approval_1_Email) {
        try {
          const emailService = require('../utils/email-service');
          
        
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
          
     
          
        } catch (emailError) {
          console.error('====== เกิดข้อผิดพลาดในการส่งอีเมลแจ้งเตือนผู้สร้างเอกสาร ======');
          console.error('- ข้อความผิดพลาด:', emailError.message);
          console.error('- ผู้รับที่ส่งไม่สำเร็จ:', user.Contact_Email);
          console.error('=======================================');
          
          creatorEmailResult = { success: false, error: emailError.message };
        }
      }
      
      // แสดงข้อมูลผลลัพธ์ทั้งหมดก่อนส่งกลับให้ client
      console.log('=========== ข้อมูลการสร้างเอกสารทั้งหมด ===========');
      console.log('Document Number:', documentNumber);
      console.log('Header Data:', JSON.stringify(headerData, null, 2));
      console.log('Assets:', JSON.stringify(assets, null, 2));
      console.log('Approval Data:', JSON.stringify(approvalData, null, 2));
      console.log('Usecase Info:', {
        isBKK,
        isDepotOrigin,
        isDepotDestination,
        isDestinationBKK,
        originCode,
        currentStep
      });
      console.log('Email Results:', {
        approverEmail: approverEmailResult,
        creatorEmail: creatorEmailResult
      });
      console.log('==================================================');
      
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
      const { status, userId, approvalStep } = req.body;
      
      // ตรวจสอบว่ามีเอกสารนี้อยู่หรือไม่
      const existingMovement = await prisma.movement_Doccument.findUnique({
        where: { Document_Number: documentNumber }
      });
      
      if (!existingMovement) {
        return res.status(404).json({ message: 'ไม่พบเอกสาร' });
      }
      
      // แปลงสถานะให้เป็นรูปแบบที่ถูกต้อง
      let normalizedStatus = status;
      if (status === 'approve' || status === 'Approve') {
        normalizedStatus = 'Approved';
      } else if (status === 'reject' || status === 'Reject') {
        normalizedStatus = 'Rejected';
      }
      
      // ข้อมูลที่จะอัพเดต
      const updateData = {
        Document_Status: normalizedStatus
      };
      
      // ถ้ามี userId และ approvalStep ให้อัพเดตข้อมูลการอนุมัติตามขั้นตอน
      if (userId && approvalStep) {
        // หาชื่อและอีเมลของผู้อนุมัติ
        const approver = await prisma.user.findUnique({
          where: { code: userId }
        });
        
        const approverName = approver?.name || approver?.nameEng || userId;
        const approverEmail = approver?.Contact_Email || '';
        
        // ปรับรูปแบบสถานะเป็น Y/R สำหรับการบันทึกลงฐานข้อมูล
        const dbStatus = normalizedStatus === 'Approved' ? 'Y' : 
                         normalizedStatus === 'Rejected' ? 'R' : null;
        
        // อัพเดตสถานะตามขั้นตอนการอนุมัติ
        updateData[`Move_Approval_${approvalStep}_Status`] = dbStatus;
        updateData[`Move_Approval_${approvalStep}_Date`] = new Date();
        
        // หาขั้นตอนถัดไปที่ต้องอนุมัติ
        let nextApprovalUserId = null;
        for (let i = approvalStep + 1; i <= 4; i++) {
          const nextUserId = existingMovement[`Move_Approval_${i}_User_Id`];
          if (nextUserId) {
            nextApprovalUserId = nextUserId;
            break;
          }
        }
        
        // อัพเดต Next_Approval_User_Id ถ้าจำเป็น
        if (normalizedStatus === 'Approved') {
          updateData.Next_Approval_User_Id = nextApprovalUserId;
          
          // อัพเดต Current_step ตามขั้นตอนการอนุมัติ
          // ดึงข้อมูลเพิ่มเติมเพื่อตรวจสอบประเภทของเอกสาร
          const originLocationType = existingMovement.Origin_Location_Type;
          const destinationLocationType = existingMovement.Destination_Location_Type;
          const originLocation = existingMovement.Origin_Location;
          const destinationLocation = existingMovement.Destination_Location;
          
          const isBKK = originLocation === 'BKK';
          const isDestinationBKK = destinationLocation === 'BKK';
          const isDepotOrigin = originLocationType === 'D';
          const isDepotDestination = destinationLocationType === 'D';
          const isCustomerToCustomer = originLocationType === 'C' && destinationLocationType === 'C';
          
          // กำหนด Current_step ตาม use case
          if (isDepotOrigin && isDepotDestination) {
            if (isBKK || isDestinationBKK) {
              // Use case 1 & 2: BKK to Depot หรือ Depot to BKK
              if (approvalStep === 1) {
                // ขั้นตอนที่ 1: ถ้าเป็น BKK to Depot ขั้นตอนถัดไปคือ Branch Manager, Depot to BKK ขั้นตอนถัดไปคือ Sales AssetEntity Manager
                if (isBKK) {
                  // Use case 1: BKK to Depot - ขั้นตอนถัดไปคือ Branch Manager 
                  updateData.Current_step = 'Waiting_CaseAction3';
                } else if (isDestinationBKK) {
                  // Use case 2: Depot to BKK - ขั้นตอนถัดไปคือ Sales AssetEntity Manager
                  updateData.Current_step = 'Waiting_CaseAction2';
                }
              } else if (approvalStep === 2) {
                // ขั้นตอนที่ 2: ทั้งสองกรณีจะไปที่ Account
                updateData.Current_step = 'Waiting_CaseAction6';
              }
            }
          } else if ((isBKK && !isDepotDestination) || (!isDepotOrigin && isDestinationBKK)) {
            // Use case 3: BKK To entity_Customer & entity_Customer to BKK
            if (approvalStep === 1) {
              // จาก Area Sales Manager ไปที่ Sales AssetEntity Manager
              updateData.Current_step = 'Waiting_CaseAction2';
            } else if (approvalStep === 2) {
              // จาก Sales AssetEntity Manager ไปที่ entity_Customer
              updateData.Current_step = 'Waiting_Customer';
            } else if (approvalStep === 3) {
              // จาก entity_Customer ไปที่ Account
              updateData.Current_step = 'Waiting_CaseAction6';
            }
          } else {
            if (isCustomerToCustomer) {
              // Use case 5: entity_Customer to entity_Customer
              if (approvalStep === 1) {
                // จาก Branch Manager ไปที่ Area Sales Manager
                updateData.Current_step = 'Waiting_CaseAction5';
              } else if (approvalStep === 2) {
                // จาก Area Sales Manager ไปที่ entity_Customer ต้นทาง
                updateData.Current_step = 'Waiting_Customer_Old';
              } else if (approvalStep === 3) {
                // จาก entity_Customer ต้นทาง ไปที่ entity_Customer ปลายทาง
                updateData.Current_step = 'Waiting_Customer_New';
              } else if (approvalStep === 4) {
                // จาก entity_Customer ปลายทาง ไปที่ Account
                updateData.Current_step = 'Waiting_CaseAction6';
              }
            } else {
              // Use case 4: Depot to entity_Customer หรือ entity_Customer to Depot
              if (approvalStep === 1) {
                // จาก Branch Manager ไปที่ Area Sales Manager
                updateData.Current_step = 'Waiting_CaseAction5';
              } else if (approvalStep === 2) {
                // จาก Area Sales Manager ไปที่ entity_Customer
                updateData.Current_step = 'Waiting_Customer';
              } else if (approvalStep === 3) {
                // จาก entity_Customer ไปที่ Account
                updateData.Current_step = 'Waiting_CaseAction6';
              }
            }
          }
        } else if (normalizedStatus === 'Rejected') {
          // กรณีปฏิเสธการอนุมัติ
          updateData.Next_Approval_User_Id = null;
          updateData.Current_step = null;
          updateData.Document_Status = 'R'; // อัพเดตสถานะเอกสารเป็น Rejected
        }
      }
      
      // อัปเดตสถานะเอกสาร
      const updatedMovement = await prisma.movement_Doccument.update({
        where: { Document_Number: documentNumber },
        data: updateData
      });
      
      // ถ้าสถานะเป็น Completed หรือ Cancelled ให้อัพเดตสถานะของ AssetEntity กลับเป็น Y (Available)
      if (normalizedStatus === 'Completed' || normalizedStatus === 'Cancelled') {
        // ดึงข้อมูล assets ที่เกี่ยวข้อง
        const relatedAssets = await prisma.movementDetail.findMany({
          where: { Document_Number: documentNumber },
          select: { Asset_ID_Number: true }
        });
        
        // อัพเดตสถานะกลับเป็น Y
        if (relatedAssets.length > 0) {
          const assetUpdatePromises = relatedAssets.map(asset => {
            return prisma.assetEntity.update({
              where: { Asset_ID_Number: asset.Asset_ID_Number },
              data: { Asset_Status: 'Y' }
            });
          });
          
          await Promise.all(assetUpdatePromises);
        }
      }
      
      // ส่งอีเมลแจ้งเตือนถ้าจำเป็น
      // (ใช้โค้ดส่งอีเมลเดิม)
      
      // เพิ่มการส่งอีเมลแจ้งเตือน
      try {
        // กำหนดข้อความสถานะตาม Current_step
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
        
        // ใช้สถานะใหม่จาก updateData หรือใช้สถานะเดิมถ้าไม่มี
        if (updateData.Current_step && stepStatusMapping[updateData.Current_step]) {
          statusMessage = stepStatusMapping[updateData.Current_step];
        } else if (normalizedStatus === 'Rejected') {
          statusMessage = 'เอกสารถูกปฏิเสธ';
        } else if (normalizedStatus === 'Completed') {
          statusMessage = 'เอกสารเสร็จสมบูรณ์';
        } else if (normalizedStatus === 'Cancelled') {
          statusMessage = 'เอกสารถูกยกเลิก';
        } else {
          statusMessage = 'สถานะเอกสารถูกอัปเดต';
      }
      
      // ส่งอีเมลแจ้งเตือนทุกคนที่เกี่ยวข้อง
      const emailService = require('../utils/email-service');
        await emailService.notifyAllRelatedParties(
          updatedMovement,
          normalizedStatus === 'Approved' ? 'Y' : 
          normalizedStatus === 'Rejected' ? 'R' : 
          normalizedStatus === 'Completed' ? 'C' : 
          normalizedStatus === 'Cancelled' ? 'X' : 'I',
          userId || 'System',
          approvalStep || 0,
          process.env.APP_URL || 'https://assettrackmove.com',
          statusMessage
        );
        
      } catch (emailError) {
        console.error('เกิดข้อผิดพลาดในการส่งอีเมลแจ้งเตือน:', emailError);
      }
      
      res.status(200).json({
        status: 'success',
        message: 'อัพเดตสถานะเอกสารสำเร็จ',
        data: {
          documentNumber,
          status: normalizedStatus,
          updatedAt: new Date()
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
      const user = req.user;
      
      // ดึงข้อมูล header
      const movementHeader = await prisma.movement_Doccument.findUnique({
        where: { Document_Number: id },
        include: {
          MovementDetails: true,
          Created_Depot: {
            select: {
              Name: true
            }
          }
        }
      });
      
      if (!movementHeader) {
        return res.status(404).json({
          status: 'error',
          message: 'ไม่พบข้อมูลเอกสาร'
        });
      }

      // ตรวจสอบสิทธิ์ในการเข้าถึงเอกสาร
      // อนุญาตเฉพาะ Admin หรือคนที่อยู่ entity_depot เดียวกับเอกสารเท่านั้น
      const isAdmin = user.role_code.toUpperCase() === 'ADMIN';
      const isSameDepot = user.ref_depot_code === movementHeader.Created_Depot_Code;
      
      if (!isAdmin && !isSameDepot) {
        return res.status(403).json({
          status: 'error',
          message: 'คุณไม่มีสิทธิ์ในการเข้าถึงเอกสารนี้'
        });
      }
  
      // ดึงข้อมูล assets
      const movementDetails = await prisma.movementDetail.findMany({
        where: { Document_Number: id },
        include: {
          AssetEntity: true
        }
      });
  
      // สร้างข้อมูลการอนุมัติ
      const approvals = [];
      
      // ตรวจสอบและเพิ่มข้อมูลผู้อนุมัติแต่ละคน
      for (let i = 1; i <= 4; i++) {
        const userId = movementHeader[`Move_Approval_${i}_User_Id`];
        if (userId) {
          // แปลงสถานะให้อ่านง่ายขึ้น
          let status = 'Pending';
          if (movementHeader[`Move_Approval_${i}_Status`] === 'Y' || 
              movementHeader[`Move_Approval_${i}_Status`] === 'Approved') {
            status = 'Approved';
          } else if (movementHeader[`Move_Approval_${i}_Status`] === 'R' || 
                     movementHeader[`Move_Approval_${i}_Status`] === 'Rejected') {
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
            name: movementHeader[`Move_Approval_${i}_Name`],
            email: movementHeader[`Move_Approval_${i}_Email`],
            status: status,
            approveDate: movementHeader[`Move_Approval_${i}_Date`],
            case_action: case_action, // เพิ่ม case_action ในข้อมูลการอนุมัติ
            comment: movementHeader[`Move_Approval_${i}_comment`] || '' // เพิ่ม comment
          });
        }
      }
  
      // สร้างข้อมูลการรับทราบ
      const acknowledge = movementHeader.Acknowledge_User_Id ? {
        userId: movementHeader.Acknowledge_User_Id,
        name: movementHeader.Acknowledge_User_Name,
        email: movementHeader.Acknowledge_User_Email,
        status: movementHeader.Acknowledge_Status === 'Y' ? 'Acknowledged' : 'Pending',
        acknowledgeDate: movementHeader.Acknowledge_Date,
        comment: movementHeader.Acknowledge_User_comment || '' // เพิ่ม comment ของผู้รับทราบ
      } : null;
  
      // สร้างข้อมูลลายเซ็น
      const signatures = {
        origin: {
          required: movementHeader.Origin_Customer_Signature_Required === 'Y',
          signature: movementHeader.Origin_Customer_Signature,
          date: movementHeader.Origin_Customer_Signature_Date,
          comment: movementHeader.Origin_Customer_comment || '' // เพิ่ม comment ของลูกค้าต้นทาง
        },
        destination: {
          required: movementHeader.Destination_Customer_Signature_Required === 'Y',
          signature: movementHeader.Destination_Customer_Signature,
          date: movementHeader.Destination_Customer_Signature_Date,
          comment: movementHeader.Destination_Customer_comment || '' // เพิ่ม comment ของลูกค้าปลายทาง
        }
      };
      
      // จัดรูปแบบข้อมูลทั้งหมด
      const formattedData = {
        header: {
          documentNumber: movementHeader.Document_Number,
          createdDate: movementHeader.Created_Date,
          createdDepot: movementHeader.Created_Depot_Code,
          createdDepotName: movementHeader.Created_Depot?.Name || movementHeader.Created_Depot_Code,
          status: movementHeader.Document_Status,
          details: movementHeader.Details || '',
          originType: movementHeader.Origin_Location_Type === 'D' ? 'Depot' : 'entity_Customer',
          originLocationId: movementHeader.Origin_Location,
          originLocationName: movementHeader.Origin_Location,
          originDescription: movementHeader.Origin_Description || '',
          originComment: movementHeader.Origin_Customer_comment || '',
          destinationType: movementHeader.Destination_Location_Type === 'D' ? 'Depot' : 'entity_Customer',
          destinationLocationId: movementHeader.Destination_Location,
          destinationLocationName: movementHeader.Destination_Location,
          destinationDescription: movementHeader.Destination_Description || '',
          destinationComment: movementHeader.Destination_Customer_comment || '',
          createdBy: movementHeader.Created_By,
          totalAssets: movementHeader.MovementDetails?.length || 0,
          Current_step: movementHeader.Current_step || '',
          Next_Approval_User_Id: movementHeader.Next_Approval_User_Id || ''
        },
        Document_Number: movementHeader.Document_Number,
        Current_step: movementHeader.Current_step || '',
        Next_Approval_User_Id: movementHeader.Next_Approval_User_Id || '',
        assets: movementDetails.map(detail => ({
          serialNumber: detail.AssetEntity?.Asset_ID_Number || '',
          sapAssetNumber: detail.AssetEntity?.Running_Asset_Number || 'ไม่ระบุ',
          assetDescription: detail.AssetEntity?.Asset_Description || 'ไม่ระบุ',
          modelNo: detail.AssetEntity?.Model_No || 'ไม่ระบุ',
          equipmentDescription: detail.AssetEntity?.Equipment_Description || 'ไม่ระบุ',
          assetType: detail.AssetEntity?.Asset_Type || 'ไม่ระบุ'
        })),
        approvals,
        acknowledge,
        signatures
      };
      
      res.status(200).json({
        status: 'success',
        data: formattedData
      });
      
    } catch (error) {
      console.error('Error fetching movement entry:', error);
      res.status(500).json({
        status: 'error',
        message: 'ไม่สามารถดึงข้อมูลเอกสารเคลื่อนย้ายทรัพย์สินได้',
        error: error.message
      });
    }
  };
  


exports.getmovementApprovalById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const user = req.user;
      
      console.log('========== getmovementApprovalById DEBUG ==========');
      console.log('Document ID:', id);
      console.log('User:', JSON.stringify(user));
      
      // ดึงข้อมูล header
      const movementHeader = await prisma.movement_Doccument.findUnique({
        where: { Document_Number: id },
        include: {
          MovementDetails: true,
          Created_Depot: {
            select: {
              Name: true
            }
          }
        }
      });
      
      if (!movementHeader) {
        console.log('ไม่พบข้อมูลเอกสาร:', id);
        return res.status(404).json({
          status: 'error',
          message: 'ไม่พบข้อมูลเอกสาร'
        });
      }

      console.log('Movement Header:', JSON.stringify(movementHeader));

      // ตรวจสอบสิทธิ์ในการเข้าถึงเอกสาร
      // อนุญาตเฉพาะ Admin หรือคนที่อยู่ entity_depot เดียวกับเอกสารเท่านั้น
      const isAdmin = user.role_code.toUpperCase() === 'ADMIN';
      const isSameDepot = user.ref_depot_code === movementHeader.Created_Depot_Code;
      
      console.log('สิทธิ์การเข้าถึง:');
      console.log('- isAdmin:', isAdmin);
      console.log('- isSameDepot:', isSameDepot, `(User Depot: ${user.ref_depot_code}, Document Depot: ${movementHeader.Created_Depot_Code})`);
      
      // เพิ่มการตรวจสอบว่าเป็นผู้อนุมัติของเอกสารหรือไม่
      let isApprover = false;
      for (let i = 1; i <= 4; i++) {
        if (movementHeader[`Move_Approval_${i}_User_Id`] === user.code) {
          isApprover = true;
          console.log(`- isApprover: true (User is Move_Approval_${i}_User_Id)`);
          break;
        }
      }
      
      if (!isApprover) {
        console.log('- isApprover: false');
        // เพิ่มการตรวจสอบว่าเป็นผู้รับทราบหรือไม่
        const isAcknowledgeUser = movementHeader.Acknowledge_User_Id === user.code;
        console.log('- isAcknowledgeUser:', isAcknowledgeUser, 
                  `(User: ${user.code}, Acknowledge_User_Id: ${movementHeader.Acknowledge_User_Id})`);
      }
      
      // ตรวจสอบว่าผู้ใช้เป็นผู้รับทราบหรือไม่
      const isAcknowledgeUser = movementHeader.Acknowledge_User_Id === user.code;
      
      if (!isAdmin && !isSameDepot && !isApprover && !isAcknowledgeUser) {
        console.log('ผู้ใช้ไม่มีสิทธิ์ในการเข้าถึงเอกสารนี้:');
        console.log('- ไม่ใช่ admin');
        console.log('- ไม่ได้อยู่ entity_depot เดียวกับเอกสาร');
        console.log('- ไม่ใช่ผู้อนุมัติของเอกสาร');
        console.log('- ไม่ใช่ผู้รับทราบของเอกสาร');
        console.log('================================================');
        return res.status(403).json({
          status: 'error',
          message: 'คุณไม่มีสิทธิ์ในการเข้าถึงเอกสารนี้'
        });
      }
      
      console.log('ผู้ใช้มีสิทธิ์ในการเข้าถึงเอกสารนี้');
      console.log('================================================');

      // ดึงข้อมูล assets
      const movementDetails = await prisma.movementDetail.findMany({
        where: { Document_Number: id },
        include: {
          AssetEntity: true
        }
      });
  
      // สร้างข้อมูลการอนุมัติ
      const approvals = [];
      
      // ตรวจสอบและเพิ่มข้อมูลผู้อนุมัติแต่ละคน
      for (let i = 1; i <= 4; i++) {
        const userId = movementHeader[`Move_Approval_${i}_User_Id`];
        if (userId) {
          // แปลงสถานะให้อ่านง่ายขึ้น
          let status = 'Pending';
          if (movementHeader[`Move_Approval_${i}_Status`] === 'Y' || 
              movementHeader[`Move_Approval_${i}_Status`] === 'Approved') {
            status = 'Approved';
          } else if (movementHeader[`Move_Approval_${i}_Status`] === 'R' || 
                     movementHeader[`Move_Approval_${i}_Status`] === 'Rejected') {
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
            name: movementHeader[`Move_Approval_${i}_Name`],
            email: movementHeader[`Move_Approval_${i}_Email`],
            status: status,
            approveDate: movementHeader[`Move_Approval_${i}_Date`],
            case_action: case_action, // เพิ่ม case_action ในข้อมูลการอนุมัติ
            comment: movementHeader[`Move_Approval_${i}_comment`] || '' // เพิ่ม comment
          });
        }
      }
      
      // สร้างข้อมูลการรับทราบ
      const acknowledge = movementHeader.Acknowledge_User_Id ? {
        userId: movementHeader.Acknowledge_User_Id,
        name: movementHeader.Acknowledge_User_Name,
        email: movementHeader.Acknowledge_User_Email,
        status: movementHeader.Acknowledge_Status === 'Y' ? 'Acknowledged' : 'Pending',
        acknowledgeDate: movementHeader.Acknowledge_Date,
        comment: movementHeader.Acknowledge_User_comment || '' // เพิ่ม comment ของผู้รับทราบ
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
      
      // จัดรูปแบบข้อมูลทั้งหมด
      const formattedData = {
        header: {
          documentNumber: movementHeader.Document_Number,
          createdDate: movementHeader.Created_Date,
          createdDepot: movementHeader.Created_Depot_Code,
          createdDepotName: movementHeader.Created_Depot?.Name || movementHeader.Created_Depot_Code,
          status: movementHeader.Document_Status,
          details: movementHeader.Details || '',
          originType: movementHeader.Origin_Location_Type === 'D' ? 'Depot' : 'entity_Customer',
          originLocationId: movementHeader.Origin_Location,
          originLocationName: movementHeader.Origin_Location,
          originDescription: movementHeader.Origin_Description || '',
          originComment: movementHeader.Origin_Customer_comment || '',
          destinationType: movementHeader.Destination_Location_Type === 'D' ? 'Depot' : 'entity_Customer',
          destinationLocationId: movementHeader.Destination_Location,
          destinationLocationName: movementHeader.Destination_Location,
          destinationDescription: movementHeader.Destination_Description || '',
          destinationComment: movementHeader.Destination_Customer_comment || '',
          createdBy: movementHeader.Created_By,
          totalAssets: movementHeader.MovementDetails?.length || 0,
          Current_step: movementHeader.Current_step || '',
          Next_Approval_User_Id: movementHeader.Next_Approval_User_Id || ''
        },
        Document_Number: movementHeader.Document_Number,
        Current_step: movementHeader.Current_step || '',
        Next_Approval_User_Id: movementHeader.Next_Approval_User_Id || '',
        assets: movementDetails.map(detail => ({
          serialNumber: detail.AssetEntity?.Asset_ID_Number || '',
          sapAssetNumber: detail.AssetEntity?.Running_Asset_Number || 'ไม่ระบุ',
          assetDescription: detail.AssetEntity?.Asset_Description || 'ไม่ระบุ',
          modelNo: detail.AssetEntity?.Model_No || 'ไม่ระบุ',
          equipmentDescription: detail.AssetEntity?.Equipment_Description || 'ไม่ระบุ',
          assetType: detail.AssetEntity?.Asset_Type || 'ไม่ระบุ'
        })),
        approvals,
        acknowledge,
        signatures
      };
      
      res.status(200).json({
        status: 'success',
        data: formattedData
      });
      
    } catch (error) {
      console.error('Error fetching movement entry:', error);
      res.status(500).json({
        status: 'error',
        message: 'ไม่สามารถดึงข้อมูลเอกสารเคลื่อนย้ายทรัพย์สินได้',
        error: error.message
      });
    }
  };


  
exports.getApprovalList = async (req, res) => {
    try {
 
      const { 
        userId,
        documentNumber,
        fromDate,
        toDate,
        status,
        createdDepot,
        isSales
      } = req.query;
  
      if (!userId) {
        return res.status(400).json({
          status: 'error',
          message: 'User ID is required'
        });
      }
  
      // ตรวจสอบว่าผู้ใช้เป็น admin หรือไม่
      const user = await prisma.user.findUnique({
        where: { code: userId }
      });

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'ไม่พบข้อมูลผู้ใช้'
        });
      }

      const isAdmin = user?.role_code?.toUpperCase() === 'ADMIN';
      const isSalesUser = isSales === 'true' || user?.case_action === 'Sales';

  
      // สร้างเงื่อนไขการค้นหา
      let whereConditions = {};
      
      // ถ้าไม่ใช่ admin ให้กรองเฉพาะรายการที่ต้องอนุมัติและต้องตรงตามเงื่อนไข case_action
      if (!isAdmin) {
        whereConditions.OR = [
          { Move_Approval_1_User_Id: userId },
          { Move_Approval_2_User_Id: userId },
          { Move_Approval_3_User_Id: userId },
          { Move_Approval_4_User_Id: userId }
        ];
        
        // กรณีเป็น Sales จะมองเห็นเอกสารในขั้นตอน entity_Customer ได้
        if (isSalesUser) {
          // แก้ไขจากเดิม: ให้ Sales เห็นเฉพาะเอกสารของตัวเองหรือเอกสารที่อยู่ในขั้นตอน entity_Customer ที่ตนเองเกี่ยวข้องเท่านั้น
          whereConditions = {
            AND: [
              // เงื่อนไขที่ 1: เอกสารต้องเกี่ยวข้องกับผู้ใช้
              {
                OR: [
                  { Move_Approval_1_User_Id: userId },
                  { Move_Approval_2_User_Id: userId },
                  { Move_Approval_3_User_Id: userId },
                  { Move_Approval_4_User_Id: userId },
                  { Next_Approval_User_Id: userId },
                  { Created_By: userId }
                ]
              },
              // เงื่อนไขที่ 2: ตรวจสอบว่าเอกสารอยู่ในขั้นตอนที่เกี่ยวข้องกับการทำงานของ Sales หรือไม่
              {
                OR: [
                  // อยู่ในขั้นตอนที่กำลังรอลูกค้า
                  { 
                    AND: [
                      {
                        OR: [
                          { Current_step: 'Waiting_Customer' },
                          { Current_step: 'Waiting_Customer_Old' },
                          { Current_step: 'Waiting_Customer_New' }
                        ]
                      },
                      // ต้องเป็นเอกสารที่ตัวเองมีส่วนเกี่ยวข้อง
                      {
                        OR: [
                          { Move_Approval_1_User_Id: userId },
                          { Move_Approval_2_User_Id: userId },
                          { Move_Approval_3_User_Id: userId },
                          { Move_Approval_4_User_Id: userId },
                          { Next_Approval_User_Id: userId },
                          { Created_By: userId }
                        ]
                      }
                    ]
                  },
                  // หรืออยู่ในขั้นตอนที่ Sales ต้องทำงาน
                  { Current_step: 'Waiting_CaseAction1' },
                  // หรือเป็นเอกสารที่ยังไม่เสร็จสมบูรณ์ ที่ Sales เป็นคนสร้าง
                  {
                    AND: [
                      { Created_By: userId },
                      { Document_Status: { not: 'C' } } // ไม่ใช่เอกสารที่เสร็จสมบูรณ์แล้ว
                    ]
                  }
                ]
              }
            ]
          };
        }
        else {
          // เพิ่มเงื่อนไขตรวจสอบ case_action ต้องตรงกับ Current_step
          // กำหนดความสัมพันธ์ระหว่าง case_action และ Current_step
          if (user.case_action) {
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
              'Sales': ['Waiting_Customer', 'Waiting_Customer_Old', 'Waiting_Customer_New'] // Sales สามารถเข้าถึงได้ทั้ง 3 ขั้นตอน
            };

            const matchingStep = actionStepMapping[user.case_action];
            if (matchingStep) {
              // กรณีพิเศษสำหรับ Sales ที่สามารถเข้าถึงได้หลายขั้นตอน
              if (Array.isArray(matchingStep)) {
                whereConditions.Current_step = {
                  in: matchingStep
                };
              } else {
                whereConditions.Current_step = matchingStep;
              }
            } else {
              return res.status(403).json({
                status: 'error',
                message: 'ไม่มีสิทธิ์ในการดูข้อมูลนี้ (case_action ไม่ถูกต้อง)'
              });
            }
          } else {
            return res.status(403).json({
              status: 'error',
              message: 'ไม่มีสิทธิ์ในการดูข้อมูลนี้ (ไม่ได้กำหนด case_action)'
            });
          }
        }
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
      const documents = await prisma.movement_Doccument.findMany({
        where: whereConditions,
        orderBy: {
          Created_Date: 'desc'
        }
      });
  
      
      // แสดงตัวอย่างเอกสารที่พบ (แสดงเฉพาะ 3 รายการแรกเพื่อไม่ให้ log ยาวเกินไป)
      if (documents.length > 0) {
        documents.slice(0, 3).forEach((doc, index) => {
        });
      }
  
      // กรองเอกสารตามเงื่อนไขการ approve เฉพาะกรณีไม่ใช่ admin และไม่ใช่ Sales
      let filteredDocuments = documents;
      
      if (!isAdmin && !isSalesUser) {
        filteredDocuments = documents.filter(doc => {
        // ตรวจสอบว่า user อยู่ในขั้นตอนไหน
        let userStep = 0;
        for (let i = 1; i <= 4; i++) {
          if (doc[`Move_Approval_${i}_User_Id`] === userId) {
            userStep = i;
            break;
          }
        }
  
        // ถ้าเป็น step แรก ให้เห็นเลย
        if (userStep === 1) return true;
  
        // ตรวจสอบว่า step ก่อนหน้าได้ approve แล้วหรือยัง
        for (let i = 1; i < userStep; i++) {
          if (doc[`Move_Approval_${i}_Status`] !== 'Y') {
            return false;
          }
        }
  
        // ตรวจสอบว่า step ปัจจุบันได้ approve ไปแล้วหรือยัง
        return !doc[`Move_Approval_${userStep}_Status`];
      });
      }
      else if (!isAdmin && isSalesUser) {
        // กรณี Sales user ให้เพิ่มการตรวจสอบว่าเอกสารอยู่ในสถานะที่ Sales ควรจะเห็นหรือไม่
        filteredDocuments = documents.filter(doc => {
          // ตรวจสอบว่า user มีชื่ออยู่ในขั้นตอนไหนของเอกสาร
          let isInvolved = false;
          for (let i = 1; i <= 4; i++) {
            if (doc[`Move_Approval_${i}_User_Id`] === userId) {
              isInvolved = true;
              break;
            }
          }
          
          // ตรวจสอบว่าเป็นคนสร้างเอกสารหรือไม่
          const isCreator = doc.Created_By === userId;
          
          // ตรวจสอบว่าเอกสารอยู่ในขั้นตอนที่เกี่ยวข้องกับ Sales หรือไม่
          const isRelevantStep = 
            doc.Current_step === 'Waiting_CaseAction1' || 
            doc.Current_step === 'Waiting_Customer' || 
            doc.Current_step === 'Waiting_Customer_Old' || 
            doc.Current_step === 'Waiting_Customer_New';
          
          // ตรวจสอบว่าเอกสารอยู่ในสถานะที่ไม่ได้เสร็จสมบูรณ์
          const isNotCompleted = doc.Document_Status !== 'C';
          
          // กรณีที่ 1: เป็นผู้สร้างเอกสารและเอกสารยังไม่เสร็จสมบูรณ์
          // กรณีที่ 2: มีชื่อเกี่ยวข้องกับเอกสารและเอกสารอยู่ในขั้นตอนที่เกี่ยวข้อง
          return (isCreator && isNotCompleted) || (isInvolved && isRelevantStep);
        });
      }
  
      
      // แปลงข้อมูลให้เหมาะกับการแสดงผล
      const formattedDocuments = await Promise.all(filteredDocuments.map(async doc => {
        // หา current approver และ case_action
        let currentApprover = '';
        let currentApproverUserId = '';
        let approvalStep = 0;
        for (let i = 1; i <= 4; i++) {
          const status = doc[`Move_Approval_${i}_Status`];
          if (!status) {
            currentApprover = doc[`Move_Approval_${i}_Name`] || '';
            currentApproverUserId = doc[`Move_Approval_${i}_User_Id`] || '';
            approvalStep = i;
            break;
          }
        }
        
        // ดึงข้อมูล case_action ของ user ที่ต้องอนุมัติ
        let approverRole = '';
        
        // ตรวจสอบจาก Current_step ก่อนเสมอ
        if (doc.Current_step === 'Waiting_CaseAction1') {
          approverRole = 'CaseAction1';
        } else if (doc.Current_step === 'Waiting_CaseAction2') {
          approverRole = 'CaseAction2';
        } else if (doc.Current_step === 'Waiting_CaseAction3') {
          approverRole = 'CaseAction3';
        } else if (doc.Current_step === 'Waiting_CaseAction4') {
          approverRole = 'CaseAction4';
        } else if (doc.Current_step === 'Waiting_CaseAction5') {
          approverRole = 'CaseAction5';
        } else if (doc.Current_step === 'Waiting_Customer') {
          approverRole = 'entity_Customer';
        } else if (doc.Current_step === 'Waiting_Customer_Old') {
          approverRole = 'Customer_Old';
        } else if (doc.Current_step === 'Waiting_Customer_New') {
          approverRole = 'Customer_New';
        } else if (doc.Current_step === 'Waiting_CaseAction6') {
          approverRole = 'Account';
        } else if (currentApproverUserId) {
          // ถ้าไม่สามารถกำหนดจาก Current_step ได้ จึงดึงจากฐานข้อมูล
          const approverUser = await prisma.user.findUnique({
            where: { code: currentApproverUserId },
            select: { case_action: true }
          });
          approverRole = approverUser?.case_action || '';
        }

  
        return {
          documentNumber: doc.Document_Number,
          createdDate: doc.Created_Date,
          createdDepot: doc.Created_Depot_Code,
          originLocation: doc.Origin_Location,
          destinationLocation: doc.Destination_Location,
          currentApprover: approverRole, // ใช้ case_action แทน name
          currentApproverName: currentApprover, // เก็บชื่อไว้เผื่อต้องใช้
          currentStep: doc.Current_step,
          approvalStep,
          documentStatus: doc.Document_Status
        };
      }));
  

  
      res.status(200).json({
        status: 'success',
        data: formattedDocuments
      });
  
    } catch (error) {
      console.error('Error fetching approval list:', error);
      res.status(500).json({
        status: 'error',
        message: 'ไม่สามารถดึงข้อมูลรายการรออนุมัติได้',
        error: error.message
      });
    }
  };
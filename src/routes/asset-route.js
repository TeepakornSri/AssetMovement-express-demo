const express = require("express");
const assetController = require("../controllers/asset-controller");
const assetMovementController = require("../controllers/asset-movement-controller");
const authenticateMiddleware = require("../middlewares/authenticate");
const router = express.Router();

// เพิ่ม import สำหรับ asset-approve controller
const assetApproveController = require('../controllers/asset-approve');
const assetActknowledgeController = require('../controllers/asset-actknowledge');
const assetRepairController = require('../controllers/asset-repair');

// เพิ่ม route สำหรับดึงข้อมูลคลัง
router.get("/depots",authenticateMiddleware, assetController.getDepots);

// เพิ่ม route สำหรับค้นหาผู้ใช้
router.get('/search-users',authenticateMiddleware, assetController.searchUsers);

// เพิ่ม route สำหรับเพิ่มคลัง
router.post('/add-entity_depot',authenticateMiddleware, assetController.addDepots);

// เพิ่ม route สำหรับดึงข้อมูลคลังทั้งหมด
router.get("/all-depots",authenticateMiddleware, assetController.getAllDepot);

// เพิ่ม route สำหรับดึงข้อมูลคลังตาม entity_depot code
router.get("/entity_depot/:depotCode",authenticateMiddleware, assetController.getDepotByCode);

// เพิ่ม route สำหรับอัปเดตข้อมูลคลัง
router.put("/entity_depot/:depotCode",authenticateMiddleware, assetController.updateDepot);

// เพิ่ม route สำหรับเพิ่มข้อมูล AssetEntity
router.post('/add-asset',authenticateMiddleware, assetController.addAsset);

// เพิ่ม route สำหรับดึงข้อมูล AssetEntity ทั้งหมด
router.get('/assets',authenticateMiddleware, assetController.getAllAssets);

// เพิ่ม route สำหรับดึงข้อมูล AssetEntity ตาม Serial Number
router.get('/asset/:serialNumber',authenticateMiddleware, assetController.getAssetBySerialNumber);

// เพิ่ม route สำหรับอัปเดตข้อมูล AssetEntity
router.patch('/asset/:serialNumber',authenticateMiddleware, assetController.updateAsset);

// เพิ่ม route สำหรับดึงข้อมูลลูกค้าทั้งหมด
router.get("/customers",authenticateMiddleware, assetController.getAllCustomer);
router.get("/customersbydepot",authenticateMiddleware, assetController.getCustomerbyDepot);
router.get('/customers/:customerid',authenticateMiddleware, assetController.getCustomerById);

// เพิ่ม route สำหรับดึงข้อมูลพื้นที่ทั้งหมด
router.get("/areas",authenticateMiddleware, assetController.getAllArea);

// เพิ่ม route สำหรับดึงข้อมูลทรัพย์สินตาม Location
router.get("/assetsbylocation",authenticateMiddleware, assetController.getAssetBydepotorcus);

// เพิ่มเส้นทางสำหรับ movemententry
router.post('/movemententry',authenticateMiddleware, assetMovementController.movemententry);
router.get('/movement/getAllmovemententry',authenticateMiddleware, assetMovementController.getAllmovemententry); 
router.get('/movement/approval-list',authenticateMiddleware, assetMovementController.getApprovalList);
router.get('/movement/actknowledge-list',authenticateMiddleware, assetActknowledgeController.getActknowledgeList);
router.get('/movement/:id',authenticateMiddleware, assetMovementController.getmovemententryById);
router.get('/approve/:id',authenticateMiddleware, assetMovementController.getmovementApprovalById);
router.get('/repair/approval-list', authenticateMiddleware, assetRepairController.getRepairApprovalList);
router.get('/repair-approve/:id', authenticateMiddleware, assetRepairController.getrepairApprovalById);

// เพิ่ม routes สำหรับการอนุมัติเอกสาร
router.post('/movement/:id/approve', authenticateMiddleware, assetApproveController.assetapprove);
router.post('/movement/:id/approve-with-signature', authenticateMiddleware, assetApproveController.assetapprove);
// เพิ่ม route ที่ frontend เรียกใช้งานจริง (เพิ่มเติม)
router.post('/asset/movement/:id/approve-with-signature', authenticateMiddleware, assetApproveController.assetapprove);
// router.post('/movement/reject', authenticateMiddleware, assetApproveController.assetreject);
// เพิ่ม route สำหรับปฏิเสธเอกสาร
router.post('/movement/:id/reject', authenticateMiddleware, assetApproveController.assetreject);
router.post('/asset/movement/:id/reject', authenticateMiddleware, assetApproveController.assetreject);

// เพิ่ม route สำหรับการรับทราบเอกสาร
router.post('/movement/:id/acknowledge', authenticateMiddleware, assetActknowledgeController.actknowledgeApprove);

// เพิ่ม route สำหรับการสร้างเอกสารแจ้งซ่อม
router.post('/repair/create', authenticateMiddleware, assetRepairController.repairentry);
router.get('/repair/getAllrepair', authenticateMiddleware, assetRepairController.getAllrepair);
router.get('/repair/:id', authenticateMiddleware, assetRepairController.getrepairById);


module.exports = router;

const bcrypt = require("bcryptjs");
const JWT = require("jsonwebtoken");
const { loginSchema, passwordSchema } = require("../validators/auth-validator");
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const createError = require("../utils/create-error");
const emailService = require("../utils/email-service");

// --- Get Acknowledge List ---
exports.getActknowledgeList = async (req, res) => {
  try {
    const {
      userId,
      documentNumber,
      fromDate,
      toDate,
      status,
      createdDepot
    } = req.query;

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    const user = await prisma.user.findUnique({
      where: { code: userId }
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    const isAdmin = user?.role_code?.toLowerCase() === 'admin';

    const documentFilter = {
      Current_step: 'Waiting_CaseAction6'
    };

    if (!isAdmin) {
      documentFilter.Acknowledge_User_Id = userId;
    }

    if (documentNumber) {
      documentFilter.Document_Number = { contains: documentNumber };
    }

    if (fromDate || toDate) {
      documentFilter.Created_Date = {};
      if (fromDate) {
        documentFilter.Created_Date.gte = new Date(fromDate);
      }
      if (toDate) {
        documentFilter.Created_Date.lte = new Date(toDate);
      }
    }

    if (status) {
      documentFilter.Document_Status = status;
    }

    if (createdDepot) {
      documentFilter.Created_Depot_Code = createdDepot;
    }

    const acknowledgementDocuments = await prisma.movement_Doccument.findMany({
      where: documentFilter,
      orderBy: {
        Created_Date: 'desc'
      }
    });

    const formattedDocuments = acknowledgementDocuments.map(doc => ({
      documentNumber: doc.Document_Number,
      createdDate: doc.Created_Date,
      createdDepot: doc.Created_Depot_Code,
      originLocation: doc.Origin_Location,
      destinationLocation: doc.Destination_Location,
      currentStep: doc.Current_step,
      documentStatus: doc.Document_Status,
      acknowledgeStatus: doc.Acknowledge_Status || null,
      acknowledgeDate: doc.Acknowledge_Date || null
    }));

    res.status(200).json({
      status: 'success',
      data: formattedDocuments
    });

  } catch (error) {
    console.error('Error fetching acknowledgement list:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve acknowledgement list',
      error: error.message
    });
  }
};

// --- Acknowledge Approve/Reject ---
exports.actknowledgeApprove = async (req, res) => {
  try {
    const { id: documentNumber } = req.params;
    const { action } = req.body; // 'approve' or 'reject'
    const currentUserId = req.user.code;
    // const currentUserName = req.user.username || req.user.name || currentUserId; // User name for Modify_By field, if needed later

    const documentHeader = await prisma.movement_Doccument.findUnique({
      where: { Document_Number: documentNumber },
      include: {
        MovementDetails: true
      }
    });

    if (!documentHeader) {
      return res.status(404).json({
        status: 'error',
        message: 'Document not found'
      });
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
      if (action === 'approve') {
        const updatedDocument = await tx.movement_Doccument.update({
          where: { Document_Number: documentNumber },
          data: {
            Current_step: 'Completed',
            Acknowledge_Status: 'Y',
            Acknowledge_Date: new Date(),
            Document_Status: 'C',
            Modify_By: currentUserId,
            Modify_Date: new Date()
          }
        });

        const assetUpdatePromises = documentHeader.MovementDetails.map(async (detail) => {
          const assetUpdateData = {
            Current_Location: documentHeader.Destination_Location,
            Current_Location_Type: documentHeader.Destination_Location_Type,
            Location_Code: documentHeader.Destination_Code,
            Asset_Status: 'Y',
            Modify_Date: new Date(),
            Modify_By_UserId: currentUserId
          };

          return tx.assetEntity.update({
            where: { Asset_ID_Number: detail.Asset_ID_Number },
            data: assetUpdateData
          });
        });

        await Promise.all(assetUpdatePromises);

        return {
          status: 'success',
          message: 'Document acknowledged and assets updated successfully',
          data: updatedDocument
        };
      } else if (action === 'reject') {
        const updatedDocument = await tx.movement_Doccument.update({
          where: { Document_Number: documentNumber },
          data: {
            Current_step: 'Rejected',
            Acknowledge_Status: null,
            Document_Status: 'R',
            Modify_By: currentUserId,
            Modify_Date: new Date()
          }
        });

        return {
          status: 'success',
          message: 'Document rejected successfully',
          data: updatedDocument
        };
      } else {
        throw new Error('Invalid action provided. Must be "approve" or "reject".');
      }
    });

    return res.status(200).json(transactionResult);

  } catch (error) {
    console.error('Error in acknowledge approval/rejection:', error);
    return res.status(500).json({
      status: 'error',
      message: 'An error occurred during the operation',
      error: error.message
    });
  }
};
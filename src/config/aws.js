const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const uploadToS3 = async (filePath, fileName) => {
  try {
    const fileContent = await fs.readFile(filePath);
    
    const fileExtension = path.extname(fileName);
    const uuid = uuidv4();
    const newFileName = `${uuid}${fileExtension}`;
    
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: newFileName,
      Body: fileContent,
      ACL: 'public-read',
      ContentDisposition: 'inline'
    };

    const command = new PutObjectCommand(uploadParams);
    const data = await s3Client.send(command);
    console.log("S3 Upload Success:", data);

    const s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newFileName}`;
    console.log("Generated S3 URL:", s3Url);
    return s3Url;
  } catch (err) {
    console.error("Error uploading file to S3:", err);
    throw new Error("Failed to upload file to S3");
  }
};

module.exports = { uploadToS3 };
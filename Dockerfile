FROM node:20.14.0-alpine

ENV TZ=Asia/Bangkok
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
# สร้าง working directory
WORKDIR /usr/code

# คัดลอกไฟล์ package.json และ package-lock.json
COPY package.json package-lock.json ./

# คัดลอกไฟล์ credentials.json ไปยัง Docker container
COPY credentials.json ./credentials.json

# ติดตั้ง dependencies
RUN npm install

# คัดลอกไฟล์โปรเจกต์
COPY . .

# รัน Prisma generate
RUN npx prisma generate

# กำหนด Environment Variables
ENV GOOGLE_DRIVE_FOLDER_ID=1Utrvf_dOzoNdVtvjlE_JfVvtuNfiNsJK
ENV SERVER_PORT=8000

# รันแอปพลิเคชัน Node.js
CMD ["npm", "start"]

# กำหนดพอร์ต
EXPOSE 8000

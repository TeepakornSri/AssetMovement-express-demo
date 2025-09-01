const express = require("express");
const authController = require("../controllers/auth-controller");
const authenticateMiddleware = require("../middlewares/authenticate");
const rounter = express.Router();

rounter.post("/login", authController.login);
rounter.get("/me", authenticateMiddleware, authController.getMe);
rounter.post("/adduser", authenticateMiddleware, authController.adduser);
rounter.get("/users", authenticateMiddleware, authController.getAllUser);
rounter.get("/user/:userid", authenticateMiddleware, authController.getUser);
rounter.patch("/user/:userid", authenticateMiddleware, authController.updateUser);

module.exports = rounter;

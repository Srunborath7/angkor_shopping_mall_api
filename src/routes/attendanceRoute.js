const express = require("express");
const router = express.Router();
const attendanceController = require("../controllers/attendanceController");

// Attendance Routes
router.get("/kpi", attendanceController.getAttendanceKPIs);
router.get("/", attendanceController.getAllAttendance);

router.post("/check-in", attendanceController.checkIn);
router.put("/check-out/:id", attendanceController.checkOut);
router.post("/break", attendanceController.toggleBreak);
router.post("/manual", attendanceController.createManualRecord);

router.put("/:id", attendanceController.updateRecord);
router.delete("/:id", attendanceController.deleteRecord);

module.exports = router;

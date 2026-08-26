const express = require("express");
const router = express.Router();
const attendanceController = require("../controllers/attendanceController");

// Attendance KPIs & Records
router.get("/kpi", attendanceController.getAttendanceKPIs);
router.get("/leave-requests", attendanceController.getLeaveRequests);
router.post("/leave-requests", attendanceController.createLeaveRequest);
router.put("/leave-requests/:id", attendanceController.updateLeaveRequest);
router.delete("/leave-requests/:id", attendanceController.deleteLeaveRequest);

router.get("/", attendanceController.getAllAttendance);

// Attendance Actions
router.post("/check-in", attendanceController.checkIn);
router.post("/check-out", attendanceController.checkOut);
router.put("/check-out/:id", attendanceController.checkOut);
router.post("/break", attendanceController.toggleBreak);
router.post("/manual", attendanceController.createManualRecord);

// Direct CRUD by ID
router.put("/:id", attendanceController.updateRecord);
router.delete("/:id", attendanceController.deleteRecord);

module.exports = router;

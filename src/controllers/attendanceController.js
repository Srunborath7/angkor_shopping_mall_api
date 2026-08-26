let AttendanceModel;
try {
  AttendanceModel = require("../models/Attendance");
} catch (e) {
  // Graceful fallback if model not loaded
}

// In-Memory Database store fallback for immediate reliability
let memoryAttendanceStore = [];

// Helper: Calculate late status
const calculateLateStatus = (checkInTimeStr, shiftStart = "08:00", graceMinutes = 15) => {
  if (!checkInTimeStr) return { status: "On Time", lateMinutes: 0 };
  const [shiftH, shiftM] = shiftStart.split(":").map(Number);
  const [inH, inM] = checkInTimeStr.split(":").map(Number);

  const shiftTotalMin = shiftH * 60 + shiftM;
  const inTotalMin = inH * 60 + inM;

  if (inTotalMin > shiftTotalMin + graceMinutes) {
    return {
      status: "Late",
      lateMinutes: inTotalMin - shiftTotalMin
    };
  }
  return { status: "On Time", lateMinutes: 0 };
};

// Helper: Calculate worked hours and overtime
const calculateHours = (inTime, outTime, breakMin = 0) => {
  if (!inTime || !outTime) return { totalHours: 0, overtimeHours: 0, status: "On Shift" };

  const [inH, inM, inS = 0] = inTime.split(":").map(Number);
  const [outH, outM, outS = 0] = outTime.split(":").map(Number);

  let inSec = inH * 3600 + inM * 60 + inS;
  let outSec = outH * 3600 + outM * 60 + outS;

  let diffSec = outSec - inSec;
  if (diffSec < 0) diffSec += 24 * 3600;

  const effectiveSec = Math.max(0, diffSec - (breakMin * 60));
  const totalHours = Number((effectiveSec / 3600).toFixed(2));
  const overtimeHours = totalHours > 8.0 ? Number((totalHours - 8.0).toFixed(2)) : 0;

  return {
    totalHours,
    overtimeHours,
    status: "Completed"
  };
};

/**
 * 1. Check In Staff with GPS Tracking
 * POST /api/attendance/check-in
 */
exports.checkIn = async (req, res) => {
  try {
    const {
      employeeId,
      employeeName,
      khmerName,
      department,
      role,
      avatar,
      shiftId = "shift_morning",
      shiftName = "Morning Shift (08:00 - 17:00)",
      method = "GPS Mobile / Web",
      location,
      notes,
      customTime,
      customDate
    } = req.body;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: "employeeId is required" });
    }

    const now = new Date();
    const todayStr = customDate || now.toISOString().split("T")[0];
    const timeStr = customTime || now.toTimeString().split(" ")[0];

    const { status: checkInStatus, lateMinutes } = calculateLateStatus(timeStr, "08:00", 15);

    const newRecord = {
      id: "ATT-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      employeeId,
      employeeName: employeeName || "Staff Member",
      khmerName: khmerName || "",
      department: department || "General",
      role: role || "Staff",
      avatar: avatar || null,
      date: todayStr,
      shiftId,
      shiftName,
      checkInTime: timeStr,
      checkInStatus,
      lateMinutes,
      checkInMethod: method,
      checkInLocation: location || null,
      checkOutTime: null,
      checkOutStatus: "On Shift",
      earlyMinutes: 0,
      checkOutMethod: null,
      checkOutLocation: null,
      breakStatus: "None",
      breakStart: null,
      breakEnd: null,
      totalBreakMinutes: 0,
      totalWorkHours: 0,
      overtimeHours: 0,
      status: checkInStatus === "Late" ? "Late" : "Present",
      notes: notes || `Clocked in via ${method}`
    };

    if (AttendanceModel && AttendanceModel.create) {
      try {
        await AttendanceModel.create(newRecord);
      } catch (dbErr) {
        memoryAttendanceStore.unshift(newRecord);
      }
    } else {
      memoryAttendanceStore.unshift(newRecord);
    }

    return res.status(201).json({
      success: true,
      message: "Staff checked in successfully",
      data: newRecord
    });
  } catch (error) {
    console.error("Check-in error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 2. Check Out Staff with GPS Tracking
 * PUT /api/attendance/check-out/:id
 */
exports.checkOut = async (req, res) => {
  try {
    const { id } = req.params;
    const { method = "GPS Mobile / Web", location, notes, customTime } = req.body;

    const now = new Date();
    const timeStr = customTime || now.toTimeString().split(" ")[0];

    let record = memoryAttendanceStore.find((r) => r.id === id || r.employeeId === id);

    if (AttendanceModel && AttendanceModel.findByPk) {
      try {
        const dbRec = await AttendanceModel.findByPk(id);
        if (dbRec) record = dbRec.toJSON ? dbRec.toJSON() : dbRec;
      } catch (e) {}
    }

    if (!record) {
      return res.status(404).json({ success: false, message: "Attendance record not found" });
    }

    const { totalHours, overtimeHours, status: checkOutStatus } = calculateHours(
      record.checkInTime,
      timeStr,
      record.totalBreakMinutes || 0
    );

    const updatedData = {
      ...record,
      checkOutTime: timeStr,
      checkOutStatus,
      checkOutMethod: method,
      checkOutLocation: location || null,
      totalWorkHours: totalHours,
      overtimeHours,
      status: "Checked Out",
      notes: notes ? `${record.notes || ""} | ${notes}` : record.notes
    };

    if (AttendanceModel && AttendanceModel.update) {
      try {
        await AttendanceModel.update(updatedData, { where: { id } });
      } catch (e) {}
    }

    const memIdx = memoryAttendanceStore.findIndex((r) => r.id === id);
    if (memIdx !== -1) memoryAttendanceStore[memIdx] = updatedData;

    return res.status(200).json({
      success: true,
      message: "Staff checked out successfully",
      data: updatedData
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 3. Toggle Break
 * POST /api/attendance/break
 */
exports.toggleBreak = async (req, res) => {
  try {
    const { employeeId, notes } = req.body;
    const todayStr = new Date().toISOString().split("T")[0];
    const timeStr = new Date().toTimeString().split(" ")[0];

    const idx = memoryAttendanceStore.findIndex(
      (r) => r.employeeId === employeeId && r.date === todayStr && !r.checkOutTime
    );

    if (idx === -1) {
      return res.status(400).json({ success: false, message: "No active check-in record found for today" });
    }

    const record = memoryAttendanceStore[idx];
    let updated;

    if (record.breakStatus === "On Break") {
      updated = {
        ...record,
        breakStatus: "Finished Break",
        breakEnd: timeStr,
        totalBreakMinutes: (record.totalBreakMinutes || 0) + 45,
        status: record.checkInStatus === "Late" ? "Late" : "Present"
      };
    } else {
      updated = {
        ...record,
        breakStatus: "On Break",
        breakStart: timeStr,
        status: "On Break"
      };
    }

    memoryAttendanceStore[idx] = updated;

    return res.status(200).json({
      success: true,
      message: "Break status toggled",
      data: updated
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 4. Get Attendance Records with Filters
 * GET /api/attendance
 */
exports.getAllAttendance = async (req, res) => {
  try {
    const { search, date, department, status } = req.query;

    let results = [...memoryAttendanceStore];

    if (AttendanceModel && AttendanceModel.findAll) {
      try {
        const dbList = await AttendanceModel.findAll({ order: [["createdAt", "DESC"]] });
        if (dbList && dbList.length > 0) {
          results = dbList.map((item) => (item.toJSON ? item.toJSON() : item));
        }
      } catch (e) {}
    }

    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (r) =>
          r.employeeName?.toLowerCase().includes(q) ||
          r.employeeId?.toLowerCase().includes(q) ||
          r.department?.toLowerCase().includes(q) ||
          r.role?.toLowerCase().includes(q)
      );
    }

    if (date) {
      results = results.filter((r) => r.date === date);
    }

    if (department && department !== "all") {
      results = results.filter((r) => r.department?.toLowerCase() === department.toLowerCase());
    }

    if (status && status !== "all") {
      if (status === "present") results = results.filter((r) => ["Present", "On Shift"].includes(r.status));
      else if (status === "late") results = results.filter((r) => r.checkInStatus === "Late");
      else if (status === "break") results = results.filter((r) => r.breakStatus === "On Break");
      else if (status === "checked_out") results = results.filter((r) => r.status === "Checked Out");
    }

    return res.status(200).json({
      success: true,
      count: results.length,
      data: results
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 5. Get Attendance KPIs
 * GET /api/attendance/kpi
 */
exports.getAttendanceKPIs = async (req, res) => {
  try {
    let totalStaff = 0;
    try {
      const UserModel = require("../models/User");
      if (UserModel && UserModel.count) {
        totalStaff = await UserModel.count();
      }
    } catch (e) {}

    if (!totalStaff || totalStaff === 0) {
      totalStaff = 8;
    }

    const presentCount = dayRecords.filter((r) => ["Present", "On Shift", "On Break", "Late", "Checked Out"].includes(r.status)).length;
    const onTimeCount = dayRecords.filter((r) => r.checkInStatus === "On Time").length;
    const lateCount = dayRecords.filter((r) => r.checkInStatus === "Late").length;
    const onBreakCount = dayRecords.filter((r) => r.breakStatus === "On Break").length;
    const checkedOutCount = dayRecords.filter((r) => r.status === "Checked Out").length;

    const totalHoursWorked = dayRecords.reduce((acc, r) => acc + (Number(r.totalWorkHours) || 0), 0);
    const totalOvertimeHours = dayRecords.reduce((acc, r) => acc + (Number(r.overtimeHours) || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        totalStaff,
        presentCount,
        onTimeCount,
        lateCount,
        onBreakCount,
        checkedOutCount,
        absentCount: Math.max(0, totalStaff - presentCount),
        attendanceRate: Math.round((presentCount / totalStaff) * 100),
        totalHoursWorked: Number(totalHoursWorked.toFixed(1)),
        totalOvertimeHours: Number(totalOvertimeHours.toFixed(1))
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 6. Create Manual Record
 * POST /api/attendance/manual
 */
exports.createManualRecord = async (req, res) => {
  try {
    const newRecord = {
      id: "ATT-" + Date.now(),
      ...req.body,
      checkInMethod: "Admin Manual"
    };
    memoryAttendanceStore.unshift(newRecord);
    return res.status(201).json({ success: true, data: newRecord });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 7. Update Record
 * PUT /api/attendance/:id
 */
exports.updateRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const idx = memoryAttendanceStore.findIndex((r) => r.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }
    memoryAttendanceStore[idx] = { ...memoryAttendanceStore[idx], ...req.body };
    return res.status(200).json({ success: true, data: memoryAttendanceStore[idx] });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 8. Delete Record
 * DELETE /api/attendance/:id
 */
exports.deleteRecord = async (req, res) => {
  try {
    const { id } = req.params;
    memoryAttendanceStore = memoryAttendanceStore.filter((r) => r.id !== id);
    return res.status(200).json({ success: true, message: "Attendance record deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

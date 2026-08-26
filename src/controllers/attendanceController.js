let AttendanceModel;
try {
  AttendanceModel = require("../models/Attendance");
} catch (e) {
  // Graceful fallback if model not loaded
}

let UserModel;
try {
  UserModel = require("../models/userModel");
} catch (e) {
  try {
    UserModel = require("../models/User");
  } catch (err) {}
}

// In-Memory Database fallback store for high availability
let memoryAttendanceStore = [];
let memoryLeaveStore = [
  {
    id: "LV-2026-001",
    employeeId: "EMP-102",
    employeeName: "Vireak Bun",
    khmerName: "ប៊ុន វិរៈ",
    department: "Cashier",
    role: "Lead Cashier",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
    leaveType: "Sick Leave",
    leaveTypeKh: "ច្បាប់ឈឺ",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    daysCount: 1,
    reason: "High fever and medical checkup required",
    contactNumber: "+855 12 888 999",
    status: "Pending",
    appliedAt: new Date().toISOString(),
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null
  }
];

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
 * POST /api/attendance/check-in or POST /api/attendance
 */
exports.checkIn = async (req, res) => {
  try {
    const {
      employeeId,
      employee_id,
      user_id,
      employeeName,
      employee_name,
      khmerName,
      khmer_name,
      department,
      role,
      avatar,
      shiftId = "shift_morning",
      shift_id,
      shiftName = "Morning Shift (08:00 - 17:00)",
      shift_name,
      method = "GPS Mobile / Web",
      check_in_method,
      checkInMethod,
      location,
      checkInLocation,
      latitude,
      longitude,
      location_address,
      is_within_geofence,
      distance_meters,
      notes,
      customTime,
      check_in_time,
      checkInTime,
      customDate,
      date
    } = req.body;

    const finalEmpId = String(employeeId || employee_id || user_id || "");
    if (!finalEmpId) {
      return res.status(400).json({ success: false, message: "employeeId is required" });
    }

    const now = new Date();
    const todayStr = customDate || date || now.toISOString().split("T")[0];
    const timeStr = customTime || checkInTime || check_in_time || now.toTimeString().split(" ")[0];

    const finalMethod = method || checkInMethod || check_in_method || "GPS Mobile / Web";
    const finalShiftId = shiftId || shift_id || "shift_morning";
    const finalShiftName = shiftName || shift_name || (finalShiftId === "shift_evening" ? "Evening Shift (13:00 - 22:00)" : "Morning Shift (08:00 - 17:00)");

    const locationObj = location || checkInLocation || {
      latitude: latitude ? Number(latitude) : 11.5564,
      longitude: longitude ? Number(longitude) : 104.9282,
      address: location_address || "Angkor Mall Main Terminal",
      isWithinGeofence: is_within_geofence !== undefined ? Boolean(is_within_geofence) : true,
      distanceMeters: distance_meters ? Number(distance_meters) : 0
    };

    const { status: checkInStatus, lateMinutes } = calculateLateStatus(timeStr, "08:00", 15);

    const newRecord = {
      id: "ATT-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      employeeId: finalEmpId,
      employeeName: employeeName || employee_name || "Staff Member",
      khmerName: khmerName || khmer_name || "",
      department: department || "Store Operations",
      role: role || "Staff",
      avatar: avatar || null,
      date: todayStr,
      shiftId: finalShiftId,
      shiftName: finalShiftName,
      checkInTime: timeStr,
      checkInStatus,
      lateMinutes,
      checkInMethod: finalMethod,
      checkInLocation: locationObj,
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
      notes: notes || `Clocked in via ${finalMethod}`
    };

    // Save to Database if Model available
    if (AttendanceModel && AttendanceModel.create) {
      try {
        await AttendanceModel.create(newRecord);
      } catch (dbErr) {
        console.warn("DB checkIn fallback:", dbErr.message);
      }
    }

    // Always update memory store
    const existingIdx = memoryAttendanceStore.findIndex(r => r.employeeId === finalEmpId && r.date === todayStr);
    if (existingIdx >= 0) {
      memoryAttendanceStore[existingIdx] = newRecord;
    } else {
      memoryAttendanceStore.unshift(newRecord);
    }

    return res.status(201).json({
      success: true,
      message: "Staff checked in successfully",
      data: newRecord,
      record: newRecord
    });
  } catch (error) {
    console.error("Check-in error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 2. Check Out Staff with GPS Tracking
 * PUT /api/attendance/check-out/:id or POST /api/attendance/check-out
 */
exports.checkOut = async (req, res) => {
  try {
    const id = req.params.id || req.body.id || req.body.employeeId || req.body.employee_id;
    const { method = "GPS Mobile / Web", location, notes, customTime, checkOutTime, check_out_time } = req.body;

    const now = new Date();
    const timeStr = customTime || checkOutTime || check_out_time || now.toTimeString().split(" ")[0];
    const todayStr = now.toISOString().split("T")[0];

    let record = null;

    if (AttendanceModel && AttendanceModel.findByPk) {
      try {
        const dbRec = await AttendanceModel.findByPk(id);
        if (dbRec) record = dbRec.toJSON ? dbRec.toJSON() : dbRec;
      } catch (e) {}
    }

    if (!record && AttendanceModel && AttendanceModel.findOne) {
      try {
        const dbRec = await AttendanceModel.findOne({
          where: { employeeId: id, date: todayStr }
        });
        if (dbRec) record = dbRec.toJSON ? dbRec.toJSON() : dbRec;
      } catch (e) {}
    }

    if (!record) {
      record = memoryAttendanceStore.find(
        (r) => r.id === id || (String(r.employeeId) === String(id) && r.date === todayStr && !r.checkOutTime)
      );
    }

    if (!record) {
      record = memoryAttendanceStore.find((r) => r.id === id || String(r.employeeId) === String(id));
    }

    if (!record) {
      return res.status(404).json({ success: false, message: "Attendance record not found for check-out" });
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
      checkOutLocation: location || record.checkInLocation || null,
      totalWorkHours: totalHours,
      overtimeHours,
      status: "Checked Out",
      notes: notes ? `${record.notes || ""} | ${notes}` : record.notes
    };

    if (AttendanceModel && AttendanceModel.update) {
      try {
        await AttendanceModel.update(updatedData, { where: { id: record.id } });
      } catch (e) {}
    }

    const memIdx = memoryAttendanceStore.findIndex((r) => r.id === record.id);
    if (memIdx !== -1) {
      memoryAttendanceStore[memIdx] = updatedData;
    } else {
      memoryAttendanceStore.unshift(updatedData);
    }

    return res.status(200).json({
      success: true,
      message: "Staff checked out successfully",
      data: updatedData,
      record: updatedData
    });
  } catch (error) {
    console.error("Check-out error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 3. Toggle Break
 * POST /api/attendance/break
 */
exports.toggleBreak = async (req, res) => {
  try {
    const { employeeId, employee_id, notes } = req.body;
    const empId = String(employeeId || employee_id || "");
    const todayStr = new Date().toISOString().split("T")[0];
    const timeStr = new Date().toTimeString().split(" ")[0];

    let idx = memoryAttendanceStore.findIndex(
      (r) => String(r.employeeId) === empId && r.date === todayStr && !r.checkOutTime
    );

    let record = idx !== -1 ? memoryAttendanceStore[idx] : null;

    if (!record && AttendanceModel && AttendanceModel.findOne) {
      try {
        const dbRec = await AttendanceModel.findOne({
          where: { employeeId: empId, date: todayStr }
        });
        if (dbRec) {
          record = dbRec.toJSON ? dbRec.toJSON() : dbRec;
        }
      } catch (e) {}
    }

    if (!record) {
      return res.status(400).json({ success: false, message: "No active check-in record found for today" });
    }

    let updated;
    if (record.breakStatus === "On Break") {
      updated = {
        ...record,
        breakStatus: "Finished Break",
        breakEnd: timeStr,
        totalBreakMinutes: (record.totalBreakMinutes || 0) + 45,
        status: record.checkInStatus === "Late" ? "Late" : "Present",
        notes: notes ? `${record.notes || ""} | ${notes}` : record.notes
      };
    } else {
      updated = {
        ...record,
        breakStatus: "On Break",
        breakStart: timeStr,
        status: "On Break",
        notes: notes ? `${record.notes || ""} | ${notes}` : record.notes
      };
    }

    if (AttendanceModel && AttendanceModel.update) {
      try {
        await AttendanceModel.update(updated, { where: { id: record.id } });
      } catch (e) {}
    }

    if (idx !== -1) {
      memoryAttendanceStore[idx] = updated;
    } else {
      memoryAttendanceStore.unshift(updated);
    }

    return res.status(200).json({
      success: true,
      message: "Break status toggled",
      data: updated,
      record: updated
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
    const { search, date, startDate, endDate, department, status, shiftId } = req.query;

    let results = [...memoryAttendanceStore];

    if (AttendanceModel && AttendanceModel.findAll) {
      try {
        const dbList = await AttendanceModel.findAll({ order: [["createdAt", "DESC"]] });
        if (dbList && dbList.length > 0) {
          const dbRecords = dbList.map((item) => (item.toJSON ? item.toJSON() : item));
          
          // Merge db and memory ensuring no duplicates
          const seenIds = new Set();
          const merged = [];
          for (const item of [...memoryAttendanceStore, ...dbRecords]) {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              merged.push(item);
            }
          }
          results = merged;
        }
      } catch (e) {}
    }

    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      results = results.filter(
        (r) =>
          r.employeeName?.toLowerCase().includes(q) ||
          r.khmerName?.toLowerCase().includes(q) ||
          String(r.employeeId)?.toLowerCase().includes(q) ||
          r.department?.toLowerCase().includes(q) ||
          r.role?.toLowerCase().includes(q)
      );
    }

    if (date) {
      results = results.filter((r) => r.date === date);
    }

    if (startDate) {
      results = results.filter((r) => r.date >= startDate);
    }

    if (endDate) {
      results = results.filter((r) => r.date <= endDate);
    }

    if (department && department !== "all") {
      results = results.filter((r) => r.department?.toLowerCase() === department.toLowerCase());
    }

    if (shiftId && shiftId !== "all") {
      results = results.filter((r) => r.shiftId === shiftId);
    }

    if (status && status !== "all") {
      if (status === "present") results = results.filter((r) => ["Present", "On Shift", "Late"].includes(r.status));
      else if (status === "late") results = results.filter((r) => r.checkInStatus === "Late");
      else if (status === "break") results = results.filter((r) => r.breakStatus === "On Break" || r.status === "On Break");
      else if (status === "checked_out") results = results.filter((r) => r.status === "Checked Out" || !!r.checkOutTime);
      else if (status === "leave") results = results.filter((r) => r.status === "On Leave");
    }

    // Sort order: Active Present first, then latest by date and checkInTime
    results.sort((a, b) => {
      const aIsActive = (a.status === "Present" || a.status === "On Shift" || a.breakStatus === "On Break") && !a.checkOutTime;
      const bIsActive = (b.status === "Present" || b.status === "On Shift" || b.breakStatus === "On Break") && !b.checkOutTime;
      if (aIsActive && !bIsActive) return -1;
      if (!aIsActive && bIsActive) return 1;
      return (b.date || "").localeCompare(a.date || "") || (b.checkInTime || "").localeCompare(a.checkInTime || "");
    });

    return res.status(200).json({
      success: true,
      count: results.length,
      data: results
    });
  } catch (error) {
    console.error("getAllAttendance error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 5. Get Attendance KPIs
 * GET /api/attendance/kpi
 */
exports.getAttendanceKPIs = async (req, res) => {
  try {
    const targetDate = req.query.date || new Date().toISOString().split("T")[0];

    let totalStaff = 0;
    try {
      if (UserModel && UserModel.count) {
        totalStaff = await UserModel.count();
      }
    } catch (e) {}

    if (!totalStaff || totalStaff === 0) {
      totalStaff = 8;
    }

    let allRecs = [...memoryAttendanceStore];
    if (AttendanceModel && AttendanceModel.findAll) {
      try {
        const dbList = await AttendanceModel.findAll();
        if (dbList && dbList.length > 0) {
          const dbRecords = dbList.map((item) => (item.toJSON ? item.toJSON() : item));
          const seen = new Set();
          allRecs = [...memoryAttendanceStore, ...dbRecords].filter(r => {
            if (seen.has(r.id)) return false;
            seen.add(r.id);
            return true;
          });
        }
      } catch (e) {}
    }

    const dayRecords = allRecs.filter((r) => r.date === targetDate);

    const presentCount = dayRecords.filter((r) => ["Present", "On Shift", "On Break", "Late", "Checked Out"].includes(r.status)).length;
    const onTimeCount = dayRecords.filter((r) => r.checkInStatus === "On Time").length;
    const lateCount = dayRecords.filter((r) => r.checkInStatus === "Late").length;
    const onBreakCount = dayRecords.filter((r) => r.breakStatus === "On Break" || r.status === "On Break").length;
    const checkedOutCount = dayRecords.filter((r) => r.status === "Checked Out" || !!r.checkOutTime).length;
    const onLeaveCount = memoryLeaveStore.filter((l) => l.status === "Approved" && l.startDate <= targetDate && l.endDate >= targetDate).length;

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
        onLeaveCount,
        absentCount: Math.max(0, totalStaff - presentCount - onLeaveCount),
        attendanceRate: totalStaff > 0 ? Math.round(((presentCount + onLeaveCount) / totalStaff) * 100) : 0,
        totalHoursWorked: Number(totalHoursWorked.toFixed(1)),
        totalOvertimeHours: Number(totalOvertimeHours.toFixed(1))
      }
    });
  } catch (error) {
    console.error("KPI error:", error);
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

    if (AttendanceModel && AttendanceModel.create) {
      try {
        await AttendanceModel.create(newRecord);
      } catch (e) {}
    }

    memoryAttendanceStore.unshift(newRecord);
    return res.status(201).json({ success: true, data: newRecord, record: newRecord });
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
    let record = memoryAttendanceStore.find((r) => r.id === id);

    if (AttendanceModel && AttendanceModel.findByPk) {
      try {
        const dbRec = await AttendanceModel.findByPk(id);
        if (dbRec) record = dbRec.toJSON ? dbRec.toJSON() : dbRec;
      } catch (e) {}
    }

    if (!record) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }

    const updated = { ...record, ...req.body };

    if (AttendanceModel && AttendanceModel.update) {
      try {
        await AttendanceModel.update(updated, { where: { id } });
      } catch (e) {}
    }

    const idx = memoryAttendanceStore.findIndex((r) => r.id === id);
    if (idx !== -1) {
      memoryAttendanceStore[idx] = updated;
    } else {
      memoryAttendanceStore.unshift(updated);
    }

    return res.status(200).json({ success: true, data: updated, record: updated });
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
    if (AttendanceModel && AttendanceModel.destroy) {
      try {
        await AttendanceModel.destroy({ where: { id } });
      } catch (e) {}
    }

    memoryAttendanceStore = memoryAttendanceStore.filter((r) => r.id !== id);
    return res.status(200).json({ success: true, message: "Attendance record deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 9. Leave Requests (Ask Permission)
 * GET /api/attendance/leave-requests
 */
exports.getLeaveRequests = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      count: memoryLeaveStore.length,
      data: memoryLeaveStore
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/attendance/leave-requests
 */
exports.createLeaveRequest = async (req, res) => {
  try {
    const newLeave = {
      id: "LV-" + Date.now(),
      status: "Pending",
      appliedAt: new Date().toISOString(),
      ...req.body
    };
    memoryLeaveStore.unshift(newLeave);
    return res.status(201).json({
      success: true,
      message: "Leave request submitted",
      data: newLeave,
      leaveRequest: newLeave
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /api/attendance/leave-requests/:id
 */
exports.updateLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const idx = memoryLeaveStore.findIndex((l) => l.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: "Leave request not found" });
    }

    memoryLeaveStore[idx] = { ...memoryLeaveStore[idx], ...req.body };
    return res.status(200).json({
      success: true,
      message: "Leave request updated",
      data: memoryLeaveStore[idx],
      leaveRequest: memoryLeaveStore[idx]
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/attendance/leave-requests/:id
 */
exports.deleteLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    memoryLeaveStore = memoryLeaveStore.filter((l) => l.id !== id);
    return res.status(200).json({ success: true, message: "Leave request deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

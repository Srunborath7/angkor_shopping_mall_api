const { DataTypes } = require("sequelize");
const sequelize = require("../config/db"); // or database connection

const Attendance = sequelize.define(
  "Attendance",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    employeeId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    employeeName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    khmerName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    department: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false
    },
    avatar: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    date: {
      type: DataTypes.STRING(10), // YYYY-MM-DD
      allowNull: false
    },
    shiftId: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "shift_morning"
    },
    shiftName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    checkInTime: {
      type: DataTypes.STRING(10), // HH:MM:SS
      allowNull: false
    },
    checkInStatus: {
      type: DataTypes.STRING(20), // "On Time", "Late"
      defaultValue: "On Time"
    },
    lateMinutes: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    checkInMethod: {
      type: DataTypes.STRING(50), // "GPS Mobile / Web", "QR Badge", "PIN Code", "Admin Manual"
      defaultValue: "GPS Mobile / Web"
    },
    checkInLocation: {
      type: DataTypes.JSON, // { latitude, longitude, accuracy, address, isWithinGeofence, distanceMeters }
      allowNull: true
    },
    checkOutTime: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    checkOutStatus: {
      type: DataTypes.STRING(30), // "On Shift", "Completed", "Early Departure"
      defaultValue: "On Shift"
    },
    earlyMinutes: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    checkOutMethod: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    checkOutLocation: {
      type: DataTypes.JSON,
      allowNull: true
    },
    breakStatus: {
      type: DataTypes.STRING(30), // "None", "On Break", "Finished Break"
      defaultValue: "None"
    },
    breakStart: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    breakEnd: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    totalBreakMinutes: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    totalWorkHours: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00
    },
    overtimeHours: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00
    },
    status: {
      type: DataTypes.STRING(30), // "Present", "Late", "On Break", "Checked Out", "Absent", "On Leave"
      defaultValue: "Present"
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    tableName: "attendances",
    timestamps: true
  }
);

module.exports = Attendance;

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const LeaveRequest = sequelize.define(
  "LeaveRequest",
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
      allowNull: false,
      defaultValue: "Store Operations"
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Staff Member"
    },
    avatar: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    leaveType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Annual Leave"
    },
    leaveTypeKh: {
      type: DataTypes.STRING,
      allowNull: true
    },
    startDate: {
      type: DataTypes.STRING(10),
      allowNull: false
    },
    endDate: {
      type: DataTypes.STRING(10),
      allowNull: false
    },
    durationDays: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    contactNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(20), // "Pending", "Approved", "Rejected"
      defaultValue: "Pending"
    },
    requestDate: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    reviewedBy: {
      type: DataTypes.STRING,
      allowNull: true
    },
    reviewNotes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    reviewDate: {
      type: DataTypes.STRING(10),
      allowNull: true
    }
  },
  {
    tableName: "leave_requests",
    timestamps: true
  }
);

module.exports = LeaveRequest;

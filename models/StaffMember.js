const mongoose = require("mongoose");

const staffMemberSchema = new mongoose.Schema(
	{
		business: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Business",
			required: true,
			index: true,
		},
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
		name: {
			type: String,
			required: true,
			trim: true,
		},
		email: {
			type: String,
			required: true,
			lowercase: true,
			trim: true,
		},
		phone: {
			type: String,
			trim: true,
		},
		role: {
			type: String,
			trim: true,
		},
		bio: {
			type: String,
			trim: true,
			maxlength: 500,
		},
		avatar: {
			type: String,
			trim: true,
		},
		services: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "Service",
			},
		],
		isActive: {
			type: Boolean,
			default: true,
		},
		// Google Calendar Integration fields (same pattern as User model)
		googleCalendarAccessToken: {
			type: String,
		},
		googleCalendarRefreshToken: {
			type: String,
		},
		googleCalendarTokenExpiry: {
			type: Date,
		},
		googleCalendarEmail: {
			type: String,
		},
		googleCalendarIntegrationStatus: {
			type: String,
			enum: ["not_connected", "pending", "connected"],
			default: "not_connected",
		},
		// Shareable OAuth link token
		calendarLinkToken: {
			type: String,
			unique: true,
			sparse: true,
		},
		calendarLinkExpiresAt: {
			type: Date,
		},
	},
	{
		timestamps: true,
	},
);

// Compound index for unique staff per business
staffMemberSchema.index({ business: 1, email: 1 }, { unique: true });

// Method to check if calendar link is valid
staffMemberSchema.methods.isCalendarLinkValid = function () {
	return (
		this.calendarLinkToken &&
		this.calendarLinkExpiresAt &&
		this.calendarLinkExpiresAt > new Date()
	);
};

// Method to invalidate calendar link
staffMemberSchema.methods.invalidateCalendarLink = function () {
	this.calendarLinkToken = null;
	this.calendarLinkExpiresAt = null;
};

module.exports = mongoose.model("StaffMember", staffMemberSchema);

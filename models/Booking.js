const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
		conversationId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Conversation",
			required: true,
			index: true,
		},
		senderId: {
			type: String,
			required: true,
			index: true,
		},
		platform: {
			type: String,
			enum: ["instagram", "whatsapp"],
			required: true,
		},
		eventId: {
			type: String,
			required: true,
			unique: true,
		},
		summary: {
			type: String,
			required: true,
		},
		description: {
			type: String,
		},
		start: {
			dateTime: {
				type: String,
				required: true,
			},
			timeZone: {
				type: String,
				default: "UTC",
			},
		},
		end: {
			dateTime: {
				type: String,
				required: true,
			},
			timeZone: {
				type: String,
				default: "UTC",
			},
		},
		attendees: [
			{
				email: String,
				displayName: String,
				responseStatus: {
					type: String,
					enum: ["needsAction", "declined", "tentative", "accepted"],
					default: "needsAction",
				},
			},
		],
		// Staff and Service references (optional for backward compatibility)
		staffMember: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "StaffMember",
			index: true,
		},
		service: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Service",
			index: true,
		},
		// Custom fields collected during booking (for BookingConfig feature)
		customFields: {
			type: Map,
			of: String,
		},
		status: {
			type: String,
			enum: ["active", "cancelled"],
			default: "active",
		},
		cancelledAt: {
			type: Date,
		},
	},
	{
		timestamps: true,
	},
);

// Compound indexes for efficient queries
bookingSchema.index({ userId: 1, senderId: 1 });
bookingSchema.index({ conversationId: 1, status: 1 });

// Method to cancel booking
bookingSchema.methods.cancel = function () {
	this.status = "cancelled";
	this.cancelledAt = new Date();
	return this.save();
};

// Static method to find active bookings for a conversation
bookingSchema.statics.findActiveByConversation = function (conversationId) {
	return this.find({
		conversationId,
		status: "active",
	}).sort({ createdAt: -1 });
};

// Static method to find bookings by sender
bookingSchema.statics.findBySender = function (senderId, userId) {
	return this.find({
		senderId,
		userId,
		status: "active",
	}).sort({ createdAt: -1 });
};

module.exports = mongoose.model("Booking", bookingSchema);

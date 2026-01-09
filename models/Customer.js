const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
	{
		senderId: {
			type: String,
			required: true,
			index: true,
			description: "Instagram user ID (platform-specific sender ID)",
		},
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			description: "Business owner this customer belongs to",
		},
		platform: {
			type: String,
			enum: ["instagram", "whatsapp"],
			default: "instagram",
		},

		// Profile information
		instagramUsername: {
			type: String,
			description: "Instagram handle",
		},
		displayName: {
			type: String,
			description:
				"Customer's display name (collected from conversation or Instagram profile)",
		},
		email: {
			type: String,
			description: "Email address (collected during booking)",
		},
		phone: {
			type: String,
			description: "Phone number (collected during booking)",
		},

		// Preferences and likings
		likings: {
			type: [String],
			default: [],
			description:
				"Customer preferences and favorite services (e.g., ['gel nails', 'evening appointments', 'pedicure'])",
		},

		// Booking statistics
		lastBookingType: {
			type: String,
			description: "Last service/appointment type booked",
		},
		totalBookings: {
			type: Number,
			default: 0,
			description: "Total number of successful bookings",
		},
		totalCancellations: {
			type: Number,
			default: 0,
			description: "Total number of cancelled bookings",
		},

		// Activity tracking
		firstContactAt: {
			type: Date,
			description: "When customer first messaged",
		},
		lastContactAt: {
			type: Date,
			description: "Last message timestamp",
		},

		// Collected information from conversations
		collectedInfo: {
			name: {
				type: String,
				description: "Name collected from booking or conversation",
			},
			email: {
				type: String,
				description: "Email collected from booking",
			},
			phone: {
				type: String,
				description: "Phone collected from booking",
			},
			preferences: {
				type: mongoose.Schema.Types.Mixed,
				description: "Additional preferences collected during conversations",
			},
		},
	},
	{
		timestamps: true,
	}
);

// Compound unique index for per-business customer lookup
customerSchema.index({ senderId: 1, userId: 1 }, { unique: true });

// Static method to find or create customer
customerSchema.statics.findOrCreateCustomer = async function (
	senderId,
	userId,
	platform = "instagram"
) {
	let customer = await this.findOne({ senderId, userId });

	if (!customer) {
		customer = await this.create({
			senderId,
			userId,
			platform,
			firstContactAt: new Date(),
			lastContactAt: new Date(),
		});
	}

	return customer;
};

// Static method to update customer preferences
customerSchema.statics.updatePreferences = async function (
	senderId,
	userId,
	likings
) {
	return await this.findOneAndUpdate(
		{ senderId, userId },
		{
			$addToSet: { likings: { $each: likings } },
			$set: { lastContactAt: new Date() },
		},
		{ new: true, upsert: true }
	);
};

// Instance method to get booking summary
customerSchema.methods.getBookingSummary = function () {
	return {
		totalBookings: this.totalBookings,
		totalCancellations: this.totalCancellations,
		lastBookingType: this.lastBookingType,
		likings: this.likings,
	};
};

const Customer = mongoose.model("Customer", customerSchema);

module.exports = Customer;

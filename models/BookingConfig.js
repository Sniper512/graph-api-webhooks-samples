const mongoose = require("mongoose");

const bookingConfigFieldSchema = new mongoose.Schema(
	{
		fieldName: {
			type: String,
			required: true,
		},
		fieldType: {
			type: String,
			enum: ["text", "email", "phone", "number", "select"],
			default: "text",
		},
		isRequired: {
			type: Boolean,
			default: false,
		},
		description: {
			type: String,
			default: "",
		},
		options: [
			{
				type: String,
			},
		],
	},
	{ _id: false },
);

const bookingConfigSchema = new mongoose.Schema(
	{
		business: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Business",
			required: true,
			unique: true,
		},
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		rawInstructions: {
			type: String,
			default: "",
		},
		generatedPrompt: {
			type: String,
			default: "",
		},
		requiredFields: [bookingConfigFieldSchema],
		settings: {
			bufferTime: {
				type: Number,
				default: 0,
				min: 0,
				max: 120,
			},
			advanceBookingDays: {
				type: Number,
				default: 30,
				min: 1,
				max: 365,
			},
			maxAdvanceBookingDays: {
				type: Number,
				default: 30,
				min: 1,
				max: 365,
			},
			sameDayBooking: {
				type: Boolean,
				default: true,
			},
			allowSameDayBooking: {
				type: Boolean,
				default: true,
			},
			bookingNotifications: {
				type: Boolean,
				default: true,
			},
			confirmationEmailEnabled: {
				type: Boolean,
				default: true,
			},
			cancellationPolicy: {
				type: String,
				default: "",
			},
		},
		promptLastGeneratedAt: {
			type: Date,
			default: null,
		},
	},
	{
		timestamps: true,
	},
);

// Index for faster lookups
bookingConfigSchema.index({ business: 1 });
bookingConfigSchema.index({ user: 1 });

const BookingConfig = mongoose.model("BookingConfig", bookingConfigSchema);

module.exports = BookingConfig;

const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const StaffMember = require("../models/StaffMember");
const Service = require("../models/Service");
const Business = require("../models/Business");
const TimeSlot = require("../models/TimeSlot");
const Booking = require("../models/Booking");
const { v4: uuidv4 } = require("uuid");

// Helper function to validate email
function validateEmail(email) {
	const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return re.test(email);
}

// GET /api/staff - Get all staff members for the user's business
router.get("/", auth, async (req, res) => {
	try {
		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const staffMembers = await StaffMember.find({ business: business._id })
			.populate("services", "name duration price")
			.sort({ name: 1 });

		res.json({ staffMembers });
	} catch (error) {
		console.error("Error fetching staff members:", error);
		res
			.status(500)
			.json({ message: "Error fetching staff members", error: error.message });
	}
});

// POST /api/staff - Create a new staff member
router.post("/", auth, async (req, res) => {
	try {
		const { name, email, phone, role, bio, services } = req.body;

		// Validation
		if (!name || !name.trim()) {
			return res.status(400).json({ message: "Staff member name is required" });
		}

		if (!email || !validateEmail(email)) {
			return res.status(400).json({ message: "Valid email is required" });
		}

		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		// Check if staff member with this email already exists for this business
		const existingStaff = await StaffMember.findOne({
			business: business._id,
			email: email.toLowerCase(),
		});

		if (existingStaff) {
			return res
				.status(400)
				.json({ message: "Staff member with this email already exists" });
		}

		// Validate services if provided
		if (services && services.length > 0) {
			const validServices = await Service.find({
				_id: { $in: services },
				business: business._id,
				isActive: true,
			});

			if (validServices.length !== services.length) {
				return res
					.status(400)
					.json({ message: "One or more services are invalid" });
			}
		}

		// Create staff member
		const staffMember = new StaffMember({
			business: business._id,
			user: req.user.userId,
			name: name.trim(),
			email: email.toLowerCase().trim(),
			phone: phone?.trim(),
			role: role?.trim(),
			bio: bio?.trim(),
			services: services || [],
		});

		await staffMember.save();

		// Update services to include this staff member
		if (services && services.length > 0) {
			await Service.updateMany(
				{ _id: { $in: services } },
				{ $addToSet: { staffMembers: staffMember._id } },
			);
		}

		const populatedStaff = await StaffMember.findById(staffMember._id).populate(
			"services",
			"name duration price",
		);

		res.status(201).json({
			message: "Staff member created successfully",
			staffMember: populatedStaff,
		});
	} catch (error) {
		console.error("Error creating staff member:", error);
		res
			.status(500)
			.json({ message: "Error creating staff member", error: error.message });
	}
});

// GET /api/staff/:staffId - Get a single staff member
router.get("/:staffId", auth, async (req, res) => {
	try {
		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const staffMember = await StaffMember.findOne({
			_id: req.params.staffId,
			business: business._id,
		}).populate("services", "name description duration price");

		if (!staffMember) {
			return res.status(404).json({ message: "Staff member not found" });
		}

		res.json({ staffMember });
	} catch (error) {
		console.error("Error fetching staff member:", error);
		res
			.status(500)
			.json({ message: "Error fetching staff member", error: error.message });
	}
});

// PUT /api/staff/:staffId - Update a staff member
router.put("/:staffId", auth, async (req, res) => {
	try {
		const { name, email, phone, role, bio, avatar, isActive } = req.body;

		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const staffMember = await StaffMember.findOne({
			_id: req.params.staffId,
			business: business._id,
		});

		if (!staffMember) {
			return res.status(404).json({ message: "Staff member not found" });
		}

		// Update fields
		if (name !== undefined) staffMember.name = name.trim();
		if (email !== undefined) {
			if (!validateEmail(email)) {
				return res.status(400).json({ message: "Valid email is required" });
			}

			// Check for duplicate email
			const existingStaff = await StaffMember.findOne({
				_id: { $ne: staffMember._id },
				business: business._id,
				email: email.toLowerCase(),
			});

			if (existingStaff) {
				return res
					.status(400)
					.json({
						message: "Another staff member with this email already exists",
					});
			}

			staffMember.email = email.toLowerCase().trim();
		}
		if (phone !== undefined) staffMember.phone = phone?.trim();
		if (role !== undefined) staffMember.role = role?.trim();
		if (bio !== undefined) staffMember.bio = bio?.trim();
		if (avatar !== undefined) staffMember.avatar = avatar?.trim();
		if (isActive !== undefined) staffMember.isActive = isActive;

		await staffMember.save();

		const populatedStaff = await StaffMember.findById(staffMember._id).populate(
			"services",
			"name duration price",
		);

		res.json({
			message: "Staff member updated successfully",
			staffMember: populatedStaff,
		});
	} catch (error) {
		console.error("Error updating staff member:", error);
		res
			.status(500)
			.json({ message: "Error updating staff member", error: error.message });
	}
});

// DELETE /api/staff/:staffId - Soft delete (deactivate) a staff member
router.delete("/:staffId", auth, async (req, res) => {
	try {
		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const staffMember = await StaffMember.findOne({
			_id: req.params.staffId,
			business: business._id,
		});

		if (!staffMember) {
			return res.status(404).json({ message: "Staff member not found" });
		}

		staffMember.isActive = false;
		await staffMember.save();

		res.json({ message: "Staff member deactivated successfully" });
	} catch (error) {
		console.error("Error deactivating staff member:", error);
		res
			.status(500)
			.json({
				message: "Error deactivating staff member",
				error: error.message,
			});
	}
});

// POST /api/staff/:staffId/generate-calendar-link - Generate a shareable OAuth link
router.post("/:staffId/generate-calendar-link", auth, async (req, res) => {
	try {
		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const staffMember = await StaffMember.findOne({
			_id: req.params.staffId,
			business: business._id,
		});

		if (!staffMember) {
			return res.status(404).json({ message: "Staff member not found" });
		}

		// Generate a unique token
		const token = uuidv4();
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

		staffMember.calendarLinkToken = token;
		staffMember.calendarLinkExpiresAt = expiresAt;
		await staffMember.save();

		// Construct the OAuth link
		const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
		const oauthLink = `${API_BASE_URL}/api/google-calendar/auth/staff/${token}`;

		res.json({
			message: "Calendar link generated successfully",
			link: oauthLink,
			expiresAt,
		});
	} catch (error) {
		console.error("Error generating calendar link:", error);
		res
			.status(500)
			.json({
				message: "Error generating calendar link",
				error: error.message,
			});
	}
});

// GET /api/staff/:staffId/calendar-status - Check staff member's calendar connection status
router.get("/:staffId/calendar-status", auth, async (req, res) => {
	try {
		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const staffMember = await StaffMember.findOne({
			_id: req.params.staffId,
			business: business._id,
		});

		if (!staffMember) {
			return res.status(404).json({ message: "Staff member not found" });
		}

		res.json({
			isConnected: staffMember.googleCalendarIntegrationStatus === "connected",
			status: staffMember.googleCalendarIntegrationStatus,
			connectedEmail: staffMember.googleCalendarEmail,
		});
	} catch (error) {
		console.error("Error checking calendar status:", error);
		res
			.status(500)
			.json({
				message: "Error checking calendar status",
				error: error.message,
			});
	}
});

// POST /api/staff/:staffId/disconnect-calendar - Disconnect staff member's Google Calendar
router.post("/:staffId/disconnect-calendar", auth, async (req, res) => {
	try {
		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const staffMember = await StaffMember.findOne({
			_id: req.params.staffId,
			business: business._id,
		});

		if (!staffMember) {
			return res.status(404).json({ message: "Staff member not found" });
		}

		// Clear Google Calendar tokens
		staffMember.googleCalendarAccessToken = null;
		staffMember.googleCalendarRefreshToken = null;
		staffMember.googleCalendarTokenExpiry = null;
		staffMember.googleCalendarEmail = null;
		staffMember.googleCalendarIntegrationStatus = "not_connected";

		await staffMember.save();

		res.json({ message: "Google Calendar disconnected successfully" });
	} catch (error) {
		console.error("Error disconnecting calendar:", error);
		res
			.status(500)
			.json({ message: "Error disconnecting calendar", error: error.message });
	}
});

// PUT /api/staff/:staffId/services - Assign services to staff member
router.put("/:staffId/services", auth, async (req, res) => {
	try {
		const { serviceIds } = req.body;

		if (!Array.isArray(serviceIds)) {
			return res.status(400).json({ message: "serviceIds must be an array" });
		}

		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const staffMember = await StaffMember.findOne({
			_id: req.params.staffId,
			business: business._id,
		});

		if (!staffMember) {
			return res.status(404).json({ message: "Staff member not found" });
		}

		// Validate all service IDs
		const validServices = await Service.find({
			_id: { $in: serviceIds },
			business: business._id,
			isActive: true,
		});

		if (validServices.length !== serviceIds.length) {
			return res
				.status(400)
				.json({ message: "One or more services are invalid" });
		}

		// Remove this staff member from all services first
		await Service.updateMany(
			{ business: business._id },
			{ $pull: { staffMembers: staffMember._id } },
		);

		// Add this staff member to the new services
		await Service.updateMany(
			{ _id: { $in: serviceIds } },
			{ $addToSet: { staffMembers: staffMember._id } },
		);

		// Update staff member's services
		staffMember.services = serviceIds;
		await staffMember.save();

		const populatedStaff = await StaffMember.findById(staffMember._id).populate(
			"services",
			"name duration price",
		);

		res.json({
			message: "Services assigned successfully",
			staffMember: populatedStaff,
		});
	} catch (error) {
		console.error("Error assigning services:", error);
		res
			.status(500)
			.json({ message: "Error assigning services", error: error.message });
	}
});

// GET /api/staff/:staffId/bookings - Get bookings for a specific staff member
router.get("/:staffId/bookings", auth, async (req, res) => {
	try {
		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const staffMember = await StaffMember.findOne({
			_id: req.params.staffId,
			business: business._id,
		});

		if (!staffMember) {
			return res.status(404).json({ message: "Staff member not found" });
		}

		const bookings = await Booking.find({
			staffMember: staffMember._id,
			status: "active",
		})
			.populate("service", "name duration")
			.sort({ "start.dateTime": 1 })
			.limit(50);

		res.json({ bookings });
	} catch (error) {
		console.error("Error fetching staff bookings:", error);
		res
			.status(500)
			.json({ message: "Error fetching bookings", error: error.message });
	}
});

// GET /api/staff/:staffId/schedule - Get staff member's weekly schedule
router.get("/:staffId/schedule", auth, async (req, res) => {
	try {
		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const staffMember = await StaffMember.findOne({
			_id: req.params.staffId,
			business: business._id,
		});

		if (!staffMember) {
			return res.status(404).json({ message: "Staff member not found" });
		}

		const timeSlots = await TimeSlot.find({
			business: business._id,
			staffMember: staffMember._id,
			isActive: true,
		}).sort({ dayOfWeek: 1 });

		res.json({ timeSlots });
	} catch (error) {
		console.error("Error fetching staff schedule:", error);
		res
			.status(500)
			.json({ message: "Error fetching schedule", error: error.message });
	}
});

// POST /api/staff/:staffId/schedule/:dayOfWeek - Create/update staff member's day schedule
router.post("/:staffId/schedule/:dayOfWeek", auth, async (req, res) => {
	try {
		const dayOfWeek = parseInt(req.params.dayOfWeek);
		const { slots, settings } = req.body;

		if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
			return res
				.status(400)
				.json({ message: "Invalid day of week. Must be 0-6" });
		}

		if (!slots || !Array.isArray(slots) || slots.length === 0) {
			return res
				.status(400)
				.json({ message: "At least one time slot is required" });
		}

		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const staffMember = await StaffMember.findOne({
			_id: req.params.staffId,
			business: business._id,
		});

		if (!staffMember) {
			return res.status(404).json({ message: "Staff member not found" });
		}

		// Find or create time slot for this day
		let timeSlot = await TimeSlot.findOne({
			business: business._id,
			staffMember: staffMember._id,
			dayOfWeek,
		});

		if (timeSlot) {
			// Update existing
			timeSlot.slots = slots;
			if (settings) {
				timeSlot.settings = { ...timeSlot.settings, ...settings };
			}
		} else {
			// Create new
			timeSlot = new TimeSlot({
				business: business._id,
				staffMember: staffMember._id,
				dayOfWeek,
				slots,
				settings: settings || {},
			});
		}

		await timeSlot.save();

		res.json({
			message: "Schedule saved successfully",
			timeSlot,
		});
	} catch (error) {
		console.error("Error saving staff schedule:", error);
		res
			.status(500)
			.json({ message: "Error saving schedule", error: error.message });
	}
});

// DELETE /api/staff/:staffId/schedule/:dayOfWeek - Delete staff member's day schedule
router.delete("/:staffId/schedule/:dayOfWeek", auth, async (req, res) => {
	try {
		const dayOfWeek = parseInt(req.params.dayOfWeek);

		if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
			return res
				.status(400)
				.json({ message: "Invalid day of week. Must be 0-6" });
		}

		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const staffMember = await StaffMember.findOne({
			_id: req.params.staffId,
			business: business._id,
		});

		if (!staffMember) {
			return res.status(404).json({ message: "Staff member not found" });
		}

		await TimeSlot.deleteOne({
			business: business._id,
			staffMember: staffMember._id,
			dayOfWeek,
		});

		res.json({ message: "Schedule deleted successfully" });
	} catch (error) {
		console.error("Error deleting staff schedule:", error);
		res
			.status(500)
			.json({ message: "Error deleting schedule", error: error.message });
	}
});

module.exports = router;

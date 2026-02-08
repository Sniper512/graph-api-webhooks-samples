const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Service = require("../models/Service");
const StaffMember = require("../models/StaffMember");
const Business = require("../models/Business");
const TimeSlot = require("../models/TimeSlot");

// GET /api/services - Get all services for the user's business
router.get("/", auth, async (req, res) => {
	try {
		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const services = await Service.find({ business: business._id })
			.populate(
				"staffMembers",
				"name email role googleCalendarIntegrationStatus",
			)
			.sort({ name: 1 });

		res.json({ services });
	} catch (error) {
		console.error("Error fetching services:", error);
		res
			.status(500)
			.json({ message: "Error fetching services", error: error.message });
	}
});

// POST /api/services - Create a new service
router.post("/", auth, async (req, res) => {
	try {
		const {
			name,
			description,
			duration,
			price,
			currency,
			category,
			color,
			maxBookingsPerSlot,
			staffMembers,
		} = req.body;

		// Validation
		if (!name || !name.trim()) {
			return res.status(400).json({ message: "Service name is required" });
		}

		if (!duration || duration < 15 || duration > 480) {
			return res
				.status(400)
				.json({ message: "Duration must be between 15 and 480 minutes" });
		}

		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		// Check if service with this name already exists for this business
		const existingService = await Service.findOne({
			business: business._id,
			name: name.trim(),
		});

		if (existingService) {
			return res
				.status(400)
				.json({ message: "Service with this name already exists" });
		}

		// Validate staff members if provided
		if (staffMembers && staffMembers.length > 0) {
			const validStaff = await StaffMember.find({
				_id: { $in: staffMembers },
				business: business._id,
				isActive: true,
			});

			if (validStaff.length !== staffMembers.length) {
				return res
					.status(400)
					.json({ message: "One or more staff members are invalid" });
			}
		}

		// Create service
		const service = new Service({
			business: business._id,
			user: req.user.userId,
			name: name.trim(),
			description: description?.trim(),
			duration: parseInt(duration),
			price: price !== undefined ? parseFloat(price) : undefined,
			currency: currency?.toUpperCase() || "USD",
			category: category?.trim(),
			color: color?.trim(),
			maxBookingsPerSlot:
				maxBookingsPerSlot !== undefined ? parseInt(maxBookingsPerSlot) : 1,
			staffMembers: staffMembers || [],
		});

		await service.save();

		// Update staff members to include this service
		if (staffMembers && staffMembers.length > 0) {
			await StaffMember.updateMany(
				{ _id: { $in: staffMembers } },
				{ $addToSet: { services: service._id } },
			);
		}

		const populatedService = await Service.findById(service._id).populate(
			"staffMembers",
			"name email role googleCalendarIntegrationStatus",
		);

		res.status(201).json({
			message: "Service created successfully",
			service: populatedService,
		});
	} catch (error) {
		console.error("Error creating service:", error);
		res
			.status(500)
			.json({ message: "Error creating service", error: error.message });
	}
});

// GET /api/services/:serviceId - Get a single service
router.get("/:serviceId", auth, async (req, res) => {
	try {
		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const service = await Service.findOne({
			_id: req.params.serviceId,
			business: business._id,
		}).populate(
			"staffMembers",
			"name email role googleCalendarIntegrationStatus",
		);

		if (!service) {
			return res.status(404).json({ message: "Service not found" });
		}

		res.json({ service });
	} catch (error) {
		console.error("Error fetching service:", error);
		res
			.status(500)
			.json({ message: "Error fetching service", error: error.message });
	}
});

// PUT /api/services/:serviceId - Update a service
router.put("/:serviceId", auth, async (req, res) => {
	try {
		const {
			name,
			description,
			duration,
			price,
			currency,
			category,
			color,
			maxBookingsPerSlot,
			isActive,
		} = req.body;

		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const service = await Service.findOne({
			_id: req.params.serviceId,
			business: business._id,
		});

		if (!service) {
			return res.status(404).json({ message: "Service not found" });
		}

		// Update fields
		if (name !== undefined) {
			// Check for duplicate name
			const existingService = await Service.findOne({
				_id: { $ne: service._id },
				business: business._id,
				name: name.trim(),
			});

			if (existingService) {
				return res
					.status(400)
					.json({ message: "Another service with this name already exists" });
			}

			service.name = name.trim();
		}
		if (description !== undefined) service.description = description?.trim();
		if (duration !== undefined) {
			const dur = parseInt(duration);
			if (dur < 15 || dur > 480) {
				return res
					.status(400)
					.json({ message: "Duration must be between 15 and 480 minutes" });
			}
			service.duration = dur;
		}
		if (price !== undefined)
			service.price = price !== null ? parseFloat(price) : undefined;
		if (currency !== undefined)
			service.currency = currency?.toUpperCase() || "USD";
		if (category !== undefined) service.category = category?.trim();
		if (color !== undefined) service.color = color?.trim();
		if (maxBookingsPerSlot !== undefined)
			service.maxBookingsPerSlot = parseInt(maxBookingsPerSlot);
		if (isActive !== undefined) service.isActive = isActive;

		await service.save();

		const populatedService = await Service.findById(service._id).populate(
			"staffMembers",
			"name email role googleCalendarIntegrationStatus",
		);

		res.json({
			message: "Service updated successfully",
			service: populatedService,
		});
	} catch (error) {
		console.error("Error updating service:", error);
		res
			.status(500)
			.json({ message: "Error updating service", error: error.message });
	}
});

// DELETE /api/services/:serviceId - Soft delete (deactivate) a service
router.delete("/:serviceId", auth, async (req, res) => {
	try {
		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const service = await Service.findOne({
			_id: req.params.serviceId,
			business: business._id,
		});

		if (!service) {
			return res.status(404).json({ message: "Service not found" });
		}

		service.isActive = false;
		await service.save();

		res.json({ message: "Service deactivated successfully" });
	} catch (error) {
		console.error("Error deactivating service:", error);
		res
			.status(500)
			.json({ message: "Error deactivating service", error: error.message });
	}
});

// PUT /api/services/:serviceId/staff - Assign staff members to service
router.put("/:serviceId/staff", auth, async (req, res) => {
	try {
		const { staffIds } = req.body;

		if (!Array.isArray(staffIds)) {
			return res.status(400).json({ message: "staffIds must be an array" });
		}

		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const service = await Service.findOne({
			_id: req.params.serviceId,
			business: business._id,
		});

		if (!service) {
			return res.status(404).json({ message: "Service not found" });
		}

		// Validate all staff IDs
		const validStaff = await StaffMember.find({
			_id: { $in: staffIds },
			business: business._id,
			isActive: true,
		});

		if (validStaff.length !== staffIds.length) {
			return res
				.status(400)
				.json({ message: "One or more staff members are invalid" });
		}

		// Remove this service from all staff members first
		await StaffMember.updateMany(
			{ business: business._id },
			{ $pull: { services: service._id } },
		);

		// Add this service to the new staff members
		await StaffMember.updateMany(
			{ _id: { $in: staffIds } },
			{ $addToSet: { services: service._id } },
		);

		// Update service's staff members
		service.staffMembers = staffIds;
		await service.save();

		const populatedService = await Service.findById(service._id).populate(
			"staffMembers",
			"name email role googleCalendarIntegrationStatus",
		);

		res.json({
			message: "Staff assigned successfully",
			service: populatedService,
		});
	} catch (error) {
		console.error("Error assigning staff:", error);
		res
			.status(500)
			.json({ message: "Error assigning staff", error: error.message });
	}
});

// GET /api/services/:serviceId/availability - Get merged availability across all assigned staff
router.get("/:serviceId/availability", auth, async (req, res) => {
	try {
		const { startDate, endDate } = req.query;

		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			return res.status(404).json({ message: "Business not found" });
		}

		const service = await Service.findOne({
			_id: req.params.serviceId,
			business: business._id,
			isActive: true,
		}).populate("staffMembers");

		if (!service) {
			return res.status(404).json({ message: "Service not found" });
		}

		if (!service.staffMembers || service.staffMembers.length === 0) {
			return res.json({
				availability: [],
				message: "No staff members assigned to this service",
			});
		}

		// Get time slots for all assigned staff members
		const staffIds = service.staffMembers
			.filter(
				(staff) =>
					staff.isActive &&
					staff.googleCalendarIntegrationStatus === "connected",
			)
			.map((staff) => staff._id);

		if (staffIds.length === 0) {
			return res.json({
				availability: [],
				message: "No active staff with connected calendars for this service",
			});
		}

		const timeSlots = await TimeSlot.find({
			business: business._id,
			staffMember: { $in: staffIds },
			isActive: true,
		}).populate("staffMember", "name email");

		// Group by day and merge availability
		const availabilityByDay = {};
		timeSlots.forEach((slot) => {
			if (!availabilityByDay[slot.dayOfWeek]) {
				availabilityByDay[slot.dayOfWeek] = [];
			}
			availabilityByDay[slot.dayOfWeek].push({
				staffMember: slot.staffMember,
				slots: slot.slots,
			});
		});

		res.json({
			availability: availabilityByDay,
			staffCount: staffIds.length,
		});
	} catch (error) {
		console.error("Error fetching service availability:", error);
		res
			.status(500)
			.json({ message: "Error fetching availability", error: error.message });
	}
});

module.exports = router;

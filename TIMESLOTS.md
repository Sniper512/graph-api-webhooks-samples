# Time Slot Booking System

Simple CRUD API for managing business time slots and schedules.

## Quick Start

1. **Create business first** (required before using time slots)
2. **Set up time slots** for each day of the week
3. **Check availability** when booking appointments
4. **Manage date overrides** for holidays/special events

## Authentication

All endpoints require Bearer token:
```
Authorization: Bearer <your-jwt-token>
```

## Day Format
- `0` = Sunday, `1` = Monday, `2` = Tuesday, `3` = Wednesday, `4` = Thursday, `5` = Friday, `6` = Saturday

## Time Format
24-hour format: `"09:00"`, `"14:30"`, `"17:45"`

---

## Core CRUD Operations

### Create/Update Day Schedule
**POST** `/api/timeslots/{dayOfWeek}`

```bash
curl -X POST http://localhost:5000/api/timeslots/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "slots": [
      {
        "startTime": "09:00",
        "endTime": "17:00",
        "duration": 60,
        "slotName": "Business Hours",
        "maxBookings": 2
      }
    ],
    "settings": {
      "bufferTime": 15,
      "advanceBookingDays": 30
    }
  }'
```

**Response:**
```json
{
  "message": "Time slots for Monday created successfully.",
  "timeSlot": {
    "id": "64a7b8c9d1e2f34567890123",
    "dayOfWeek": 1,
    "dayName": "Monday",
    "slots": [...],
    "settings": {...}
  }
}
```

### Get Day Schedule
**GET** `/api/timeslots/{dayOfWeek}`

```bash
curl -X GET http://localhost:5000/api/timeslots/1 \
  -H "Authorization: Bearer <token>"
```

### Get All Weekly Schedules
**GET** `/api/timeslots`

```bash
curl -X GET http://localhost:5000/api/timeslots \
  -H "Authorization: Bearer <token>"
```

### Delete Day Schedule
**DELETE** `/api/timeslots/{dayOfWeek}`

```bash
curl -X DELETE http://localhost:5000/api/timeslots/1 \
  -H "Authorization: Bearer <token>"
```

---

## Availability & Scheduling

### Check Specific Availability
**POST** `/api/timeslots/check-availability`

```bash
curl -X POST http://localhost:5000/api/timeslots/check-availability \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "date": "2024-07-15",
    "startTime": "10:00",
    "endTime": "11:00"
  }'
```

**Response:**
```json
{
  "isAvailable": true,
  "date": "2024-07-15",
  "requestedTime": "10:00 - 11:00",
  "matchingDay": "Monday",
  "message": "Time slot is available for booking."
}
```

### Get Date Range Availability
**POST** `/api/timeslots/availability-range`

```bash
curl -X POST http://localhost:5000/api/timeslots/availability-range \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "startDate": "2024-07-15",
    "endDate": "2024-07-21"
  }'
```

---

## Special Situations

### Add Date Override (Holiday/Event)
**POST** `/api/timeslots/date-override`

**Close for holiday:**
```bash
curl -X POST http://localhost:5000/api/timeslots/date-override \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "date": "2024-12-25",
    "isAvailable": false,
    "reason": "Christmas Day - Closed"
  }'
```

**Special hours:**
```bash
curl -X POST http://localhost:5000/api/timeslots/date-override \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "date": "2024-11-24",
    "isAvailable": true,
    "customSlots": [
      {
        "startTime": "08:00",
        "endTime": "12:00",
        "duration": 45,
        "slotName": "Black Friday Special",
        "maxBookings": 2
      }
    ],
    "reason": "Black Friday - Extended Hours"
  }'
```

### Remove Date Override
**DELETE** `/api/timeslots/date-override/{date}`

```bash
curl -X DELETE http://localhost:5000/api/timeslots/date-override/2024-12-25 \
  -H "Authorization: Bearer <token>"
```

---

## Field Definitions

### Time Slot Object
- **startTime** (string): Start time in HH:MM format
- **endTime** (string): End time in HH:MM format  
- **duration** (number): Slot duration in minutes (15-480)
- **slotName** (string): Descriptive name for the slot
- **maxBookings** (number): Max concurrent bookings (1-10, default: 1)
- **isActive** (boolean): Whether slot is active (default: true)

### Settings Object
- **bufferTime** (number): Minutes between bookings (0-60, default: 0)
- **advanceBookingDays** (number): Days in advance users can book (1-365, default: 30)
- **sameDayBooking** (boolean): Allow same-day bookings (default: false)
- **bookingNotifications** (boolean): Send booking notifications (default: true)

### Date Override Object
- **date** (string): Date in YYYY-MM-DD format
- **isAvailable** (boolean): Whether date is available for bookings
- **customSlots** (array): Custom time slots for this specific date
- **reason** (string): Reason for the override

---

## Quick Setup Example

### 1. Create Business
```bash
curl -X POST http://localhost:5000/api/business \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "businessName": "My Law Firm",
    "businessCategory": "consulting",
    "email": "info@lawfirm.com",
    "phoneNumber": "+1-555-0123"
  }'
```

### 2. Set Monday Schedule
```bash
curl -X POST http://localhost:5000/api/timeslots/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "slots": [
      {
        "startTime": "09:00",
        "endTime": "17:00",
        "duration": 60,
        "slotName": "Business Hours",
        "maxBookings": 2
      }
    ],
    "settings": {
      "bufferTime": 15,
      "advanceBookingDays": 14
    }
  }'
```

### 3. Add Holiday Closure
```bash
curl -X POST http://localhost:5000/api/timeslots/date-override \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "date": "2024-12-25",
    "isAvailable": false,
    "reason": "Christmas Day - Office Closed"
  }'
```

---

## Error Responses

**400 Bad Request:**
```json
{
  "message": "Invalid day of week. Must be 0-6"
}
```

**401 Unauthorized:**
```json
{
  "message": "Access denied. No token provided."
}
```

**404 Not Found:**
```json
{
  "message": "Business information not found. Please create business information first."
}
```

---

## Complete API Reference

| Action | Method | Endpoint | Body Required |
|--------|--------|----------|---------------|
| Create/Update day | POST | `/api/timeslots/{day}` | Yes |
| Get day schedule | GET | `/api/timeslots/{day}` | No |
| Get all schedules | GET | `/api/timeslots` | No |
| Delete day schedule | DELETE | `/api/timeslots/{day}` | No |
| Check availability | POST | `/api/timeslots/check-availability` | Yes |
| Add date override | POST | `/api/timeslots/date-override` | Yes |
| Remove override | DELETE | `/api/timeslots/date-override/{date}` | No |
| Check date range | POST | `/api/timeslots/availability-range` | Yes |

All endpoints require authentication and return data scoped to your business.
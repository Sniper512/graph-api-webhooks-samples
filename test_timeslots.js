#!/usr/bin/env node

/**
 * Test script for Time Slot Booking API
 * Run this to test your time slot endpoints
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:5000';
let authToken = '';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}${message}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'password123',
  fullName: 'Test User',
  businessName: 'Test Business',
  termsAccepted: true
};

const testBusiness = {
  businessName: 'Test Business LLC',
  businessCategory: 'consulting',
  email: 'test@business.com',
  phoneNumber: '+1-555-0123',
  website: 'https://testbusiness.com',
  businessDescription: 'A test business for API testing',
  address: '123 Test Street, Test City, TC 12345'
};

const testTimeSlots = {
  slots: [
    {
      startTime: '09:00',
      endTime: '17:00',
      duration: 60,
      slotName: 'Business Hours',
      maxBookings: 2,
      isActive: true
    }
  ],
  settings: {
    bufferTime: 15,
    advanceBookingDays: 30,
    sameDayBooking: false,
    bookingNotifications: true
  }
};

// API helper functions
async function makeRequest(method, endpoint, data = null, expectJson = true) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json'
      },
      validateStatus: () => true // Don't throw on non-2xx status
    };

    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    
    log('yellow', `📡 ${method.toUpperCase()} ${endpoint}`);
    log('yellow', `📊 Status: ${response.status}`);
    
    // Check if response is JSON
    const contentType = response.headers['content-type'] || '';
    const isJson = contentType.includes('application/json');
    
    if (isJson) {
      log('green', `📦 Response: ${JSON.stringify(response.data, null, 2)}`);
    } else {
      log('red', `🚨 Response is NOT JSON! Content-Type: ${contentType}`);
      log('red', `📄 Response Body: ${response.data}`);
    }
    
    return response;
  } catch (error) {
    log('red', `❌ Request failed: ${error.message}`);
    return { status: 500, data: { error: error.message } };
  }
}

// Test functions
async function test1_HealthCheck() {
  logHeader('TEST 1: Health Check');
  await makeRequest('GET', '/');
}

async function test2_Register() {
  logHeader('TEST 2: User Registration');
  const response = await makeRequest('POST', '/api/auth/register', testUser);
  
  if (response.status === 201) {
    log('green', '✅ User registered successfully');
    return true;
  } else {
    log('red', '❌ Registration failed');
    return false;
  }
}

async function test3_Login() {
  logHeader('TEST 3: User Login');
  const response = await makeRequest('POST', '/api/auth/login', {
    email: testUser.email,
    password: testUser.password
  });
  
  if (response.status === 200 && response.data.token) {
    authToken = response.data.token;
    log('green', '✅ Login successful, token obtained');
    return true;
  } else {
    log('red', '❌ Login failed');
    return false;
  }
}

async function test4_CreateBusiness() {
  logHeader('TEST 4: Create Business');
  const response = await makeRequest('POST', '/api/business', testBusiness);
  
  if (response.status === 201) {
    log('green', '✅ Business created successfully');
    return true;
  } else {
    log('red', '❌ Business creation failed');
    return false;
  }
}

async function test5_CreateTimeSlot() {
  logHeader('TEST 5: Create Time Slot (Monday)');
  const response = await makeRequest('POST', '/api/timeslots/1', testTimeSlots);
  
  if (response.status === 201) {
    log('green', '✅ Time slot created successfully');
    return true;
  } else {
    log('red', '❌ Time slot creation failed');
    return false;
  }
}

async function test6_GetTimeSlot() {
  logHeader('TEST 6: Get Time Slot (Monday)');
  const response = await makeRequest('GET', '/api/timeslots/1');
  
  if (response.status === 200) {
    log('green', '✅ Time slot retrieved successfully');
    return true;
  } else {
    log('red', '❌ Time slot retrieval failed');
    return false;
  }
}

async function test7_GetAllTimeSlots() {
  logHeader('TEST 7: Get All Time Slots');
  const response = await makeRequest('GET', '/api/timeslots');
  
  if (response.status === 200) {
    log('green', '✅ All time slots retrieved successfully');
    return true;
  } else {
    log('red', '❌ All time slots retrieval failed');
    return false;
  }
}

async function test8_CheckAvailability() {
  logHeader('TEST 8: Check Availability');
  const response = await makeRequest('POST', '/api/timeslots/check-availability', {
    date: '2024-12-16', // Next Monday
    startTime: '10:00',
    endTime: '11:00'
  });
  
  if (response.status === 200) {
    log('green', '✅ Availability check completed');
    return true;
  } else {
    log('red', '❌ Availability check failed');
    return false;
  }
}

async function test9_DateOverride() {
  logHeader('TEST 9: Add Date Override');
  const response = await makeRequest('POST', '/api/timeslots/date-override', {
    date: '2024-12-25',
    isAvailable: false,
    reason: 'Christmas Day - Closed'
  });
  
  if (response.status === 201 || response.status === 200) {
    log('green', '✅ Date override added successfully');
    return true;
  } else {
    log('red', '❌ Date override failed');
    return false;
  }
}

async function test10_AvailabilityRange() {
  logHeader('TEST 10: Get Availability Range');
  const response = await makeRequest('POST', '/api/timeslots/availability-range', {
    startDate: '2024-12-16',
    endDate: '2024-12-22'
  });
  
  if (response.status === 200) {
    log('green', '✅ Availability range retrieved successfully');
    return true;
  } else {
    log('red', '❌ Availability range failed');
    return false;
  }
}

// Main test runner
async function runTests() {
  logHeader('🧪 TIME SLOT API TEST SUITE');
  log('cyan', 'This will test all time slot endpoints step by step');
  
  const tests = [
    { name: 'Health Check', fn: test1_HealthCheck },
    { name: 'User Registration', fn: test2_Register, required: true },
    { name: 'User Login', fn: test3_Login, required: true },
    { name: 'Create Business', fn: test4_CreateBusiness, required: true },
    { name: 'Create Time Slot', fn: test5_CreateTimeSlot, required: true },
    { name: 'Get Time Slot', fn: test6_GetTimeSlot, required: true },
    { name: 'Get All Time Slots', fn: test7_GetAllTimeSlots, required: true },
    { name: 'Check Availability', fn: test8_CheckAvailability, required: true },
    { name: 'Add Date Override', fn: test9_DateOverride, required: false },
    { name: 'Get Availability Range', fn: test10_AvailabilityRange, required: false }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result !== false) {
        passed++;
      } else {
        failed++;
        if (test.required) {
          log('red', `🚨 Required test "${test.name}" failed! Stopping tests.`);
          break;
        }
      }
    } catch (error) {
      failed++;
      log('red', `🚨 Test "${test.name}" threw an error: ${error.message}`);
    }
  }

  logHeader('📊 TEST RESULTS');
  log('green', `✅ Passed: ${passed}`);
  log('red', `❌ Failed: ${failed}`);
  
  if (failed === 0) {
    log('green', '🎉 All tests passed! Time Slot API is working correctly.');
  } else {
    log('red', '⚠️ Some tests failed. Check the logs above for details.');
    log('yellow', '💡 Common issues:');
    log('yellow', '   - Server not running on port 5000');
    log('yellow', '   - MongoDB not connected');
    log('yellow', '   - Missing environment variables');
    log('yellow', '   - JWT_SECRET not set');
  }
}

// Usage instructions
if (require.main === module) {
  console.log(`
${colors.magenta}
🔧 TIME SLOT API TEST SCRIPT
${colors.reset}

${colors.cyan}Usage:${colors.reset}
  1. Make sure your server is running: npm start
  2. Make sure MongoDB is connected
  3. Run this script: node test_timeslots.js

${colors.cyan}What this tests:${colors.reset}
  - User registration and authentication
  - Business creation
  - All time slot CRUD operations
  - Availability checking
  - Date override functionality

${colors.cyan}Expected flow:${colors.reset}
  Register → Login → Create Business → Test Time Slots
  `);

  runTests().catch(console.error);
}

module.exports = { runTests };
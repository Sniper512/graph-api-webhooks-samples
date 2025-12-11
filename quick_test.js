#!/usr/bin/env node

const axios = require('axios');

async function testTimeslotAPI() {
  const BASE_URL = 'http://localhost:5000';
  
  console.log('🧪 Quick API Test\n');
  
  // Test 1: Check if server is running
  try {
    console.log('1️⃣ Testing server health...');
    const health = await axios.get(`${BASE_URL}/`);
    console.log('✅ Server is running');
  } catch (error) {
    console.log('❌ Server not running. Start it with: npm start');
    return;
  }
  
  // Test 2: Test auth endpoint (should work)
  try {
    console.log('\n2️⃣ Testing auth endpoint...');
    const authResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'test@example.com',
      password: 'password123'
    });
    console.log('✅ Auth endpoint works');
    console.log('Token:', authResponse.data.token ? '✅ Received' : '❌ Missing');
  } catch (error) {
    console.log('⚠️  Auth test skipped (user may not exist)');
  }
  
  // Test 3: Try timeslot endpoint (this will show if routes work)
  try {
    console.log('\n3️⃣ Testing timeslot endpoint...');
    const response = await axios.get(`${BASE_URL}/api/timeslots`, {
      headers: {
        'Authorization': 'Bearer invalid-token-for-test'
      }
    });
    console.log('❌ Unexpected success - should fail with auth error');
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Timeslot endpoint exists and requires auth (401 expected)');
    } else if (error.response?.status === 404) {
      console.log('❌ Timeslot endpoint not found (404)');
    } else {
      console.log('⚠️  Unexpected error:', error.response?.status || error.message);
    }
  }
  
  console.log('\n📋 Summary:');
  console.log('- If server health ✅ and timeslot endpoint ✅: Backend is working');
  console.log('- Frontend issue: Check if you\'re calling the right URLs');
  console.log('- Expected timeslot URL: http://localhost:5000/api/timeslots');
}

testTimeslotAPI().catch(console.error);
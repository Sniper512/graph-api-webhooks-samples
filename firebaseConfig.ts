// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
	apiKey: "AIzaSyDDN9Iie6MzOLtkE3uX9osllf9UsOGby10",
	authDomain: "ai-agent-5057a.firebaseapp.com",
	projectId: "ai-agent-5057a",
	storageBucket: "ai-agent-5057a.firebasestorage.app",
	messagingSenderId: "600915076107",
	appId: "1:600915076107:web:517171619a705eacc1130e",
	measurementId: "G-49JXYN6MSY",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

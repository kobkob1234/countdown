// ============================================
// Firebase Configuration & Initialization
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getDatabase,
    ref,
    set,
    onValue,
    push,
    remove,
    onChildAdded,
    onChildChanged,
    onChildRemoved,
    goOnline,
    goOffline
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

import { AppState } from './state.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB_IflOD8CwVLQQjqtz_ZKWzbfgCiOm2Js",
    authDomain: "countdown-463de.firebaseapp.com",
    databaseURL: "https://countdown-463de-default-rtdb.firebaseio.com",
    projectId: "countdown-463de",
    storageBucket: "countdown-463de.firebasestorage.app",
    messagingSenderId: "1016385864732",
    appId: "1:1016385864732:web:8a82e771e1f4be567a8bd9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// Store in AppState for global access
AppState.db = db;

// Re-export Firebase functions for convenience
export {
    ref,
    set,
    onValue,
    push,
    remove,
    onChildAdded,
    onChildChanged,
    onChildRemoved,
    goOnline,
    goOffline
};

// Helper to get database reference
export function getDbRef(path) {
    return ref(db, path);
}

// Events reference
export const eventsRef = ref(db, 'events');

// Get user-specific references
export function getUserTasksRef(username) {
    return ref(db, `users/${username}/tasks`);
}

export function getUserSubjectsRef(username) {
    return ref(db, `users/${username}/subjects`);
}

export function getUserPushSubscriptionsRef(username, key) {
    return ref(db, `users/${username}/pushSubscriptions/${key}`);
}

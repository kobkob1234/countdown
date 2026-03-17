// ============================================
// User Authentication Module
// ============================================

import { AppState, $ } from './state.js';

// Function to sanitize username (remove special chars)
export const cleanUsername = (name) => {
    return (name || '').trim().toLowerCase().replaceAll(/[^a-z0-9_-]/g, '');
};

// Initialize authentication - returns currentUser string
export function initAuth() {
    let currentUser = localStorage.getItem('countdown_username');

    // Login Process
    if (!currentUser) {
        const input = prompt("👋 Welcome! \nEnter a username to access your private tasks:\n(e.g., 'john123', 'sarah_work')");
        currentUser = cleanUsername(input);

        if (!currentUser) {
            currentUser = 'guest_' + Math.floor(Math.random() * 1000);
            alert("No name entered. You are logged in as: " + currentUser);
        }
        localStorage.setItem('countdown_username', currentUser);
    }

    // Store in AppState
    AppState.currentUser = currentUser;

    // Update UI + switch user handler
    const userBtn = $('userBtn');
    if (userBtn) {
        userBtn.textContent = `👤 ${currentUser}`;

        userBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Use timeout to prevent instant dismissal issues on mobile
            setTimeout(() => {
                const switchUser = confirm(`You are logged in as "${currentUser}".\n\nDo you want to switch users?`);
                if (switchUser) {
                    localStorage.removeItem('countdown_username');
                    location.reload();
                }
            }, 50);
        };
    }

    return currentUser;
}

// Get current user (for use after init)
export function getCurrentUser() {
    return AppState.currentUser;
}

// Logout function
export function logout() {
    localStorage.removeItem('countdown_username');
    location.reload();
}

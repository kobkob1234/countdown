# 🚀 Deployment Guide
## FCM + Serverless Notifications

---

> **✅ This system works 24/7 even when your PC is off.**  
> The notification logic runs on Vercel's cloud servers, triggered automatically by Cron-job.org every minute.

---

## 📋 Prerequisites

Before you begin, you'll need accounts on these services (all free):

| Service | Purpose | Sign Up |
|---------|---------|---------|
| **GitHub** | Code hosting | *(You already have this)* |
| **Vercel** | Runs the notification script | [vercel.com](https://vercel.com) |
| **Cron-job.org** | Triggers Vercel every minute | [cron-job.org](https://cron-job.org) |

---

## 🔑 Step 1: Get Firebase Service Account

Your Vercel server needs credentials to access your Firebase database.

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **countdown-463de**
3. Click **⚙️ Settings** → **Project Settings**
4. Navigate to **Service accounts** tab
5. Click **"Generate new private key"**
6. **Download** the `.json` file

> ⚠️ **Security Warning**  
> This file contains sensitive credentials. Never commit it to Git or share it publicly.

---

## 🔐 Step 2: Generate API Key

Create a secret key to protect your API endpoint:

**Option A - Terminal (Mac/Linux):**
```bash
openssl rand -base64 32
```

**Option B - Online:**
Use any random string generator (32+ characters recommended)

**Example output:**
```
Xk9pQ2mR7vN3jL5wA8sD1fG4hY6tU0iO+bC2xZ9qE3w=
```

📝 **Save this key** — you'll need it in Steps 3 and 4.

---

## ☁️ Step 3: Deploy to Vercel

### 3.1 Push Code to GitHub
```bash
git add .
git commit -m "Add FCM serverless notifications"
git push
```

### 3.2 Import Project
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New..."** → **"Project"**
3. Select your repository: `counter-anti`

### 3.3 Configure Environment Variables

In the deployment settings, add these variables:

| Variable | Value |
|----------|-------|
| `FIREBASE_SERVICE_ACCOUNT` | *Paste the entire JSON content from Step 1* |
| `FIREBASE_DATABASE_URL` | `https://countdown-463de-default-rtdb.firebaseio.com` |
| `APP_URL` | `https://kobkob1234.github.io/countdown/` |
| `CRON_API_KEY` | *Your secret key from Step 2* |

### 3.4 Deploy
Click **Deploy** and wait for completion.

📝 **Note your domain** (e.g., `https://counter-anti.vercel.app`)

---

## ⏰ Step 4: Configure Cron-job.org

This service will "wake up" your Vercel function every minute.

1. Sign in to [Cron-job.org](https://cron-job.org/)
2. Click **"Create Cronjob"**

### Configuration

| Field | Value |
|-------|-------|
| **Title** | `PWA Reminders` |
| **URL** | `https://YOUR-DOMAIN.vercel.app/api/cron?key=YOUR_API_KEY` |
| **Schedule** | Every 1 minute |

> 📌 Replace `YOUR-DOMAIN` with your Vercel domain  
> 📌 Replace `YOUR_API_KEY` with your key from Step 2

3. Click **Create**

---

## ✅ Step 5: Verify Setup

| Check | Expected Result |
|-------|-----------------|
| Cron-job.org History | Shows `200 OK` responses |
| Create a test task | Notification arrives within 1-2 minutes |

### Test Flow:
1. Open your PWA
2. Enable notifications (click the 🔔 button)
3. Create a task with reminder set to "1 minute before"
4. **Close the app completely**
5. Wait for the notification ✨

---

## 🔧 Troubleshooting

### ❌ Cron job returns 401 Unauthorized
- The API key in the URL doesn't match Vercel's `CRON_API_KEY`
- Check for typos or extra spaces

### ❌ Cron job returns 500 Error
- Check Vercel's **Function Logs** for details
- Verify `FIREBASE_SERVICE_ACCOUNT` is valid JSON

### ❌ No notifications on Android
1. Ensure you clicked the 🔔 button in the app
2. Check Android Settings → Apps → Chrome → Notifications → Enabled
3. Disable battery optimization for Chrome

### ❌ Notifications delayed
- Normal delay is up to 60 seconds (cron frequency)
- Check if Android "Doze Mode" is restricting the app

---

## 📊 Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT` | ✅ | JSON credentials from Firebase Console |
| `FIREBASE_DATABASE_URL` | ✅ | Your Realtime Database URL |
| `APP_URL` | ✅ | Your PWA URL (with trailing `/`) |
| `CRON_API_KEY` | ✅ | Secret for API authentication |

---

## 🏗️ Architecture Summary

```
┌─────────────────┐     Every 1 min     ┌─────────────────┐
│  Cron-job.org   │ ──────────────────► │     Vercel      │
│  (Free Trigger) │                     │  (Serverless)   │
└─────────────────┘                     └────────┬────────┘
                                                 │
                                                 │ Reads DB
                                                 │ Sends FCM
                                                 ▼
                                        ┌─────────────────┐
                                        │    Firebase     │
                                        │  (Database +    │
                                        │   Messaging)    │
                                        └────────┬────────┘
                                                 │
                                                 │ Push Notification
                                                 ▼
                                        ┌─────────────────┐
                                        │  Your Phone     │
                                        │  (Android PWA)  │
                                        └─────────────────┘
```

**Key Point:** Your PC is not in this diagram. Everything runs in the cloud! 🎉

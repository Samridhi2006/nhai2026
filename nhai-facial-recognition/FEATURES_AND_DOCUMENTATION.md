# NHAI Workforce Facial Recognition System
**Version**: 3.0 (Enterprise Ready)  
**Target Platform**: Android (Offline First)  
**Core Technologies**: React Native, Expo, TensorFlow Lite, SQLite, AWS Sync

---

## 📌 Executive Summary
This application is a highly secure, privacy-first, 100% offline Facial Recognition and Attendance tracking system built for the National Highways Authority of India (NHAI). It is designed to operate seamlessly in remote construction sites with zero internet connectivity, leveraging on-device AI for identity verification and anti-spoofing.

---

## 🚀 Core Features & Capabilities

### 1. 100% Offline AI Inference
- **Zero Internet Required**: All facial detection, embedding extraction, and matching happen locally on the device using TensorFlow Lite models (`MobileFaceNet` and `BlazeFace`).
- **Privacy Preserving**: Employee face data (photos and embeddings) never leave the local device, ensuring strict compliance with biometric privacy standards.
- **Lightning Fast**: Local C++ bindings ensure inference times of under 300ms.

### 2. Banking-Grade Anti-Spoofing (Liveness Detection)
- **Randomized Geometric Challenges**: To prevent photo and video replay attacks, the system randomizes a head-movement challenge (`LEFT`, `RIGHT`, or `UP`).
- **Mathematical Validation**: Uses 2D projection ratios (Yaw and Pitch) calculated from the `BlazeFace` mesh to mathematically guarantee the user is moving a real 3D head.
- **2-Step Verification Pipeline**:
  1. **Liveness Pass**: Validates the 3D head movement (low-confidence face crop).
  2. **Identity Pass**: Forces the user to look straight ahead to capture a high-confidence, perfectly aligned photo.
- **Bait-and-Switch Cross-Check**: A `0.4` Cosine Similarity cross-check runs between Step 1 and Step 2. If a user completes the liveness challenge but someone else jumps into the frame for the final photo, the system instantly flags it as a `Spoof Detected`.

### 3. Intelligent Shift & Punctuality Engine
- **Automated Timekeeping**: Automatically detects which shift a worker belongs to based on the time they scan their face.
  - Morning (06:00 - 14:00)
  - Afternoon (14:00 - 22:00)
  - Night (22:00 - 06:00)
- **Early-Arrival Logic**: The shift boundaries automatically slide back by 60 minutes to perfectly catch and correctly assign workers who arrive early.
- **Grace Period**: 15-minute grace period before a worker is mathematically flagged as `Late` in the database.

### 4. Advanced Data & Storage Management
- **Local SQLite Database**: Stores all attendance logs natively. Extremely fast, indexed queries.
- **RAM Protection**: The Analytics engines use optimized SQL queries to only load a maximum of 30 days of data into memory, ensuring the app never crashes or freezes, regardless of how large the database gets.
- **Background Auto-Purge (Storage Protection)**: Every time the app boots, it silently wipes attendance logs older than 60 days to save storage space—**but only if** they have successfully been backed up to the AWS server. Unsynced data is never deleted.

### 5. Geofenced Verification
- Integrates with device GPS to calculate the Haversine distance from the designated NHAI construction site.
- Tags all attendance records with `Inside` or `Outside` location statuses.

### 6. Interactive Dashboards & Export Pipelines
- **Site Overview**: Live dashboard showing real-time KPIs (Total Workers, Present Today, On-Time Rate) and a 7-Day heatmap.
- **Workforce Analytics**: Detailed local intelligence including:
  - Daily Shift Punctuality Split (On-Time vs Late bar charts).
  - Shift Distribution bars (Morning, Afternoon, Night allocations).
  - Historical Aggregate Trends (7d, 14d, 30d views).
- **Searchable Attendance Sheet**: A dedicated UI to view all raw logs, instantly searchable by Employee Name or ID.
- **CSV Export**: One-tap export of the entire database into a cleanly formatted `.csv` file, perfectly separated by newline (`\n`) characters for immediate use in Microsoft Excel or Google Sheets.
- **AWS Cloud Sync**: 1-tap bulk sync to upload pending logs to the AWS Master Server when internet becomes available.

---

## ⚙️ Technical Working Flow

### Registration Flow
1. Admin enters Employee Details (Name, ID, Designation).
2. Camera captures the face.
3. `BlazeFace` detects the bounding box and crops exactly 112x112 pixels.
4. `MobileFaceNet` converts the cropped image into a 192-dimensional floating-point array (Embedding).
5. The Embedding and metadata are saved to SQLite.

### Attendance Flow
1. User taps "Take Attendance".
2. System rolls a random direction (`LEFT`, `RIGHT`, `UP`) and challenges the user.
3. The camera feed loops at 30 FPS. `BlazeFace` calculates the Yaw/Pitch of the nose relative to the eyes and ears.
4. If the user successfully holds the pose for 8 frames, Step 1 passes. A temporary, low-accuracy embedding is stored in RAM.
5. User is prompted to look straight.
6. A high-quality photo is captured. `MobileFaceNet` extracts the final embedding.
7. **Cross-Check**: The final embedding is compared against the temporary embedding (must be > 0.4 similarity) to prevent bait-and-switch.
8. **Matching**: The final embedding is compared against the entire SQLite database using Cosine Similarity. If the score beats the `STRICT` threshold, identity is confirmed.
9. System reads the clock, evaluates Shift Punctuality, reads the GPS, and saves the `Present` or `Late` log to SQLite.

---
*Built for scale. Designed for offline reliability. Protected by advanced biometric mathematics.*

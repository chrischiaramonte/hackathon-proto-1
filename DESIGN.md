# Master Design Document

## 1. Project Overview

Duolingo-inspired web application for learning American Sign Language (ASL) through interactive, camera-based lessons.

Users are required to physically perform signs using their webcam. A pretrained machine learning model analyzes each attempt and determines whether the target sign was recognized.

The application combines AI-powered sign recognition with simple lessons and progression.

## 2. Problem Statement & Target Users

Family and friends of Deaf people want to sign with the people they love, but in-person classes are not always available, learners get no feedback on their signing, and there is no form of gamification or motivation to continue learning over time. We’re building a gamified ASL app, shaped by Deaf educators, that gets them to real, everyday communication faster.

## 3. Product Vision & Goals

Our vision is to help people get familiar with American Sign Language through interactive, real-time webcam feedback, transforming passive video-watching into active muscle memory and genuine communication.

## 4. Core User Flows

1. Open the application
2. View the learning dashboard
3. Select introductory lesson
4. Review a demonstration of the target sign
5. Perform the sign in front of camera
6. Application determines if its correct (incorrect after an amount of time)
7. Continue to next question (incorrect gets rotated to the end)
8. Receive XP and a completion screen

## 5. MVP Scope & Non-Goals

**Must-have**

- Responsive web application.
- Instructional demonstration for each supported sign.
- Live webcam preview.
- MediaPipe landmark extraction.
- Pretrained ASL recognition model integration.
- Acceptance/retry feedback.
- XP and lesson progression.
- Persistent local progress.

**Should-have**

- Animated success states.
- Hearts or attempt indicators.
- Progress bars.
- Lesson-completion celebrations.
- Review of previously learned vocabulary.

**Not in MVP**

- Continuous ASL sentence recognition.
- Real-time ASL-to-English translation.
- Detailed grading of individual handshape or facial-grammar errors.
- Multiplayer functionality.
- Social leaderboards.
- User authentication.
- Payments or subscriptions.
- Training a new large recognition model.

## 6. Features & Functional Requirements

1. Must be able to cycle through a set of ASL vocabulary
2. Must be able to determine whether user input is correct or incorrect
3. Lesson will conclude once all vocabulary words are correctly signed, and continues as long as inputs are incorrect
4. User must be able to track progress

## 7. UI/UX Design & Design System

[https://styles.refero.design/style/ca4708f7-7175-4da2-a47f-ce8f5e601f99](https://styles.refero.design/style/ca4708f7-7175-4da2-a47f-ce8f5e601f99)

## 8. Tech Stack & System Architecture

Frontend: React + TypeScript

Landmark extraction: @mediapipe/holistic legacy package

Build tool: Vite

Backend: Python + FastAPI

Recognition: [https://huggingface.co/sign/kaggle-asl-signs-1st-place/tree/main](https://huggingface.co/sign/kaggle-asl-signs-1st-place/tree/main)

Frontend

- Handles camera access and live preview
- Manages lesson screens and user interactions
- Sends captured landmark sequences to the backend
- Receives recognition decisions
- Manages local game progression

Backend

- Loads the pretrained recognition model.
- Validates landmark data.
- Applies model-specific preprocessing.
- Runs model inference.
- Evaluates recognition acceptance rules.
- Returns a structured result.

Storage

- Static JSON files for lesson content.
- localStorage for XP, completed lessons, and current progress.
- No user database needed for MVP.

**Data Flow**

1. User is prompted with a sign.
2. Browser starts webcam tracking.
3. MediaPipe extracts landmarks.
4. Application buffers one attempted sign.
5. Frontend sends buffered landmarks to FastAPI.
6. Backend transforms the sequence into the model's expected input.
7. TFLite model produces classification scores.
8. Backend evaluates whether the target was recognized.
9. Frontend renders feedback and updates game state.

## 9. AI/ML Model & Inference Pipeline

[https://huggingface.co/sign/kaggle-asl-signs-1st-place/tree/main](https://huggingface.co/sign/kaggle-asl-signs-1st-place/tree/main)

**Capabilities**

- Recognition across a vocabulary of 250 isolated signs.
- TensorFlow Lite model format.
- Classification based on sequences of MediaPipe landmarks.

## 11. API Contracts & Component Interfaces

## 12. Error Handling & Edge Cases

- Making sure user allows camera input
- Proper camera lighting, background, angle
- Having multiple people in frame

## 13. Testing & Acceptance Criteria

- Complete lesson if all vocabulary words in lesson set are correctly signed
- Continue lesson with remaining incorrect words until they are correctly signed

### 1. Camera and input conditions

| **Test**                                          | **Expected**                                            |
| ------------------------------------------------- | ------------------------------------------------------- |
| Camera permission denied                          | App explains what’s lost and offers no-camera practice  |
| No camera hardware                                | Same as above, with no crash                            |
| Dim room, backlit window, glare                   | Pre-check warns with specific advice; no scored attempt |
| Cluttered background; clothing matching skin tone | Tracking degrades gracefully, with a prompt to adjust   |
| Hands partly out of frame                         | “Move back” prompt, not marked wrong                    |
| Two people in frame                               | Intended signer chosen or user asked to pick            |
| Phone propped at an odd angle or held in one hand | Detects poor framing or still works within limits       |
| Switching cameras or orientation mid-lesson       | State preserved, no restart                             |

### 2. Signer variation

- Left-handed signer produces a mirrored correct sign, which should be accepted.
- Different skin tones, hand sizes, ages and lighting.

### 3. Recognition and feedback

- ok Clearly correct sign gets a pass.
- Clearly wrong sign gets a fail with specific feedback (handshape, location or movement).
- A sign that’s close but wrong in one component gets feedback naming that component.
- Random or nonsense hand movement doesn’t pass.
- Rapid fingerspelling and repeated letters (e.g., double letters).
- Visually similar signs and letters are distinguished.
- User disputes a result: the flag is saved and doesn’t change their score unfairly.
- Same attempt submitted twice gives consistent results.

### 4. Failure handling

- Network drops mid-attempt: falls back to on-device or non-scored mode with no lost progress.
- Model timeout or server error: friendly message and retry, not a crash.
- App killed or backgrounded mid-lesson: resumes where the user left off.
- Low storage or failed video download: clear message and a lower-quality or offline fallback.
- Slow connection: video buffers or degrades, and lessons stay usable.

### 5. Learning and gamification

- Streak: missed day, freeze used, timezone change, travel across timezones, device clock changed.
- Streak doesn’t punish an illness or a caregiving gap beyond the stated rules.
- Placement test: skipping ahead, getting everything wrong, getting everything right.
- Repeated mistakes lead to review and hints rather than getting stuck.
- Users can’t farm points by repeating the easiest lesson.
- Progress syncs across two devices without conflicts.
- Account deletion removes progress and data.

### 6. Content quality

- Every lesson video loads, plays and matches its label.
- Captions match the sign shown.
- Deaf reviewer sign-off recorded before content goes live.
- Corrected content republishes without breaking users mid-lesson.
- Speed controls and replay work on all clips.
- Natural-speed clips (not just slow citation-form) are included for comprehension practice.

### 7. Accessibility of the app

- All instructions are visual or text, with no audio-only cues.
- Screen reader navigation through lessons and quizzes.
- Large text and high contrast don’t break layouts.
- Reduced-motion setting disables celebratory animations.
- No flashing content that could trigger seizures.
- Works one-handed and with switch or voice control where the OS supports it.

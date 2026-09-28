# Learnify

## Overview
Learnify is an intelligent tutoring system designed to provide AI-powered, personalized, and interactive homework assistance. It enables teachers to assign topics, and an AI tutor guides students through adaptive questioning and support, focusing on an engaging and accessible learning experience, particularly through interactive voice capabilities. The project aims to deliver a demo-ready application for client presentations, showcasing its innovative AI tutoring workflow and market potential.

## User Preferences
- CEO requested demo-ready application for client presentation
- Focus on showing AI tutoring workflow
- Mock notification system (real mobile push notifications in next phase)
- Emphasis on interactive, friendly AI that assesses before teaching
- Voice interaction for accessibility and engagement

## System Architecture

### UI/UX Decisions
- **Color Scheme**: Educational blue with warm accents.
- **Typography**: Inter for UI, JetBrains Mono for technical content.
- **Components**: Shadcn UI with custom educational styling.
- **Theme**: Light mode optimized, dark mode ready.
- **Animations**: Pulsing effects for voice interaction.
- **PWA Support**: Full Progressive Web App capabilities for mobile installation.
- **Branding**: Modern logo, gradient styling, and increased text sizes for enhanced visual identity.

### Technical Implementations
- **Frontend**: React, TypeScript, Wouter (routing), TanStack Query.
- **Backend**: Express, TypeScript.
- **Database**: PostgreSQL (Neon) with Drizzle ORM.
- **Authentication**: Session-based auth with role-based access control (teacher/student), protected routes, AuthContext.
- **Progress Tracking**: Automatic session tracking including time spent, message count, completion status, and analytics dashboard.
- **Teacher Analytics**: Aggregate metrics, struggling student identification, detailed student roster.
- **Real-Time Updates**: Mechanisms for automatic updates of assignments and notifications.
- **Notification System**: Browser push notifications with real-time detection of new homework.
- **Continuous Voice Conversation**: Hands-free interaction with auto-start listening, auto-resume, visual feedback, and structured flow.
- **Type Safety**: Full TypeScript typing throughout, shared schemas between frontend/backend.
- **PWA Enhancements**: Mobile-optimized CSS, updated manifest.json, service worker caching.

### Feature Specifications
- **Teacher Interface**: Create assignments with topic, grade, subject, AI behavior instructions, and scheduled notifications. View detailed analytics per assignment.
- **Student Interface**: View homework, engage with AI tutor via text or continuous voice, receive personalized guidance. Progress is automatically tracked.
- **AI Examiner Behavior**: Structured greeting, assessment-focused approach, single clear questions, progressive difficulty, brief feedback, professional tone, and automatic speech output.
- **Voice-Only Chat**: Student interaction exclusively via voice, with an automatic text backup of the conversation.

### System Design Choices
- **Persistent Data**: PostgreSQL database for data persistence.
- **Adaptive Learning**: GPT-4.1 integration for personalized learning.
- **Accessible Learning**: Emphasis on voice interaction.
- **API Route Organization**: Express routes ordered by specificity.
- **Data Integrity**: Progress data preservation during updates, preventing accidental overwrites.
- **AI Tutor Behavior Enhancement**: Empathetic responses, knowledge snippets, and explicit summary keywords for completion detection.
- **Voice UX Optimization**: Reduced speech rate and increased pause tolerance for natural interaction.
- **Subject/School Compartmentalization**: Schema extensions for `subject` and `school` fields for users and assignments to enable secure data separation and filtering.
- **Security**: Authentication and authorization applied to all chat and progress API routes to prevent data leakage and ensure assignment ownership verification.
- **Voice Conversation Architecture**: Consolidated voice flow where useVoiceConversation hook owns all speech playback (greeting, AI responses). student-chat.tsx delegates to hook functions, preventing duplicate speaking and ensuring single source of truth.

## External Dependencies
- **PostgreSQL (Neon)**: Database for persistent storage.
- **OpenAI GPT-4.1**: AI model for intelligent tutoring via Replit AI Integrations.
- **Web Speech API**: Browser-built-in API for speech recognition and speech synthesis.
- **Google Gemini 2.5 Flash**: Used for speech-to-text transcription.

## Recent Changes (November 11, 2025)

### Fixed AI Conversation Flow
- **Issue**: AI was repeating the greeting question instead of progressing through stages
- **Root Cause**: Chat messages weren't properly associated with individual students using `userId`, causing conversation history to mix between students
- **Solution**: Added `userId` field to all chat message storage calls (both text and voice endpoints) to ensure each student has their own isolated conversation thread
- **Impact**: AI now correctly tracks conversation progress per student and moves through the stages (greeting → readiness → knowledge assessment → analytical questions → summary)

### Enhanced Complete Button Functionality
- **Issue**: Complete button wasn't becoming clickable after AI provided summary
- **Solution**: Added automatic detection of summary indicators in AI responses (both text and voice endpoints) to set `status='summary_provided'` in student progress
- **Impact**: Complete button becomes enabled once AI delivers the final summary, allowing students to mark assignment as complete and notify their teacher

### Added Conversation History on Welcome Screen
- **New Feature**: Students can now see a text backup of their conversation directly on the welcome screen
- **Implementation**: Created `ConversationHistory` component in student-home.tsx that displays the last 3 messages from each assignment
- **UI**: Shows preview in a scrollable area with message count indicator
- **Impact**: Students can review their previous conversations before resuming, improving learning continuity
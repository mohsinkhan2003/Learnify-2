import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAssignmentSchema, insertChatMessageSchema, insertPushSubscriptionSchema, insertStudentProgressSchema, validStatuses, type Assignment, type ChatMessage } from "@shared/schema";
import OpenAI from "openai";
import webpush from "web-push";
import authRoutes from "./auth-routes";
import { validateSession } from "./auth";
import multer from "multer";
import { Readable } from "stream";

// OpenAI client for both chat completions and audio transcription
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// Configure VAPID details for web push
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY?.trim();
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim();

if (!vapidPublicKey || !vapidPrivateKey) {
  console.warn('[Push] VAPID keys not found - push notifications will be disabled');
  console.warn('[Push] Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Secrets to enable');
} else {
  try {
    webpush.setVapidDetails(
      'mailto:support@learnify.app',
      vapidPublicKey,
      vapidPrivateKey
    );
    console.log('[Push] VAPID configuration successful');
  } catch (error: any) {
    console.warn('[Push] Failed to configure VAPID - push notifications disabled:', error.message);
  }
}

// Configure multer for file uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// Helper function to get user from token
async function getUserFromToken(token: string) {
  return await validateSession(token);
}

export async function registerRoutes(app: Express): Promise<Server> {

  // Health check endpoint
  app.get("/api/health", async (_req, res) => {
    try {
      // Test database connection
      await storage.getAssignments();
      res.json({
        status: "ok",
        database: "connected",
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(503).json({
        status: "error",
        database: "disconnected",
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Register authentication routes
  app.use("/api/auth", authRoutes);

  // Serve service worker file with correct MIME type
  app.get("/service-worker.js", async (_req, res) => {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const swPath = path.resolve(import.meta.dirname, "..", "client", "public", "service-worker.js");
      const swContent = await fs.readFile(swPath, "utf-8");
      res.set("Content-Type", "application/javascript");
      res.send(swContent);
    } catch (error) {
      console.error("[Service Worker] Failed to serve service worker:", error);
      res.status(404).send("Service worker not found");
    }
  });

  // Get assignments based on user role
  app.get("/api/assignments", async (req, res) => {
    try {
      // Check if user is authenticated
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        console.log('[Assignments] No auth token provided, returning 401');
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.split(' ')[1];
      const user = await getUserFromToken(token);

      if (!user) {
        console.log('[Assignments] Invalid token, returning 401');
        return res.status(401).json({ error: 'Invalid session' });
      }

      // Disable caching to ensure real-time updates for notifications
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      const allAssignments = await storage.getAssignments();

      // Filter assignments based on user role, subject, and school
      // BACKWARD COMPATIBLE: Falls back to teacherId-only filtering for legacy assignments
      let filteredAssignments: Assignment[];
      console.log(`[Assignments] User role: ${user.role}, School: ${user.school || 'None'}, Subject: ${user.subject || 'N/A'}`);

      if (user.role === 'teacher') {
        // Teachers see assignments they created
        // BACKWARD COMPATIBLE: Show all teacher's assignments, preferring subject/school filtering when available
        filteredAssignments = allAssignments.filter(a => {
          // Must be their assignment
          if (a.teacherId !== user.id) return false;

          // If assignment has teacherSchool/subject populated, apply compartmentalization
          // Otherwise show it anyway (backward compatibility)
          if (a.teacherSchool && user.school && a.teacherSchool !== user.school) return false;
          if (a.subject && user.subject && a.subject !== user.subject) return false;

          return true;
        });
        console.log(`[Assignments] Teacher ${user.name} - ${user.subject} @ ${user.school} - returning ${filteredAssignments.length} of ${allAssignments.length} assignments`);
      } else if (user.role === 'student') {
        // Students see all assignments from their school
        // Note: Assignments are shared resources - multiple students can work on the same assignment
        // Each student's progress is tracked separately in the studentProgress table
        // BACKWARD COMPATIBLE: Show all available assignments if no school info, otherwise filter by school
        filteredAssignments = allAssignments
          .filter(a => {
            // If both student and assignment have school info, they must match
            // Otherwise show it anyway (backward compatibility)
            if (a.teacherSchool && user.school && a.teacherSchool !== user.school) return false;

            return true;
          })
          .slice(0, 20);
        console.log(`[Assignments] Student ${user.name} @ ${user.school} - returning ${filteredAssignments.length} assignments`);
      } else {
        // Unknown role - return empty array
        filteredAssignments = [];
        console.log(`[Assignments] Unknown role ${user.role} for user ${user.id} - returning empty array`);
      }

      res.json(filteredAssignments);
    } catch (error) {
      console.error('[Assignments] Error fetching assignments:', error);
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });


  // Get single assignment
  app.get("/api/assignments/:id", async (req, res) => {
    try {
      const assignment = await storage.getAssignment(req.params.id);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      res.json(assignment);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assignment" });
    }
  });

  // Update assignment (for assigning students)
  app.patch("/api/assignments/:id", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

      if (!token) {
        return res.status(401).json({ error: "Unauthorized - No token provided" });
      }

      const user = await validateSession(token);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized - Invalid session" });
      }

      const { id } = req.params;
      const { studentId } = req.body;

      if (!studentId) {
        return res.status(400).json({ error: "studentId is required" });
      }

      // Get assignment
      const assignment = await storage.getAssignment(id);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      // Only allow assigning if unassigned or if student is assigning to themselves
      if (assignment.studentId && assignment.studentId !== studentId) {
        return res.status(403).json({ error: "Assignment already assigned to another student" });
      }

      // Update assignment
      await storage.assignStudentToAssignment(id, studentId);

      const updatedAssignment = await storage.getAssignment(id);
      res.json(updatedAssignment);
    } catch (error) {
      console.error("[Assignment Update Error]:", error);
      res.status(500).json({ error: "Failed to update assignment" });
    }
  });

  // Create assignment
  app.post("/api/assignments", async (req, res) => {
    try {
      console.log("[Assignment] Received POST request with body:", req.body);
      console.log("[Assignment] Notification time (from client):", req.body.notificationTime);

      // Get user from session
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

      if (!token) {
        return res.status(401).json({ error: "Unauthorized - No token provided" });
      }

      const user = await validateSession(token);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized - Invalid session" });
      }

      if (user.role !== 'teacher') {
        return res.status(403).json({ error: "Only teachers can create assignments" });
      }

      const result = insertAssignmentSchema.safeParse({
        ...req.body,
        teacherId: user.id, // Automatically set the teacher ID
        teacherName: user.name, // Automatically set the teacher's name
        teacherSchool: user.school, // Automatically set the teacher's school
      });

      if (!result.success) {
        console.error("[Assignment] Validation failed:", result.error.issues);
        return res.status(400).json({
          error: "Invalid assignment data",
          details: result.error.issues,
        });
      }

      console.log("[Assignment] Validation passed. Creating assignment...");
      console.log("[Assignment] Teacher:", user.name, "from", user.school);
      console.log("[Assignment] Parsed notification time (UTC):", result.data.notificationTime);

      const assignment = await storage.createAssignment(result.data);
      console.log("[Assignment] Successfully created:", assignment.id);
      console.log("[Assignment] Stored notification time:", assignment.notificationTime);

      // Only send push notification if the notification time has arrived or passed
      try {
        const now = new Date();
        const notificationTime = new Date(assignment.notificationTime);
        console.log("[Assignment] Current server time (UTC):", now.toISOString());
        console.log("[Assignment] Assignment notification time (UTC):", notificationTime.toISOString());

        const shouldNotify = notificationTime <= now;
        console.log("[Assignment] Should notify immediately?", shouldNotify);

        if (shouldNotify) {
          const subscriptions = await storage.getAllPushSubscriptions();
          if (subscriptions.length > 0 && vapidPublicKey && vapidPrivateKey) {
            const payload = JSON.stringify({
              title: "New Homework Available!",
              body: `${assignment.topic} - ${assignment.subject} (${assignment.grade})`,
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              data: {
                assignmentId: assignment.id,
                url: `/student/${assignment.id}`,
              }
            });

            await Promise.allSettled(
              subscriptions.map(async (sub) => {
                try {
                  await webpush.sendNotification(
                    {
                      endpoint: sub.endpoint,
                      keys: {
                        p256dh: sub.p256dhKey,
                        auth: sub.authKey,
                      },
                    },
                    payload
                  );
                } catch (error: any) {
                  if (error.statusCode === 410 || error.statusCode === 404) {
                    await storage.deletePushSubscription(sub.endpoint);
                  }
                }
              })
            );
            console.log('[Push] Sent notifications for assignment (notification time arrived)');
          }
        } else {
          console.log('[Push] Skipping notification - scheduled for:', notificationTime.toISOString());
        }
      } catch (pushError) {
        console.error('[Push] Failed to send notifications:', pushError);
      }

      res.json(assignment);
    } catch (error) {
      console.error("[Assignment Creation Error]:", error);
      res.status(500).json({ error: "Failed to create assignment" });
    }
  });

  // Get chat messages for an assignment
  app.get("/api/chat/:assignmentId", async (req, res) => {
    try {
      // Authentication required
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.split(' ')[1];
      const user = await getUserFromToken(token);

      if (!user) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      const { assignmentId } = req.params;

      // Get assignment to verify ownership
      const assignment = await storage.getAssignment(assignmentId);
      if (!assignment) {
        return res.status(404).json({ error: 'Assignment not found' });
      }

      // Authorization: Assignments are shared resources - students from same school can access
      if (user.role === 'student') {
        // Verify student is from the same school (if school info available)
        if (assignment.teacherSchool && user.school && assignment.teacherSchool !== user.school) {
          return res.status(403).json({ error: 'Access denied - assignment not from your school' });
        }

        // Get all messages for this assignment
        const allMessages = await storage.getChatMessages(assignmentId);

        // CRITICAL: Each student sees only THEIR OWN conversation
        // Filter to only show messages where this student is the sender or AI responses to their messages
        const filteredMessages = allMessages.filter(msg => {
          // Always include messages where this student is the sender
          if (msg.userId === user.id) {
            return true;
          }

          // For AI messages, check if there's a preceding message from this student
          if (msg.role === 'ai') {
            const msgIndex = allMessages.indexOf(msg);
            if (msgIndex > 0) {
              const previousMsg = allMessages[msgIndex - 1];
              // Only include AI response if it's responding to this student
              return previousMsg.userId === user.id;
            }
          }

          return false;
        });

        res.json(filteredMessages);
      } else if (user.role === 'teacher') {
        // Teachers can see all messages for assignments they created
        if (assignment.teacherId !== user.id) {
          return res.status(403).json({ error: 'Access denied - not your assignment' });
        }

        // Get all messages for this assignment
        const allMessages = await storage.getChatMessages(assignmentId);
        res.json(allMessages);
      } else {
        return res.status(403).json({ error: 'Invalid role' });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Greeting endpoint for voice mode initialization
  app.post("/api/chat/:assignmentId/greeting", async (req, res) => {
    try {
      // Authentication required
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        console.error('[Greeting] No auth header');
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.split(' ')[1];
      const user = await getUserFromToken(token);

      if (!user) {
        console.error('[Greeting] Invalid user session');
        return res.status(401).json({ error: 'Invalid session' });
      }

      const { assignmentId } = req.params;

      const assignment = await storage.getAssignment(assignmentId);

      if (!assignment) {
        console.error('[Greeting] Assignment not found:', assignmentId);
        return res.status(404).json({ error: "Assignment not found" });
      }

      // Authorization: Students from same school can access
      if (user.role === 'student') {
        if (assignment.teacherSchool && user.school && assignment.teacherSchool !== user.school) {
          return res.status(403).json({ error: 'Access denied - assignment not from your school' });
        }
      } else if (user.role === 'teacher') {
        if (assignment.teacherId !== user.id) {
          return res.status(403).json({ error: 'Access denied - not your assignment' });
        }
      }

      // CRITICAL: Check for existing messages FIRST - filter by student for personalized conversations
      const allMessages = await storage.getChatMessages(assignmentId);

      // Filter messages for this specific student
      const studentMessages = allMessages.filter(msg => {
        if (msg.userId === user.id) return true;
        if (msg.role === 'ai') {
          const msgIndex = allMessages.indexOf(msg);
          if (msgIndex > 0) {
            const previousMsg = allMessages[msgIndex - 1];
            return previousMsg.userId === user.id;
          }
        }
        return false;
      });

      // If this student already has ANY messages, they've already been greeted
      if (studentMessages.length > 0) {
        console.log('[Greeting] ⚠ Student already has conversation, skipping duplicate greeting');
        return res.json({ message: "Let's continue our conversation!" });
      }

      // Stage 1 initialization: Simple greeting
      const greeting = `Hi there! How are you today?`;

      console.log('[Greeting] Creating Stage 1 greeting for student:', user.name);

      // Store the greeting
      await storage.createChatMessage({
        assignmentId,
        role: "ai",
        content: greeting,
        userId: user.id,
      });
      console.log('[Greeting] ✓ Greeting saved to database');

      return res.json({ message: greeting });
    } catch (error: any) {
      console.error('[Greeting] ❌ Error:', error);
      return res.status(500).json({ error: error.message || 'Failed to generate greeting' });
    }
  });

  // Process audio for voice chat
  app.post("/api/chat/process-audio", upload.single('audio_blob'), async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        console.error('[Voice] ❌ No auth header');
        return res.status(401).json({ error: "Authentication required" });
      }

      const token = authHeader.split(' ')[1];
      const user = await getUserFromToken(token);

      if (!user) {
        console.error('[Voice] ❌ Invalid user session');
        return res.status(401).json({ error: "Invalid session" });
      }

      if (!req.file) {
        console.error('[Voice] ❌ No audio file in request');
        return res.status(400).json({ error: "No audio file provided" });
      }

      const assignmentId = req.body.assignment_id;
      if (!assignmentId) {
        console.error('[Voice] ❌ No assignment ID');
        return res.status(400).json({ error: "Assignment ID required" });
      }

      console.log('[Voice] Processing audio for assignment:', assignmentId);
      console.log('[Voice] Audio file size:', req.file.size, 'bytes');
      console.log('[Voice] Audio MIME type:', req.file.mimetype);

      // Transcribe audio using OpenAI Whisper
      console.log('[Voice] Transcribing audio with OpenAI Whisper...');

      // Create a File object from the buffer for OpenAI Whisper
      const audioFile = new File([req.file.buffer], 'audio.webm', {
        type: req.file.mimetype || 'audio/webm',
      });

      // Use OpenAI Whisper to transcribe the audio
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "en", // Specify English for better accuracy
      });

      const userMessage = transcription.text?.trim() || "I didn't catch that.";
      console.log('[Voice] ✓ Transcription:', userMessage);

      // Get assignment details
      const assignment = await storage.getAssignment(assignmentId);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      // Get conversation history
      const chatHistory = await storage.getChatMessages(assignmentId);

      // Universal SOP: Simple linear conversation flow
      const aiMessageCount = chatHistory.filter(m => m.role === 'ai').length;

      // Get last few messages to check context
      const recentMessages = chatHistory.slice(-4).map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.content
      }));

      const systemPrompt = `You are a friendly AI tutor for GCSE/AQA ${assignment.subject}, helping a student with their homework on "${assignment.topic}".

**UNIVERSAL CONVERSATION FLOW:**

Current AI message count: ${aiMessageCount}

Stage 1 (message 0): "Hi there! How are you today?"
Stage 2 (message 1): "I have a homework topic from ${assignment.subject} about ${assignment.topic}. I'm your teacher. Are you ready?"
Stage 3 (message 2): "Before we begin, how much do you already know about ${assignment.topic}?"
Stage 4 (message 3): "Good effort! [brief feedback]. Now, [ask first analytical question - e.g., How does ${assignment.topic} differ from related concepts?]"
Stage 5 (message 4): "[Brief feedback]. [Ask comprehension question - e.g., Can you describe a real-world example?]"
Stage 6 (message 5): "[Brief feedback]. [Ask application question - e.g., What happens in a specific scenario related to ${assignment.topic}?]"
Stage 7 (message 6): "[Brief feedback]. [Ask analytical question - e.g., How does X affect Y in ${assignment.topic}?]"
Stage 8 (message 7): "[Brief feedback]. [Ask critical thinking question - e.g., Why is ${assignment.topic} important in this context?]"
Stage 9 (message 8+): "Excellent work! Here's a summary of what we covered: [3-4 sentences covering key concepts, real-world applications, and critical insights about ${assignment.topic}]"

**QUESTION TYPES (DO NOT ask for definitions):**
- Basic: Compare/contrast with related concepts
- Comprehension: Real-world examples and applications
- Application: Specific scenarios and outcomes
- Analytical: Cause and effect relationships
- Critical Thinking: Importance and broader implications

**RULES:**
- You are currently at Stage ${aiMessageCount + 1}
- Ask ONLY the question for your current stage
- Keep responses under 20 words (except final summary)
- Give brief, encouraging feedback (max 5 words)
- Questions must be analytical, NOT definitional
- NEVER ask "What is ${assignment.topic}?" - ask HOW, WHY, or application questions
- Move linearly through stages - no going back`;

      // Store student message with userId to ensure proper attribution
      await storage.createChatMessage({
        assignmentId,
        role: "student",
        content: userMessage,
        userId: user.id,
      });

      // Build messages for OpenAI
      // Add instruction to avoid repetition if we have recent context
      let antiRepetitionNote = '';
      if (recentMessages.length > 0) {
        antiRepetitionNote = '\n\n**CRITICAL: Do NOT repeat any questions you have already asked. Move forward in the conversation based on the student\'s latest response.**';
      }

      const chatMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt + antiRepetitionNote },
        ...chatHistory.map(msg => ({
          role: msg.role === 'student' ? 'user' as const : 'assistant' as const,
          content: msg.content,
        })),
        { role: 'user', content: userMessage },
      ];

      // Get AI response
      console.log('[Voice] Getting AI response...');
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: chatMessages,
        temperature: 0.7,
      });

      const aiResponse = completion.choices[0]?.message?.content || "I didn't quite catch that. Could you please repeat?";
      console.log('[Voice] ✓ AI response:', aiResponse);

      // Store AI response with userId to ensure it's associated with this student's conversation
      await storage.createChatMessage({
        assignmentId,
        role: "ai",
        content: aiResponse,
        userId: user.id, // Associate AI response with the student
      });

      // Check if AI has provided a final summary - if so, mark as ready for completion
      const summaryIndicators = [
        'summary',
        'summarize',
        'to summarize',
        'in summary',
        'to conclude',
        'in conclusion',
        'overall',
        "that's all",
        "we've covered",
        "we have covered",
        "completed everything",
        "great job",
        "well done",
        "you've done well",
        "completed our discussion",
        "good effort on your answers"
      ];

      const isSummaryMessage = summaryIndicators.some(indicator =>
        aiResponse.toLowerCase().includes(indicator)
      );

      if (isSummaryMessage) {
        // Mark as ready for completion by setting status to 'summary_provided'
        const progress = await storage.getProgress(assignmentId, user.id);
        if (progress && progress.status !== 'completed') {
          await storage.updateProgressStatus(assignmentId, user.id, 'summary_provided');
          console.log('[Voice] ✓ Summary detected - marked assignment as ready for completion');
        }
      }

      res.json({
        response: userMessage,
        assistant_response: aiResponse,
      });
    } catch (error: any) {
      console.error('[Voice] ❌ Error processing audio:', error);
      console.error('[Voice] ❌ Error stack:', error.stack);

      // Always return JSON, never HTML
      return res.status(500).json({
        error: error.message || 'Failed to process audio',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // Chat with AI about specific assignment
  app.post("/api/chat", async (req, res) => {
    try {
      // Authentication required
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const token = authHeader.split(' ')[1];
      const user = await getUserFromToken(token);

      if (!user) {
        return res.status(401).json({ error: "Invalid session" });
      }

      const { assignmentId } = req.body;

      // Get assignment details
      const assignment = await storage.getAssignment(assignmentId);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      // Authorization: Assignments are shared resources - students from same school can access
      if (user.role === 'student') {
        // Verify student is from the same school (if school info available)
        if (assignment.teacherSchool && user.school && assignment.teacherSchool !== user.school) {
          return res.status(403).json({ error: 'Access denied - assignment not from your school' });
        }
      } else if (user.role === 'teacher') {
        // Teachers can only interact with their own assignments
        if (assignment.teacherId !== user.id) {
          return res.status(403).json({ error: 'Access denied - not your assignment' });
        }
      } else {
        return res.status(403).json({ error: 'Invalid role' });
      }

      // Get conversation history (filtered by userId for students)
      let chatHistory = await storage.getChatMessages(assignmentId);

      // Filter chat history to only show this student's conversation
      if (user.role === 'student') {
        chatHistory = chatHistory.filter(msg => {
          if (msg.userId === user.id) return true;
          if (msg.role === 'ai') {
            const msgIndex = chatHistory.indexOf(msg);
            if (msgIndex > 0) {
              const previousMsg = chatHistory[msgIndex - 1];
              return previousMsg.userId === user.id;
            }
          }
          return false;
        });
      }

      // Universal SOP: Simple linear conversation flow
      const aiMessageCount = chatHistory.filter(m => m.role === 'ai').length;

      // Get last few messages to check context
      const recentMessages = chatHistory.slice(-4).map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.content
      }));

      const systemPrompt = `You are a friendly AI tutor for GCSE/AQA ${assignment.subject}, helping a student with their homework on "${assignment.topic}".

**UNIVERSAL CONVERSATION FLOW:**

Current AI message count: ${aiMessageCount}

Stage 1 (message 0): "Hi there! How are you today?"
Stage 2 (message 1): "I have a homework topic from ${assignment.subject} about ${assignment.topic}. I'm your teacher. Are you ready?"
Stage 3 (message 2): "Before we begin, how much do you already know about ${assignment.topic}?"
Stage 4 (message 3): "Good effort! [brief feedback]. Now, [ask first analytical question - e.g., How does ${assignment.topic} differ from related concepts?]"
Stage 5 (message 4): "[Brief feedback]. [Ask comprehension question - e.g., Can you describe a real-world example?]"
Stage 6 (message 5): "[Brief feedback]. [Ask application question - e.g., What happens in a specific scenario related to ${assignment.topic}?]"
Stage 7 (message 6): "[Brief feedback]. [Ask analytical question - e.g., How does X affect Y in ${assignment.topic}?]"
Stage 8 (message 7): "[Brief feedback]. [Ask critical thinking question - e.g., Why is ${assignment.topic} important in this context?]"
Stage 9 (message 8+): "Excellent work! Here's a summary of what we covered: [3-4 sentences covering key concepts, real-world applications, and critical insights about ${assignment.topic}]"

**QUESTION TYPES (DO NOT ask for definitions):**
- Basic: Compare/contrast with related concepts
- Comprehension: Real-world examples and applications
- Application: Specific scenarios and outcomes
- Analytical: Cause and effect relationships
- Critical Thinking: Importance and broader implications

**RULES:**
- You are currently at Stage ${aiMessageCount + 1}
- Ask ONLY the question for your current stage
- Keep responses under 20 words (except final summary)
- Give brief, encouraging feedback (max 5 words)
- Questions must be analytical, NOT definitional
- NEVER ask "What is ${assignment.topic}?" - ask HOW, WHY, or application questions
- Move linearly through stages - no going back`;

      const userMessage = req.body.content;

      // Handle conversation start trigger
      let messages: OpenAI.ChatCompletionMessageParam[];

      if (userMessage === '[START_CONVERSATION]' && chatHistory.length === 0) {
        // First interaction - AI should greet and begin conversation flow
        messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Begin the conversation by greeting the student warmly as described in the conversation flow. Just say the greeting, nothing else.' }
        ];
      } else {
        // Store student message with userId for proper attribution
        await storage.createChatMessage({
          assignmentId,
          role: "student",
          content: userMessage,
          userId: user.id, // Add userId to track which student sent this message
        });

        // Add instruction to avoid repetition if we have recent context
        let antiRepetitionNote = '';
        if (recentMessages.length > 0) {
          antiRepetitionNote = '\n\n**CRITICAL: Do NOT repeat any questions you have already asked. Move forward in the conversation based on the student\'s latest response.**';
        }

        messages = [
          { role: 'system', content: systemPrompt + antiRepetitionNote } as OpenAI.ChatCompletionMessageParam,
          ...chatHistory.map(msg => ({
            role: msg.role === "ai" ? "assistant" as const : "user" as const,
            content: msg.content,
          })),
          { role: 'user' as const, content: userMessage }
        ];
      }

      // Get AI response
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messages,
        temperature: 0.7,
        max_tokens: 500,
      });

      const aiResponse = completion.choices[0]?.message?.content || "I'm having trouble responding right now. Could you try asking again?";

      // Store AI message with userId to ensure it's associated with this student's conversation
      const aiMessage = await storage.createChatMessage({
        assignmentId,
        role: "ai",
        content: aiResponse,
        userId: user.id, // Associate AI response with the student
      });

      // Check if AI has provided a final summary - if so, mark as ready for completion
      const summaryIndicators = [
        'summary',
        'summarize',
        'to summarize',
        'in summary',
        'to conclude',
        'in conclusion',
        'overall',
        "that's all",
        "we've covered",
        "we have covered",
        "completed everything",
        "great job",
        "well done",
        "you've done well",
        "completed our discussion",
        "good effort on your answers"
      ];

      const isSummaryMessage = summaryIndicators.some(indicator =>
        aiResponse.toLowerCase().includes(indicator)
      );

      if (isSummaryMessage) {
        // Get user from token
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

        if (token) {
          const user = await validateSession(token);
          if (user) {
            // Mark as ready for completion by setting a flag in progress
            const progress = await storage.getProgress(assignmentId, user.id);
            if (progress && progress.status !== 'completed') {
              // Update to indicate summary has been provided
              await storage.updateProgressStatus(assignmentId, user.id, 'summary_provided');
            }
          }
        }
      }

      res.json(aiMessage);
    } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  // Student Progress Routes

  // Get all progress for an assignment (for teacher analytics)
  // Must be before the generic :assignmentId/:studentId route
  app.get("/api/progress/assignment/:assignmentId", async (req, res) => {
    try {
      // Authentication required
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.split(' ')[1];
      const user = await getUserFromToken(token);

      if (!user) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      // Authorization: Only teachers can view assignment progress
      if (user.role !== 'teacher') {
        return res.status(403).json({ error: 'Access denied - teachers only' });
      }

      const { assignmentId } = req.params;
      const assignment = await storage.getAssignment(assignmentId);

      if (!assignment) {
        return res.status(404).json({ error: 'Assignment not found' });
      }

      // Teachers can only view progress for their own assignments
      if (assignment.teacherId !== user.id) {
        return res.status(403).json({ error: 'Access denied - not your assignment' });
      }

      const progress = await storage.getStudentProgressByAssignment(assignmentId);
      res.json(progress);
    } catch (error) {
      console.error("[Progress] Error fetching assignment progress:", error);
      res.status(500).json({ error: "Failed to fetch assignment progress" });
    }
  });

  // Get all progress for a student
  // Must be before the generic :assignmentId/:studentId route
  app.get("/api/progress/student/:studentId", async (req, res) => {
    try {
      // Authentication required
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.split(' ')[1];
      const user = await getUserFromToken(token);

      if (!user) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      const { studentId } = req.params;

      // Authorization: Students can only view their own progress
      if (user.role === 'student' && user.id !== studentId) {
        return res.status(403).json({ error: 'Access denied - cannot view other students data' });
      }

      // Teachers can view any student's progress (for their own assignments - filtered at storage layer)
      const progress = await storage.getStudentProgressByStudent(studentId);
      res.json(progress);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch student progress" });
    }
  });

  // Get progress for a specific assignment and student
  app.get("/api/progress/:assignmentId/:studentId", async (req, res) => {
    try {
      // Authentication required
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.split(' ')[1];
      const user = await getUserFromToken(token);

      if (!user) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      const { assignmentId, studentId } = req.params;

      // Authorization: Students can only view their own progress
      if (user.role === 'student' && user.id !== studentId) {
        return res.status(403).json({ error: 'Access denied - cannot view other students data' });
      }

      // Teachers can only view progress for their own assignments
      if (user.role === 'teacher') {
        const assignment = await storage.getAssignment(assignmentId);
        if (!assignment || assignment.teacherId !== user.id) {
          return res.status(403).json({ error: 'Access denied - not your assignment' });
        }
      }

      const progress = await storage.getProgress(assignmentId, studentId);
      res.json(progress || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch progress" });
    }
  });

  // Create or update progress
  app.post("/api/progress", async (req, res) => {
    try {
      // Authentication required
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.split(' ')[1];
      const user = await getUserFromToken(token);

      if (!user) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      const result = insertStudentProgressSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid progress data", details: result.error.issues });
      }

      // Authorization: Students can only create/update their own progress
      if (user.role === 'student' && result.data.studentId !== user.id) {
        return res.status(403).json({ error: 'Access denied - cannot modify other students data' });
      }

      const progress = await storage.createOrUpdateProgress(result.data);
      res.json(progress);
    } catch (error) {
      console.error("Progress tracking error:", error);
      res.status(500).json({ error: "Failed to update progress" });
    }
  });

  // Update progress status
  app.patch("/api/progress/:assignmentId/:studentId/status", async (req, res) => {
    try {
      // Authentication required
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.split(' ')[1];
      const user = await getUserFromToken(token);

      if (!user) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      const { assignmentId, studentId } = req.params;
      const { status } = req.body;

      // Authorization: Students can only update their own progress
      if (user.role === 'student' && user.id !== studentId) {
        return res.status(403).json({ error: 'Access denied - cannot modify other students data' });
      }

      // Validate status against centralized allowed values
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: "Invalid status",
          details: `Status must be one of: ${validStatuses.join(', ')}`
        });
      }

      await storage.updateProgressStatus(assignmentId, studentId, status);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update status" });
    }
  });

  // Update progress time
  app.patch("/api/progress/:assignmentId/:studentId/time", async (req, res) => {
    try {
      // Authentication required
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.split(' ')[1];
      const user = await getUserFromToken(token);

      if (!user) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      const { assignmentId, studentId } = req.params;
      const { timeSpent } = req.body;

      // Authorization: Students can only update their own progress
      if (user.role === 'student' && user.id !== studentId) {
        return res.status(403).json({ error: 'Access denied - cannot modify other students data' });
      }

      // Validate timeSpent is a valid non-negative integer
      if (typeof timeSpent !== 'number' || !Number.isInteger(timeSpent) || timeSpent < 0) {
        return res.status(400).json({
          error: "Invalid timeSpent",
          details: "timeSpent must be a non-negative integer"
        });
      }

      await storage.updateProgressTime(assignmentId, studentId, timeSpent);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update time" });
    }
  });

  // Increment message count
  app.post("/api/progress/:assignmentId/:studentId/increment", async (req, res) => {
    try {
      // Authentication required
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.split(' ')[1];
      const user = await getUserFromToken(token);

      if (!user) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      const { assignmentId, studentId } = req.params;

      // Authorization: Students can only increment their own message count
      if (user.role === 'student' && user.id !== studentId) {
        return res.status(403).json({ error: 'Access denied - cannot modify other students data' });
      }

      await storage.incrementMessageCount(assignmentId, studentId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to increment count" });
    }
  });

  // Get VAPID public key for client subscription
  app.get("/api/vapid-public-key", (_req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
  });

  // Subscribe to push notifications
  app.post("/api/push/subscribe", async (req, res) => {
    try {
      const subscription = req.body;

      if (!subscription || !subscription.endpoint || !subscription.keys) {
        return res.status(400).json({ error: "Invalid subscription" });
      }

      // Store subscription in database
      await storage.createPushSubscription({
        endpoint: subscription.endpoint,
        p256dhKey: subscription.keys.p256dh,
        authKey: subscription.keys.auth,
      });

      console.log('[Push] New subscription saved');
      res.status(201).json({ message: "Subscription saved" });
    } catch (error) {
      console.error("Push subscribe error:", error);
      res.status(500).json({ error: "Failed to save subscription" });
    }
  });

  // Send push notification (internal use)
  app.post("/api/push/send", async (req, res) => {
    try {
      const { title, body, assignmentId, url } = req.body;

      if (!title || !body) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Get all subscriptions
      const subscriptions = await storage.getAllPushSubscriptions();

      if (subscriptions.length === 0) {
        return res.json({ message: "No subscriptions found", sent: 0 });
      }

      const payload = JSON.stringify({
        title,
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        data: {
          assignmentId,
          url: url || `/student/${assignmentId}`,
        }
      });

      // Send notifications to all subscribers
      const results = await Promise.allSettled(
        subscriptions.map(async (sub) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dhKey,
                  auth: sub.authKey,
                },
              },
              payload
            );
            return { success: true, endpoint: sub.endpoint };
          } catch (error: any) {
            // Remove expired subscriptions (410 Gone or 404 Not Found)
            if (error.statusCode === 410 || error.statusCode === 404) {
              console.log('[Push] Removing expired subscription:', sub.endpoint);
              await storage.deletePushSubscription(sub.endpoint);
            }
            throw error;
          }
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`[Push] Sent ${successful} notifications, ${failed} failed`);
      res.json({
        message: "Notifications sent",
        sent: successful,
        failed
      });
    } catch (error) {
      console.error("Push send error:", error);
      res.status(500).json({ error: "Failed to send notifications" });
    }
  });

  // Background job: Check for assignments needing notifications every minute
  const checkAndSendNotifications = async () => {
    try {
      const now = new Date();
      console.log(`[Background] Checking for pending notifications at ${now.toISOString()} (UTC)`);

      const pendingAssignments = await storage.getAssignmentsPendingNotification();

      if (pendingAssignments.length === 0) {
        console.log('[Background] No pending assignments needing notifications');
        return;
      }

      console.log(`[Background] Found ${pendingAssignments.length} assignment(s) needing notifications:`);
      pendingAssignments.forEach(a => {
        console.log(`  - ${a.topic}: scheduled for ${new Date(a.notificationTime).toISOString()}`);
      });

      const subscriptions = await storage.getAllPushSubscriptions();

      if (subscriptions.length === 0) {
        console.log('[Background] No push subscriptions available, skipping notifications');
        // Still mark as sent so we don't keep checking
        for (const assignment of pendingAssignments) {
          await storage.markAssignmentNotificationSent(assignment.id);
        }
        return;
      }

      console.log(`[Background] Found ${subscriptions.length} active subscription(s)`);

      for (const assignment of pendingAssignments) {
        console.log(`[Background] Processing: ${assignment.topic} (ID: ${assignment.id})`);

        const payload = JSON.stringify({
          title: "New Homework Available!",
          body: `${assignment.topic} - ${assignment.subject} (${assignment.grade})`,
          icon: '/icon-192.png',
          badge: '/favicon.ico',
          data: {
            assignmentId: assignment.id,
            url: `/student/${assignment.id}`,
          }
        });

        console.log(`[Background] Payload:`, payload);

        // Send to all subscribers
        const results = await Promise.allSettled(
          subscriptions.map(async (sub) => {
            try {
              console.log(`[Background] Sending to endpoint: ${sub.endpoint.substring(0, 50)}...`);
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: {
                    p256dh: sub.p256dhKey,
                    auth: sub.authKey,
                  },
                },
                payload
              );
              console.log(`[Background] ✓ Sent successfully`);
              return { success: true };
            } catch (error: any) {
              console.error(`[Background] ❌ Failed to send:`, error.message);
              if (error.statusCode === 410 || error.statusCode === 404) {
                console.log(`[Background] Removing expired subscription`);
                await storage.deletePushSubscription(sub.endpoint);
              }
              return { success: false, error: error.message };
            }
          })
        );

        const successful = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;
        const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !(r.value as any).success)).length;

        console.log(`[Background] Notification results: ${successful} successful, ${failed} failed`);

        // Mark as sent
        await storage.markAssignmentNotificationSent(assignment.id);
        console.log(`[Background] ✓ Marked ${assignment.topic} as notification sent`);
      }
    } catch (error) {
      console.error('[Background] Error checking/sending notifications:', error);
    }
  };

  // Run background notification checker every minute
  console.log('[Background] Starting notification checker...');

  // Run immediately on startup
  checkAndSendNotifications().catch(error => {
    console.error('[Background] Initial notification check failed:', error);
  });

  // Then check every 60 seconds
  setInterval(() => {
    checkAndSendNotifications().catch(error => {
      console.error('[Background] Scheduled notification check failed:', error);
    });
  }, 60000);

  console.log('[Background] ✓ Notification checker enabled (checks every 60 seconds)');

  const httpServer = createServer(app);

  return httpServer;
}
import { Router, type Request, type Response } from "express";
import { hashPassword, verifyPassword, createUser, findUserByEmail, findUserByGoogleId, createSession, validateSession, deleteSession } from "./auth";
import { insertUserSchema } from "@shared/schema";
import { OAuth2Client } from "google-auth-library";

const router = Router();

// Google OAuth client
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/api/auth/google/callback"
);

// Signup with email/password
router.post("/signup", async (req: Request, res: Response) => {
  console.log('[Auth API] 🔵 POST /api/auth/signup - REQUEST RECEIVED');
  console.log('[Auth API] Request body:', JSON.stringify(req.body, null, 2));

  try {
    const { email, password, name, role, school, subject } = req.body;

    if (!email || !password || !name || !role || !school) {
      console.log('[Auth API] ❌ Missing required fields:', { email: !!email, password: !!password, name: !!name, role: !!role, school: !!school });
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!['teacher', 'student'].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    // Teachers must provide subject
    if (role === 'teacher' && !subject) {
      return res.status(400).json({ error: "Subject is required for teachers" });
    }

    // Check if user exists
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hash password and create user
    const hashedPassword = await hashPassword(password);
    const user = await createUser({
      email,
      password: hashedPassword,
      name,
      role,
      school,
      subject: role === 'teacher' ? subject : undefined,
    });

    // Create session
    const token = await createSession(user.id);

    console.log('[Auth API] ✅ Signup successful for:', email);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
      token,
    });
  } catch (error: any) {
    console.error('[Auth API] ❌ Signup error:', error);

    // Check if it's a database connection error
    if (error.message?.includes('connection') || error.message?.includes('fetch failed')) {
      return res.status(503).json({ 
        error: "Database connection error. Please try again.",
        details: error.message 
      });
    }

    // Check for unique constraint violations
    if (error.message?.includes('unique') || error.code === '23505') {
      return res.status(400).json({ error: "Email already registered" });
    }

    res.status(500).json({ error: error.message || "Failed to create account" });
  }
});

// Login with email/password
router.post("/login", async (req: Request, res: Response) => {
  console.log('[Auth API] 🔵 POST /api/auth/login - REQUEST RECEIVED');
  console.log('[Auth API] Request body:', JSON.stringify(req.body, null, 2));
  console.log('[Auth API] Request headers:', JSON.stringify(req.headers, null, 2));

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      console.log('[Auth API] ❌ Missing email or password');
      return res.status(400).json({ error: "Email and password required" });
    }

    // Find user
    let user;
    try {
      user = await findUserByEmail(email);
    } catch (dbError: any) {
      console.error('[Auth API] Database error during findUserByEmail:', dbError);
      // Check if it's a database connection error
      if (dbError.message?.includes('connection') || dbError.message?.includes('fetch failed') || dbError.message?.includes('ECONNREFUSED') || dbError.message?.includes('database')) {
        return res.status(503).json({ 
          error: "Database connection error. Please try again.",
          details: "Database connection failed after retries. Please check the database configuration in Secrets."
        });
      }
      return res.status(500).json({ error: "Error connecting to database: " + dbError.message });
    }

    if (!user || !user.password) {
      console.log('[Auth API] User not found or no password set');
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Create session
    const token = await createSession(user.id);

    console.log('[Auth API] ✅ Login successful for:', email);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
      token,
    });
  } catch (error: any) {
    console.error("[Auth] Login error:", error);

    // Check if it's a database connection error
    if (error.message?.includes('connection') || error.message?.includes('database') || error.message?.includes('fetch failed') || error.message?.includes('ECONNREFUSED')) {
      return res.status(503).json({ 
        error: "Error connecting to database: Database connection failed after retries: " + error.message,
        details: "Please check the database configuration in Secrets"
      });
    }

    res.status(500).json({ 
      error: "An error occurred during login",
      details: error.message 
    });
  }
});

// Google OAuth login URL
router.get("/google", (_req: Request, res: Response) => {
  const url = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
  });
  res.json({ url });
});

// Google OAuth callback
router.post("/google/callback", async (req: Request, res: Response) => {
  try {
    const { code, role } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Authorization code required" });
    }

    // Exchange code for tokens
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    // Get user info
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(400).json({ error: "Invalid Google token" });
    }

    const { sub: googleId, email, name, picture } = payload;

    // Find or create user
    let user = await findUserByGoogleId(googleId!);

    if (!user) {
      // New user - require role selection
      if (!role || !['teacher', 'student'].includes(role)) {
        return res.status(400).json({ error: "Role required for new users" });
      }

      user = await createUser({
        email: email!,
        name: name!,
        googleId: googleId!,
        role,
        avatar: picture,
      });
    }

    // Create session
    const token = await createSession(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
      token,
    });
  } catch (error) {
    console.error("Google auth error:", error);
    res.status(500).json({ error: "Failed to authenticate with Google" });
  }
});

// Get current user
router.get("/me", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const user = await validateSession(token);

    if (!user) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
    });
  } catch (error) {
    console.error("Auth check error:", error);
    res.status(500).json({ error: "Failed to verify session" });
  }
});

// Logout
router.post("/logout", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      await deleteSession(token);
    }

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Failed to logout" });
  }
});

export default router;
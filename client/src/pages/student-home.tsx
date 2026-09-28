import { useQuery } from "@tanstack/react-query";
import { Link, Redirect } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Clock, BookOpen, Bell, BellRing, ArrowLeft, LogOut, User, MessageSquare } from "lucide-react";
import { Assignment, StudentProgress, ChatMessage } from "@shared/schema";
import { format, isFuture } from "date-fns";
import robotAvatarImage from "@assets/WhatsApp Image 2025-11-03 at 22.17.50_25e1ab98_1762190295919.jpg";
import { useHomeworkNotifications } from "@/hooks/use-homework-notifications";
import { useState, useEffect } from "react";
import learnifyLogo from "@assets/generated_images/Learnify_educational_platform_logo_bfba335c.png";
import { useAuth } from "@/contexts/auth-context";
import { ScrollArea } from "@/components/ui/scroll-area";

// Modern futuristic AI avatar
const aiAvatarGradient = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";

// Component to show conversation history for an assignment
function ConversationHistory({ assignmentId }: { assignmentId: string }) {
  const { user } = useAuth();
  
  // Fetch chat messages for this assignment
  const { data: messages } = useQuery<ChatMessage[]>({
    queryKey: [`/api/chat/${assignmentId}`],
    enabled: !!assignmentId && !!user,
    retry: false,
  });

  // Only show if there are messages
  if (!messages || messages.length === 0) {
    return null;
  }

  // Show the last 3 messages as a preview
  const recentMessages = messages.slice(-3);

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="w-4 h-4 text-muted-foreground" />
        <h4 className="text-sm font-medium text-muted-foreground">
          Conversation History ({messages.length} messages)
        </h4>
      </div>
      <ScrollArea className="h-32 border rounded-lg p-3 bg-muted/30">
        <div className="space-y-2">
          {recentMessages.map((msg, idx) => (
            <div key={idx} className="text-xs">
              <span className="font-medium">
                {msg.role === 'ai' ? '🤖 AI: ' : '👤 You: '}
              </span>
              <span className="text-muted-foreground">
                {msg.content.length > 100 ? msg.content.substring(0, 100) + '...' : msg.content}
              </span>
            </div>
          ))}
          {messages.length > 3 && (
            <p className="text-xs text-muted-foreground italic mt-2">
              ...and {messages.length - 3} more messages
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function StudentHome() {
  const { user, loading: isAuthLoading, logout: handleLogout } = useAuth();

  // Force re-render every 30 seconds to re-evaluate date-based filters
  const [, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30000); // Re-render every 30 seconds

    return () => clearInterval(timer);
  }, []);

  const { data: assignments, isLoading: isAssignmentsLoading } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
    enabled: !!user && user.role === 'student', // Only fetch if user is student
    refetchInterval: false, // Disable auto-refetch for faster loading
    refetchIntervalInBackground: false, // Don't refetch in background
    refetchOnWindowFocus: false, // Don't refetch on focus
    staleTime: 300000, // Cache for 5 minutes
    structuralSharing: true, // Re-enable for better performance
    retry: false,
  });

  // Fetch student's progress for all assignments
  const { data: studentProgress } = useQuery<StudentProgress[]>({
    queryKey: [`/api/progress/student/${user?.id}`],
    enabled: !!user?.id && user.role === 'student',
  });

  // Helper function to get assignment status
  const getAssignmentStatus = (assignmentId: string): 'not_started' | 'in_progress' | 'completed' => {
    const progress = studentProgress?.find(p => p.assignmentId === assignmentId);
    
    // If no progress record exists, assignment is not started
    if (!progress) {
      return 'not_started';
    }
    
    const status = progress.status;
    // Treat 'summary_provided' as 'in_progress' for badge display
    return status === 'summary_provided' ? 'in_progress' : status as 'not_started' | 'in_progress' | 'completed';
  };

  // Helper function to get status badge
  const getStatusBadge = (status: 'not_started' | 'in_progress' | 'completed') => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-600">Completed</Badge>;
      case 'in_progress':
        return <Badge variant="secondary">In Progress</Badge>;
      case 'not_started':
      default:
        return <Badge variant="default">Available</Badge>;
    }
  };

  // Debug logging
  console.log('[StudentHome] Current user:', user?.email, 'Role:', user?.role);
  console.log('[StudentHome] Assignments count:', assignments?.length);
  console.log('[StudentHome] Student progress count:', studentProgress?.length);
  console.log('[StudentHome] Is auth loading:', isAuthLoading);
  console.log('[StudentHome] Is assignments loading:', isAssignmentsLoading);

  // Auth check is now handled by Dashboard wrapper component

  const { hasPermission, requestPermission } = useHomeworkNotifications(
    assignments?.filter(assignment => !isFuture(new Date(assignment.notificationTime)))
  );

  // Show all assignments returned from the server (server already filters by time)
  const availableAssignments = assignments || [];

  // Show loading state ONLY while checking authentication (not assignments)
  // This prevents infinite loading when assignments are loaded
  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Role check is now handled by Dashboard wrapper component

  return (
    <div className="min-h-screen bg-background relative">

      {/* User Profile Header - Responsive */}
      <div className="fixed right-2 top-2 sm:right-4 sm:top-4 z-50">
        <div className="flex items-center gap-1 sm:gap-2 bg-card border rounded-lg px-2 sm:px-4 py-1.5 sm:py-2 shadow-sm">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium">{user?.name || 'Student'}</span>
            <span className="text-xs text-muted-foreground">Student</span>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
            {user?.name?.charAt(0).toUpperCase() || 'S'}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              await handleLogout();
              window.location.href = '/';
            }}
            className="ml-0 sm:ml-2 w-8 h-8 sm:w-10 sm:h-10"
            title="Logout"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 sm:p-6 md:p-8 lg:p-12">
        {/* Hero Section - Responsive */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center justify-center">
              <img
                src={learnifyLogo}
                alt="Learnify"
                className="h-12 sm:h-16 w-auto"
              />
            </div>
          </div>
          <div className="inline-flex mb-3 sm:mb-4">
            {/* AI Tutor Robot Avatar */}
            <img
              src={`${robotAvatarImage}?v=${Date.now()}`}
              alt="AI Tutor"
              className="w-16 h-16 sm:w-20 sm:h-20 object-contain"
            />
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 sm:mb-3 px-4" data-testid="text-welcome">
            Welcome back, {user?.name?.split(' ')[0] || 'Student'}!
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto px-4">
            Your friendly AI tutor is here to help you understand your homework topics through interactive conversations
          </p>
        </div>

        {/* Notification Permission Card */}
        {!hasPermission && (
          <Card className="mb-8 border-chart-5/20 bg-chart-5/5">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-chart-5/10 shrink-0">
                  <BellRing className="w-5 h-5 text-chart-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Enable Browser Notifications</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Get instant notifications with sound when new homework becomes available.
                    Click the notification to start learning immediately!
                  </p>
                  <Button
                    onClick={requestPermission}
                    size="sm"
                    data-testid="button-enable-notifications"
                    className="gap-2"
                  >
                    <Bell className="w-4 h-4" />
                    Enable Notifications
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notification Info Card */}
        {hasPermission && (
          <Card className="mb-8 border-chart-5/20 bg-chart-5/5">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-chart-5/10 shrink-0">
                  <Bell className="w-5 h-5 text-chart-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1 flex items-center gap-2">
                    Notifications Enabled
                    <Badge variant="secondary" className="text-xs">Active</Badge>
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    You'll receive browser notifications with sound when new homework becomes available.
                    Click any notification to start chatting with your AI tutor!
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Assignments */}
        <div>
          <h2 className="text-2xl font-semibold mb-6">Your Homework Topics</h2>

          {isAssignmentsLoading ? (
            <div className="space-y-4">
              {[1, 2].map(i => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-6 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-10 bg-muted rounded"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : availableAssignments.length > 0 ? (
            <div className="space-y-4">
              {availableAssignments.map(assignment => {
                const notificationTime = new Date(assignment.notificationTime);
                const isValidDate = notificationTime instanceof Date && !isNaN(notificationTime.getTime());

                return (
                  <Card
                    key={assignment.id}
                    className="hover-elevate active-elevate-2 transition-shadow"
                    data-testid={`card-assignment-${assignment.id}`}
                  >
                    <CardHeader className="gap-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <CardTitle className="text-xl mb-1">
                            {assignment.topic}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            {assignment.grade} • {assignment.subject}
                          </CardDescription>
                          {assignment.teacherName && (
                            <CardDescription className="flex items-center gap-2">
                              <User className="w-4 h-4" />
                              Teacher: {assignment.teacherName}
                            </CardDescription>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {getStatusBadge(getAssignmentStatus(assignment.id))}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {isValidDate && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span>Started {format(notificationTime, "PPp")}</span>
                        </div>
                      )}

                      <ConversationHistory assignmentId={assignment.id} />

                      <Link href={`/chat/${assignment.id}`}>
                        <Button
                          className="w-full gap-2"
                          size="lg"
                          data-testid={`button-start-${assignment.id}`}
                        >
                          <Bot className="w-5 h-5" />
                          Start Learning with AI Tutor
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="p-12">
              <div className="text-center">
                <div className="inline-flex p-4 rounded-full bg-muted mb-4">
                  {assignments && assignments.length > 0 ? (
                    <Clock className="w-8 h-8 text-muted-foreground" />
                  ) : (
                    <BookOpen className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <h3 className="text-xl font-semibold mb-2">
                  {assignments && assignments.length > 0
                    ? "No homework available yet"
                    : "No homework yet"
                  }
                </h3>
                <p className="text-muted-foreground">
                  {assignments && assignments.length > 0
                    ? "Your homework has been scheduled and will appear here at the scheduled time. Check back soon!"
                    : "Your teacher hasn't assigned any homework topics yet. Check back later!"
                  }
                </p>
              </div>
            </Card>
          )}
        </div>

        {/* Info Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-chart-5" />
              How AI Tutoring Works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">1. Start a conversation:</strong> Click on any homework topic to begin chatting with your AI tutor.
            </p>
            <p>
              <strong className="text-foreground">2. Share what you know:</strong> The AI will ask you questions to understand what you already know about the topic.
            </p>
            <p>
              <strong className="text-foreground">3. Get targeted help:</strong> Based on your responses, the AI will focus on areas where you need the most help.
            </p>
            <p>
              <strong className="text-foreground">4. Learn at your pace:</strong> Take your time, ask questions, and explore the topic in a friendly, interactive way.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
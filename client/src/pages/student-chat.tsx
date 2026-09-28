import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, Bot, User, Loader2, Mic, MicOff, Volume2, X, ArrowLeft, CheckCircle } from "lucide-react";
import { Assignment, ChatMessage, StudentProgress } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { useVoiceConversation } from "@/hooks/use-voice-conversation";
import { useProgressTracking } from "@/hooks/use-progress-tracking";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import learnifyLogo from "@/assets/logo.svg";
import aiAvatar from "@/assets/tutor-avatar.svg";

// Modern futuristic AI avatar - using a gradient-based design
const aiAvatarGradient = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";

export default function StudentChat() {
  const [, params] = useRoute("/chat/:id");
  const assignmentId = params?.id || "";
  const [message, setMessage] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceGender, setVoiceGender] = useState<'female' | 'male'>('female');
  const [isCompleting, setIsCompleting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastAiMessageRef = useRef<string>("");
  const lastMessageWasVoice = useRef<boolean>(false);
  const { toast } = useToast();

  const isSupported = 'speechSynthesis' in window && 'webkitSpeechRecognition' in window;

  // Get current user from auth context
  const { user } = useAuth();

  const { trackMessageSent, markComplete, updateStatus, createOrUpdateProgress } = useProgressTracking({
    assignmentId,
    enabled: !!assignmentId && !!user, // Only enable if assignmentId and user are available
  });

  // Fetch assignment details
  const { data: assignment, isLoading: isAssignmentLoading } = useQuery<Assignment>({
    queryKey: [`/api/assignments/${assignmentId}`],
  });

  // Create initial progress when student first accesses assignment
  // Note: We do NOT assign studentId to the assignment - assignments are shared resources
  // Multiple students can work on the same assignment with their own progress
  const progressInitializedRef = useRef(false);

  useEffect(() => {
    if (assignment && user && !progressInitializedRef.current) {
      progressInitializedRef.current = true;

      const initializeProgress = async () => {
        try {
          // Create initial progress for this student if it doesn't exist
          await createOrUpdateProgress({
            assignmentId: assignment.id,
            studentId: user.id,
            status: 'not_started',
            totalTimeSpent: 0,
            messageCount: 0,
          });
        } catch (error) {
          console.error('[Chat] Failed to initialize progress:', error);
        }
      };

      initializeProgress();
    }
  }, [assignment, user, createOrUpdateProgress]);


  const { data: messages, isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/api/chat/${assignmentId}`],
    enabled: !!assignmentId,
  });

  // Fetch current progress for completion validation
  const { data: currentProgress } = useQuery<StudentProgress>({
    queryKey: [`/api/progress/${assignmentId}/${user?.id}`],
    enabled: !!assignmentId && !!user?.id,
    refetchInterval: 5000, // Refetch every 5 seconds to update validation
  });

  // Check if any AI message contains a summary (fallback for client-side detection)
  const hasSummaryInHistory = messages?.some(msg => {
    if (msg.role !== 'ai') return false;
    const content = msg.content.toLowerCase();
    const hasSummary = content.includes("here's a summary") ||
           content.includes("here is a summary") ||
           content.includes('to summarize') ||
           content.includes('in summary') ||
           content.includes('to conclude') ||
           content.includes('in conclusion') ||
           content.includes('summarize') ||
           content.includes('summary');

    if (hasSummary) {
      console.log('[Complete] Found summary in message:', msg.content.substring(0, 100));
    }

    return hasSummary;
  });

  // Completion validation: Either summary provided OR (3+ minutes AND 15+ messages)
  const MIN_TIME_SECONDS = 180; // 3 minutes
  const MIN_MESSAGE_COUNT = 15;

  const canComplete = currentProgress && (
    currentProgress.status === 'summary_provided' ||
    hasSummaryInHistory ||
    (
      (currentProgress.totalTimeSpent || 0) >= MIN_TIME_SECONDS &&
      (currentProgress.messageCount || 0) >= MIN_MESSAGE_COUNT
    )
  );

  // Debug logging for complete button
  useEffect(() => {
    if (currentProgress) {
      console.log('[Complete] Current progress:', {
        status: currentProgress.status,
        timeSpent: currentProgress.totalTimeSpent,
        messageCount: currentProgress.messageCount,
        hasSummaryInHistory,
        canComplete,
      });
    }
  }, [currentProgress, hasSummaryInHistory, canComplete]);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest("POST", "/api/chat", {
        assignmentId,
        content,
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: [`/api/chat/${assignmentId}`] });

      // Invalidate progress to get updated status (e.g., 'summary_provided')
      if (user) {
        queryClient.invalidateQueries({ queryKey: [`/api/progress/${assignmentId}/${user.id}`] });
      }

      setMessage("");
      setInterimTranscript("");

      // Track message sent
      await trackMessageSent();
    },
  });

  const voiceConversation = useVoiceConversation(assignmentId, voiceGender, {
    onMessageSent: async () => {
      // Track message and refresh chat messages
      await trackMessageSent();
      await queryClient.invalidateQueries({ queryKey: [`/api/chat/${assignmentId}`] });
    },
  });

  const {
    isListening,
    isSpeaking,
    isProcessing,
    startListening,
    stopListening,
    speak,
    voiceMode,
    setVoiceMode,
    startContinuousConversation,
  } = voiceConversation;

  // Sync voiceMode when voiceGender changes
  useEffect(() => {
    if (voiceMode !== voiceGender) {
      setVoiceMode(voiceGender);
    }
  }, [voiceGender, voiceMode, setVoiceMode]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Track last AI message for reference (speaking is handled by voice hook)
  useEffect(() => {
    if (isVoiceMode && messages && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "ai" && lastMessage.content !== lastAiMessageRef.current) {
        lastAiMessageRef.current = lastMessage.content;

        // Refresh chat messages to show text backup
        queryClient.invalidateQueries({ queryKey: [`/api/chat/${assignmentId}`] });

        // Note: Speaking is handled by the voice conversation hook's processTranscript function
        // to avoid double-speaking the same message
        console.log('[Voice] New AI message tracked:', lastMessage.content.substring(0, 50));
      }
    }
  }, [messages, isVoiceMode, assignmentId]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !sendMutation.isPending) {
      lastMessageWasVoice.current = false;
      sendMutation.mutate(message.trim());
    }
  };

  const stopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const handleVoiceToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      if (isSpeaking) {
        stopSpeaking();
      }
      // Update voice button to continuously listen
      if (!isListening) {
        startListening();
      }
      // Don't manually stop - let intelligent pause detection handle it
    }
  };

  const toggleVoiceMode = async () => {
    const newVoiceMode = !isVoiceMode;

    if (!newVoiceMode) {
      // Exiting voice mode - stop everything immediately BEFORE changing state
      stopListening();
      stopSpeaking();

      // Force cancel any queued speech
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      // Stop any ongoing recognition from the hook
      if (voiceConversation.stopListening) {
        voiceConversation.stopListening();
      }

      lastMessageWasVoice.current = false;

      // Small delay to ensure cleanup completes before UI update
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Update voice mode state first
    setIsVoiceMode(newVoiceMode);

    if (!newVoiceMode) {
      // After state update, refresh chat messages to show all voice conversation text
      console.log('[Chat] Exiting voice mode - refreshing chat messages');
      await queryClient.refetchQueries({ queryKey: [`/api/chat/${assignmentId}`] });
      console.log('[Chat] Messages refetched successfully');
    }

    if (newVoiceMode) {
      // Check browser support first
      if (!('speechSynthesis' in window)) {
        toast({
          title: "Voice Not Supported",
          description: "Your browser doesn't support text-to-speech. Please use Chrome, Edge, or Safari.",
          variant: "destructive",
        });
        setIsVoiceMode(false);
        return;
      }

      if (!('webkitSpeechRecognition' in window)) {
        toast({
          title: "Voice Recognition Not Supported",
          description: "Your browser doesn't support speech recognition. Please use Chrome, Edge, or Safari.",
          variant: "destructive",
        });
        setIsVoiceMode(false);
        return;
      }

      // Refresh chat messages before checking
      await queryClient.refetchQueries({ queryKey: [`/api/chat/${assignmentId}`] });

      // Entering voice mode - auto-start conversation with greeting and auto-listen
      toast({
        title: "Continuous Voice Mode Activated",
        description: "Initializing voice system...",
      });

      // Get refreshed messages
      const existingMessages = queryClient.getQueryData<ChatMessage[]>([`/api/chat/${assignmentId}`]) || [];
      if (existingMessages.length === 0) {
        console.log('[Voice] Starting new conversation - using voice hook');
        try {
          // Use the voice hook's consolidated greeting function
          await startContinuousConversation();

          // Show ready message after greeting
          toast({
            title: "Voice Mode Ready",
            description: "Speak naturally - I'm listening!",
            duration: 2000,
          });
        } catch (error: any) {
          console.error("[Voice] Error starting voice conversation:", error);
          toast({
            title: "Error starting voice conversation",
            description: error.message || "Could not start the conversation. Please try again.",
            variant: "destructive",
          });
          setIsVoiceMode(false);
        }
      } else {
        // If conversation already started, speak the last AI message then start listening
        const lastAiMsg = existingMessages?.filter(m => m.role === 'ai').pop();
        if (lastAiMsg) {
          console.log('[Voice] Speaking last AI message then starting listening');
          try {
            setTimeout(async () => {
              await speak(lastAiMsg.content);

              // Wait for speech to finish before showing ready message
              await new Promise(resolve => setTimeout(resolve, 500));

              toast({
                title: "Voice Mode Ready",
                description: "Speak naturally - I'm listening!",
                duration: 2000,
              });
            }, 500);
          } catch (speakError: any) {
            console.error("[Voice] Speech synthesis error:", speakError);
            toast({
              title: "Voice Output Error",
              description: "Unable to use text-to-speech. Make sure your device volume is on and try refreshing the page.",
              variant: "destructive",
            });
            setIsVoiceMode(false);
          }
        } else {
          // No AI messages yet, just start listening immediately
          setTimeout(() => {
            console.log('[Voice] No AI messages - starting listening immediately');
            startListening();
            toast({
              title: "Voice Mode Ready",
              description: "Speak naturally - I'm listening!",
              duration: 2000,
            });
          }, 800);
        }
      }
    }
  };

  // Log session info when component mounts
  // IMPORTANT: This must be before any early returns to satisfy Rules of Hooks
  // Note: useProgressTracking hook handles all tracking lifecycle internally
  useEffect(() => {
    if (user && assignment) {
      console.log('[Chat] Session started for student:', user.id, 'assignment:', assignment.id);
      console.log('[Chat] Student name:', user.name, 'Email:', user.email);
    }
  }, [user, assignment]);

  if (isAssignmentLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-semibold mb-2">Assignment not found</h2>
          <p className="text-muted-foreground">
            This homework assignment doesn't exist or has been removed.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header - Responsive */}
      <div className="border-b bg-card relative">
        <div className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10">
          <a href="/dashboard">
            <Button
              size="icon"
              className="w-8 h-8 sm:w-10 sm:h-10 bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-back-dashboard"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
          </a>
        </div>
        <div className="max-w-3xl mx-auto px-2 sm:px-4 py-3 sm:py-4 pl-12 sm:pl-16">
          <div className="flex items-center gap-2 sm:gap-4">
            <Avatar className="w-10 h-10 sm:w-12 sm:h-12 shrink-0">
              <AvatarImage src={aiAvatar} alt="AI Tutor" />
              <AvatarFallback className="bg-transparent text-white">
                <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold text-base sm:text-lg truncate" data-testid="text-assignment-topic">
                {assignment.topic}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                {assignment.grade} • {assignment.subject}
              </p>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              {isVoiceMode && (
                <Badge variant="default" className="gap-1 bg-green-600 text-xs hidden sm:flex">
                  <Volume2 className="w-3 h-3" />
                  Voice
                </Badge>
              )}
              {isSpeaking && (
                <Badge variant="secondary" className="gap-1 animate-pulse text-xs hidden sm:flex">
                  <Volume2 className="w-3 h-3" />
                  Speaking
                </Badge>
              )}
              <Badge variant="secondary" className="shrink-0 text-xs hidden sm:inline-flex">AI Tutor</Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  // Validate before marking complete
                  if (!canComplete) {
                    const timeNeeded = Math.max(0, MIN_TIME_SECONDS - (currentProgress?.totalTimeSpent || 0));
                    const messagesNeeded = Math.max(0, MIN_MESSAGE_COUNT - (currentProgress?.messageCount || 0));

                    toast({
                      title: "Keep Learning!",
                      description: (currentProgress?.status === 'summary_provided' || hasSummaryInHistory)
                        ? "You can now mark this assignment as complete!"
                        : `To complete, you need: ${timeNeeded > 0 ? `${Math.ceil(timeNeeded / 60)} more minutes` : '✓ Time requirement met'}${messagesNeeded > 0 ? `, ${messagesNeeded} more messages` : ', ✓ Message requirement met'}`,
                      variant: "default",
                    });
                    return;
                  }

                  setIsCompleting(true);
                  try {
                    await markComplete();

                    // Invalidate all related caches to refresh UI
                    queryClient.invalidateQueries({ queryKey: [`/api/assignments`] });
                    queryClient.invalidateQueries({ queryKey: [`/api/assignments/${assignmentId}`] });
                    queryClient.invalidateQueries({ queryKey: [`/api/progress/assignment/${assignmentId}`] });
                    if (user) {
                      queryClient.invalidateQueries({ queryKey: [`/api/progress/${assignmentId}/${user.id}`] });
                      queryClient.invalidateQueries({ queryKey: [`/api/progress/student/${user.id}`] }); // For student dashboard
                    }

                    toast({
                      title: "Assignment completed!",
                      description: "Great work! Your progress has been saved.",
                    });
                  } catch (error) {
                    toast({
                      title: "Failed to mark complete",
                      description: "Please try again.",
                      variant: "destructive",
                    });
                  } finally {
                    setIsCompleting(false);
                  }
                }}
                disabled={isCompleting || !canComplete}
                className={`gap-1 text-xs sm:text-sm px-2 sm:px-3 ${!canComplete ? 'opacity-50 cursor-not-allowed' : ''}`}
                data-testid="button-mark-complete"
              >
                {isCompleting ? (
                  <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                )}
                <span className="hidden sm:inline">Complete</span>
                <span className="sm:hidden">✓</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Messages - Always visible whether in voice mode or not */}
      <div className={`flex-1 overflow-y-auto ${isVoiceMode ? 'pb-80' : ''}`}>
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {messagesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {messages && messages.length > 0 ? (
                <>
                  <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-900">
                      <strong>📝 Complete Conversation Backup</strong> - {messages.length} messages
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      Every word spoken between you and Learnify is automatically transcribed and saved here. Review your conversation anytime!
                    </p>
                  </div>
                  {messages.map((msg, index) => (
                    <div
                      key={msg.id || index}
                      className={`flex gap-3 ${msg.role === "student" ? "flex-row-reverse" : ""}`}
                      data-testid={`message-${index}`}
                    >
                      <Avatar className="w-10 h-10 shrink-0">
                        {msg.role === "ai" ? (
                          <>
                            <AvatarImage src={aiAvatar} alt="AI Tutor" />
                            <AvatarFallback className="bg-transparent text-white">
                              <Bot className="w-5 h-5" />
                            </AvatarFallback>
                          </>
                        ) : (
                          <AvatarFallback className="bg-primary/10 text-primary">
                            <User className="w-5 h-5" />
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div
                        className={`flex-1 max-w-[80%] ${
                          msg.role === "student" ? "items-end" : "items-start"
                        }`}
                      >
                        <div
                          className={`rounded-2xl px-4 py-3 ${
                            msg.role === "ai"
                              ? "bg-card border rounded-tl-sm"
                              : "bg-primary text-primary-foreground rounded-tr-sm"
                          }`}
                        >
                          <p className="text-base leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 px-1">
                          {format(new Date(msg.timestamp), "p")}
                        </p>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="text-center py-12 max-w-2xl mx-auto px-4">
            <div className="mb-6">
              <img
                src={aiAvatar}
                alt="AI Tutor"
                className="mx-auto w-32 h-32 object-contain"
              />
            </div>
            <h2 className="text-xl font-semibold mb-3">Hello! Welcome to Learnify! 😊</h2>
            <p className="text-muted-foreground mb-4">
              I'm your AI tutor, ready to help you learn <strong>{assignment?.topic}</strong>.
            </p>

            <Card className="bg-card/50 border-primary/20 mt-6">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3 text-left">
                  <div className="p-2 rounded-lg bg-primary/10 shrink-0 mt-0.5">
                    <Mic className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm mb-1">🎙️ Voice Conversation</h4>
                    <p className="text-sm text-muted-foreground">
                      Speak naturally with Learnify - every word is automatically transcribed and saved as text backup.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 text-left">
                  <div className="p-2 rounded-lg bg-chart-5/10 shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-chart-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm mb-1">📝 Automatic Text Backup</h4>
                    <p className="text-sm text-muted-foreground">
                      All voice conversations appear here as text. Review, study, and revisit your learning journey anytime!
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
                </div>
              )}
            </>
          )}
          {sendMutation.isPending && (
            <div className="flex gap-3">
              <Avatar className="w-10 h-10 shrink-0">
                <AvatarImage src={aiAvatar} alt="AI Tutor" />
                <AvatarFallback className="bg-transparent text-white">
                  <Bot className="w-5 h-5" />
                </AvatarFallback>
              </Avatar>
              <div className="rounded-2xl rounded-tl-sm bg-card px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce"></div>
                  <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                  <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Voice Mode Overlay - Semi-transparent to show chat backup */}
      {isVoiceMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-white/98 via-white/85 to-transparent backdrop-blur-md z-40 pb-4 pt-20">
          <div className="text-center space-y-3 sm:space-y-4 max-w-2xl mx-auto px-4 sm:px-6">
            {/* Title with gradient */}
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Voice Learning Mode
              </h1>
              <p className="text-sm sm:text-base md:text-lg text-gray-600">
                Speak naturally with your AI tutor
              </p>
            </div>

            {/* Animated Orb with Wave Effect - Compact */}
            <div className="flex items-center justify-center py-1 sm:py-2">
              <div className="relative w-24 h-24 sm:w-32 sm:h-32">
                {/* Outer glow effect */}
                <div className={`absolute inset-0 rounded-full blur-3xl opacity-50 transition-all duration-700 ${
                  isListening
                    ? 'bg-blue-400 animate-pulse'
                    : isSpeaking
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-indigo-400'
                }`}></div>

                {/* Main orb with gradient */}
                <div className={`relative w-full h-full rounded-full overflow-hidden transition-all duration-700 ${
                  isListening
                    ? 'bg-gradient-to-br from-blue-400 via-cyan-500 to-blue-600 shadow-2xl shadow-blue-500/50'
                    : isSpeaking
                    ? 'bg-gradient-to-br from-green-400 via-emerald-500 to-green-600 shadow-2xl shadow-green-500/50'
                    : 'bg-gradient-to-br from-purple-400 via-indigo-500 to-purple-600 shadow-2xl shadow-purple-500/50'
                }`}>
                  {/* Animated wave layers */}
                  {(isListening || isSpeaking) && (
                    <>
                      <div className={`absolute inset-0 opacity-30 ${
                        isListening ? 'animate-wave-slow' : 'animate-wave-fast'
                      }`} style={{
                        background: isListening
                          ? 'radial-gradient(circle at 30% 50%, rgba(255,255,255,0.8) 0%, transparent 50%), radial-gradient(circle at 70% 50%, rgba(59,130,246,0.6) 0%, transparent 50%)'
                          : 'radial-gradient(circle at 30% 50%, rgba(255,255,255,0.8) 0%, transparent 50%), radial-gradient(circle at 70% 50%, rgba(34,197,94,0.6) 0%, transparent 50%)'
                      }}></div>
                      <div className={`absolute inset-0 opacity-20 ${
                        isListening ? 'animate-wave-medium' : 'animate-wave-pulse'
                      }`} style={{
                        background: isListening
                          ? 'radial-gradient(circle at 50% 30%, rgba(147,197,253,0.9) 0%, transparent 60%)'
                          : 'radial-gradient(circle at 50% 30%, rgba(134,239,172,0.9) 0%, transparent 60%)'
                      }}></div>
                      <div className={`absolute inset-0 opacity-40 ${
                        isListening ? 'animate-wave-fast' : 'animate-wave-slow'
                      }`} style={{
                        background: isListening
                          ? 'radial-gradient(circle at 50% 70%, rgba(96,165,250,0.7) 0%, transparent 50%)'
                          : 'radial-gradient(circle at 50% 70%, rgba(74,222,128,0.7) 0%, transparent 50%)'
                      }}></div>
                    </>
                  )}

                  {/* Center icon - Compact */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    {isListening ? (
                      <Mic className="w-8 h-8 sm:w-10 sm:h-10 text-white drop-shadow-lg animate-pulse" />
                    ) : isSpeaking ? (
                      <Volume2 className="w-8 h-8 sm:w-10 sm:h-10 text-white drop-shadow-lg animate-bounce" />
                    ) : (
                      <Bot className="w-8 h-8 sm:w-10 sm:h-10 text-white drop-shadow-lg" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Voice Selection Cards - Compact Design */}
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-3">
                {/* Left Voice Option */}
                <button
                  onClick={() => {
                    const newGender = voiceGender === 'female' ? 'male' : 'female';
                    if (window.speechSynthesis.speaking) {
                      window.speechSynthesis.cancel();
                    }
                    setVoiceGender(newGender);
                    setVoiceMode(newGender);
                  }}
                  className="p-2 rounded-xl bg-white/60 backdrop-blur-sm border border-gray-200/50 hover:border-indigo-300 hover:shadow-md transition-all opacity-50 hover:opacity-70">
                  <div className="text-xs font-medium text-gray-700">
                    {voiceGender === 'female' ? 'Sol' : 'Juniper'}
                  </div>
                </button>

                {/* Current Voice - Highlighted */}
                <div className="px-4 py-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
                  <div className="text-sm font-semibold">
                    {voiceGender === 'female' ? 'Juniper' : 'Mohsin'}
                  </div>
                  <div className="text-xs opacity-75">Active</div>
                </div>

                {/* Right Voice Option */}
                <button
                  onClick={() => {
                    const newGender = voiceGender === 'female' ? 'male' : 'female';
                    if (window.speechSynthesis.speaking) {
                      window.speechSynthesis.cancel();
                    }
                    setVoiceGender(newGender);
                    setVoiceMode(newGender);
                  }}
                  className="p-2 rounded-xl bg-white/60 backdrop-blur-sm border border-gray-200/50 hover:border-indigo-300 hover:shadow-md transition-all opacity-50 hover:opacity-70">
                  <div className="text-xs font-medium text-gray-700">
                    {voiceGender === 'female' ? 'Cove' : 'Sol'}
                  </div>
                </button>
              </div>

              {/* Status and Exit - Compact */}
              <div className="flex items-center justify-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${isListening ? 'bg-blue-500 animate-pulse' : isSpeaking ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`}></div>
                  <span className="text-gray-600 font-medium">
                    {isListening ? 'Listening...' : isSpeaking ? 'Speaking...' : 'Ready'}
                  </span>
                </div>
                <Button
                  onClick={toggleVoiceMode}
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-1.5 rounded-full shadow-md hover:shadow-lg transition-all"
                  data-testid="button-exit-voice-mode"
                >
                  <X className="w-3 h-3 mr-1" />
                  Exit
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input Controls - Voice Only */}
      <div className="border-t bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4">
          {/* Voice Mode Toggle - Only Input Method */}
          {isSupported ? (
            <div className="flex flex-col items-center justify-center gap-3">
              <Button
                type="button"
                variant={isVoiceMode ? "default" : "outline"}
                onClick={toggleVoiceMode}
                className={`gap-3 min-h-14 px-8 text-lg font-semibold rounded-full shadow-lg transition-all duration-300 ${
                  isVoiceMode
                    ? 'bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white border-0'
                    : 'bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white border-0 hover:shadow-xl transform hover:scale-105'
                }`}
                data-testid="button-voice-mode-toggle"
              >
                {isVoiceMode ? (
                  <>
                    <Volume2 className="w-6 h-6 animate-pulse" />
                    Exit Voice Mode
                  </>
                ) : (
                  <>
                    <Mic className="w-6 h-6" />
                    🎙️ Start Voice Conversation
                  </>
                )}
              </Button>
              <span className="text-sm text-muted-foreground text-center max-w-md">
                {isVoiceMode
                  ? "🔴 Live - Speak naturally, no buttons needed!"
                  : "✨ Click above to start - AI will greet you and listen automatically!"}
              </span>
            </div>
          ) : (
            <div className="text-center text-sm text-muted-foreground">
              <p>Voice features are not supported in your browser.</p>
              <p className="mt-2">Please use Chrome, Edge, or Safari for voice interaction.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
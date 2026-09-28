import { useState, useRef, useCallback, useEffect } from "react";
import { useToast } from '@/hooks/use-toast';

interface UseVoiceConversationOptions {
  onMessageSent?: () => Promise<void>;
}

export function useVoiceConversation(
  assignmentId: string,
  initialVoiceGender: 'male' | 'female' = 'female',
  options?: UseVoiceConversationOptions
) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<'male' | 'female'>(initialVoiceGender);

  const voiceModeRef = useRef<'male' | 'female'>(initialVoiceGender);
  const greetingRequestedRef = useRef(false);
  const isActiveRef = useRef(false); // Master control flag
  const isSpeakingRef = useRef(false);
  const isProcessingRef = useRef(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isListeningRef = useRef(false);
  const lastSpokenTextRef = useRef<string>("");
  const processingTranscriptRef = useRef<string>("");

  const { toast } = useToast();

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  useEffect(() => {
    return () => {
      console.log('[Voice] Hook cleanup - stopping all voice activities');
      isActiveRef.current = false;
      stopListening();
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  const startContinuousConversation = async () => {
    const now = Date.now();

    // Only skip if greeting was requested in last 5 seconds (prevent rapid duplicate requests)
    if (greetingRequestedRef.current) {
      console.log('[Voice] ⛔ Greeting already in progress, skipping');
      return;
    }

    console.log('[Voice] Starting conversation with greeting');
    greetingRequestedRef.current = true;
    isActiveRef.current = true;
    setError(null);

    try {
      if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
        throw new Error('Your browser does not support speech recognition. Please use Chrome, Edge, or Safari.');
      }

      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Not authenticated - please log in again');
      }

      console.log('[Voice] Checking database for existing conversation...');
      const messagesResponse = await fetch(`/api/chat/${assignmentId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (messagesResponse.ok) {
        const existingMessages = await messagesResponse.json();
        if (existingMessages && existingMessages.length > 0) {
          console.log('[Voice] ⛔ Database has existing messages, speaking last AI message');
          greetingRequestedRef.current = false;
          const lastAiMessage = existingMessages.filter((m: any) => m.role === 'ai').pop();
          if (lastAiMessage) {
            await speak(lastAiMessage.content);
          }
          return;
        }
      }

      console.log('[Voice] Requesting greeting from server');
      const response = await fetch(`/api/chat/${assignmentId}/greeting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Server error' }));
        throw new Error(errorData.error || `Failed to get greeting (${response.status})`);
      }

      const data = await response.json();
      console.log('[Voice] ✓ Greeting received:', data.message.substring(0, 50));

      // Trigger message refresh to show the greeting from database
      if (options?.onMessageSent) {
        await options.onMessageSent();
      }

      await speak(data.message);
      
      // Reset flag after successful greeting
      greetingRequestedRef.current = false;

    } catch (err: any) {
      console.error('[Voice] ❌ Failed to start conversation:', err);
      greetingRequestedRef.current = false;
      isActiveRef.current = false;
      setError(err.message || 'Failed to start conversation');
      toast({
        title: 'Voice Error',
        description: err.message || 'Failed to start conversation',
        variant: 'destructive',
      });
      throw err;
    }
  };

  const speak = async (text: string): Promise<void> => {
    if (!isActiveRef.current) {
      console.log('[Voice] ⛔ Voice mode inactive, skipping speech');
      return;
    }

    // Prevent duplicate speech
    if (text === lastSpokenTextRef.current && isSpeakingRef.current) {
      console.log('[Voice] ⛔ Already speaking this text, skipping duplicate');
      return;
    }

    // Stop any existing speech
    window.speechSynthesis.cancel();

    return new Promise((resolve) => {
      console.log('[Voice] Speaking:', text.substring(0, 50) + '...');
      lastSpokenTextRef.current = text;
      isSpeakingRef.current = true;
      setIsSpeaking(true);

      const utterance = new SpeechSynthesisUtterance(text);
      
      // Ensure voices are loaded - this is critical for proper voice selection
      let voices = window.speechSynthesis.getVoices();
      
      // If voices aren't loaded yet, wait for them
      if (voices.length === 0) {
        console.log('[Voice] Waiting for voices to load...');
        window.speechSynthesis.onvoiceschanged = () => {
          voices = window.speechSynthesis.getVoices();
          console.log('[Voice] Voices loaded:', voices.length);
          selectAndSpeak();
        };
        // Trigger the voices to load
        window.speechSynthesis.getVoices();
        return;
      }
      
      selectAndSpeak();
      
      function selectAndSpeak() {
        voices = window.speechSynthesis.getVoices();
        console.log('[Voice] Total voices available:', voices.length);
      
      // Filter voices by gender and language
        const englishVoices = voices.filter(voice => voice.lang.startsWith('en'));
        console.log('[Voice] English voices found:', englishVoices.length);
        
        // Log available voices for debugging
        englishVoices.forEach(v => console.log('[Voice] Available:', v.name, v.lang));
        
        let selectedVoice = null;
        
        if (voiceModeRef.current === 'female') {
          // Try to find female voices by common patterns
          const femaleKeywords = ['female', 'woman', 'samantha', 'victoria', 'karen', 'zira', 'susan', 'alice', 'fiona', 'kate', 'serena', 'tessa', 'veena', 'moira', 'nicky', 'google us english 2', 'google us english 6'];
          
          selectedVoice = englishVoices.find(voice => {
            const voiceName = voice.name.toLowerCase();
            return femaleKeywords.some(keyword => voiceName.includes(keyword));
          });
          
          // Fallback: if no explicit female keyword, pick the first non-male voice
          if (!selectedVoice) {
            const maleKeywords = ['male', 'man', 'daniel', 'david', 'mark', 'thomas', 'alex', 'jorge', 'oliver', 'google us english 1'];
            selectedVoice = englishVoices.find(voice => {
              const voiceName = voice.name.toLowerCase();
              return !maleKeywords.some(keyword => voiceName.includes(keyword));
            });
          }
        } else {
          // Try to find male voices by common patterns
          const maleKeywords = ['male', 'man', 'daniel', 'david', 'mark', 'thomas', 'alex', 'jorge', 'oliver', 'fred', 'google us english 1'];
          
          selectedVoice = englishVoices.find(voice => {
            const voiceName = voice.name.toLowerCase();
            return maleKeywords.some(keyword => voiceName.includes(keyword));
          });
          
          // Fallback: pick first voice if no male voice explicitly found
          if (!selectedVoice && englishVoices.length > 0) {
            selectedVoice = englishVoices[0];
          }
        }
        
        // Use selected voice or fall back to first English voice
        if (selectedVoice) {
          utterance.voice = selectedVoice;
          console.log('[Voice] ✓ Using voice:', selectedVoice.name, 'for', voiceModeRef.current);
        } else if (englishVoices.length > 0) {
          utterance.voice = englishVoices[0];
          console.warn('[Voice] No matching voice found for', voiceModeRef.current, '- using first English voice:', englishVoices[0].name);
        } else {
          console.warn('[Voice] No English voices available - using default');
        }

        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onend = () => {
          console.log('[Voice] ✓ Speech ended');
          isSpeakingRef.current = false;
          setIsSpeaking(false);

          if (isActiveRef.current) {
            setTimeout(() => {
              console.log('[Voice] Auto-starting listening after speech');
              startListening();
            }, 500);
          }
          resolve();
        };

        utterance.onerror = (event) => {
          console.error('[Voice] ❌ Speech error:', event);
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          lastSpokenTextRef.current = "";
          
          // Fallback to listening
          if (isActiveRef.current) {
            setTimeout(() => startListening(), 500);
          }
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      }
    });
  };

  const processTranscript = async (transcript: string) => {
    // Prevent duplicate processing
    if (transcript === processingTranscriptRef.current) {
      console.log('[Voice] ⛔ Already processing this transcript, skipping duplicate');
      return;
    }

    console.log('[Voice] Processing transcript:', transcript);
    processingTranscriptRef.current = transcript;
    isProcessingRef.current = true;
    setIsProcessing(true);

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          assignmentId,
          content: transcript,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Server error' }));
        throw new Error(errorData.error || 'Failed to get AI response');
      }

      const aiMessage = await response.json();
      console.log('[Voice] ✓ AI response:', aiMessage.content.substring(0, 50));

      // Trigger message refresh to show new messages from database
      if (options?.onMessageSent) {
        await options.onMessageSent();
      }

      await speak(aiMessage.content);

    } catch (err: any) {
      console.error('[Voice] ❌ Error processing speech:', err);
      setError(err.message || 'Failed to process speech');
      toast({
        title: 'Voice Error',
        description: err.message || 'Failed to process speech',
        variant: 'destructive',
      });
      setTimeout(() => startListening(), 500);
    } finally {
      processingTranscriptRef.current = "";
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  };

  const startListening = useCallback(async () => {
    if (!isActiveRef.current) {
      console.log('[Voice] ⛔ Voice mode inactive, cannot start listening');
      return;
    }

    if (isListeningRef.current || isSpeakingRef.current || isProcessingRef.current) {
      console.log('[Voice] ⛔ Cannot start listening - already active');
      return;
    }

    console.log('[Voice] Starting listening');
    setError(null);

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        throw new Error('Speech recognition not supported in this browser');
      }

      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
          recognitionRef.current = null;
        } catch (e) {
          console.log('[Voice] Error aborting previous recognition:', e);
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      isListeningRef.current = true;
      setIsListening(true);

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      let finalTranscript = '';
      let silenceTimer: NodeJS.Timeout | null = null;

      recognition.onstart = () => {
        console.log('[Voice] ✓ Recognition started');
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (!isActiveRef.current || isProcessingRef.current) {
          return;
        }

        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;

          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        if (silenceTimer) {
          clearTimeout(silenceTimer);
        }

        if (finalTranscript.trim()) {
          silenceTimer = setTimeout(() => {
            const textToProcess = finalTranscript.trim();
            if (textToProcess && isActiveRef.current && !isProcessingRef.current) {
              console.log('[Voice] ✓ Processing final transcript');

              if (recognitionRef.current) {
                recognitionRef.current.abort();
                recognitionRef.current = null;
              }

              isListeningRef.current = false;
              setIsListening(false);
              processTranscript(textToProcess);
              finalTranscript = '';
            }
          }, 2000);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.log('[Voice] Recognition error:', event.error);

        if (event.error === 'aborted') {
          isListeningRef.current = false;
          setIsListening(false);
          return;
        }

        if (event.error === 'no-speech' || event.error === 'network') {
          return;
        }

        if (recognitionRef.current) {
          recognitionRef.current.abort();
          recognitionRef.current = null;
        }
        isListeningRef.current = false;
        setIsListening(false);

        if (event.error === 'audio-capture' || event.error === 'not-allowed') {
          setError(`Microphone error: ${event.error}`);
          toast({
            title: 'Microphone Error',
            description: event.error === 'not-allowed'
              ? 'Please allow microphone access to use voice mode'
              : 'Unable to access microphone. Please check your settings.',
            variant: 'destructive',
          });
        }
      };

      recognition.onend = () => {
        console.log('[Voice] Recognition ended');

        if (!isActiveRef.current || !isListeningRef.current) {
          setIsListening(false);
          return;
        }

        const shouldRestart = isActiveRef.current && isListeningRef.current && !isSpeakingRef.current && !isProcessingRef.current;

        if (shouldRestart) {
          setTimeout(() => {
            if (recognitionRef.current && isListeningRef.current && isActiveRef.current) {
              try {
                recognition.start();
              } catch (error) {
                console.error('[Voice] Failed to restart recognition:', error);
                isListeningRef.current = false;
                setIsListening(false);
              }
            }
          }, 600);
        } else {
          setIsListening(false);
        }
      };

      recognition.start();

    } catch (err: any) {
      console.error('[Voice] ❌ Failed to start speech recognition:', err);
      setError(err.message || 'Failed to start speech recognition');
      isListeningRef.current = false;
      setIsListening(false);
      toast({
        title: 'Microphone Error',
        description: err.message || 'Failed to start speech recognition',
        variant: 'destructive',
      });
    }
  }, [assignmentId, toast]);

  const stopListening = useCallback(() => {
    console.log('[Voice] Stopping all voice activities');
    isActiveRef.current = false;
    isListeningRef.current = false;
    setIsListening(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      } catch (error) {
        console.log('[Voice] Error stopping recognition:', error);
      }
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
        audioContextRef.current = null;
      } catch (error) {
        console.log('[Voice] Error closing audio context:', error);
      }
    }

    isSpeakingRef.current = false;
    setIsSpeaking(false);
    lastSpokenTextRef.current = "";
    processingTranscriptRef.current = "";
  }, []);

  return {
    isListening,
    isProcessing,
    isSpeaking,
    error,
    startListening,
    stopListening,
    speak,
    voiceMode,
    setVoiceMode,
    startContinuousConversation,
  };
}
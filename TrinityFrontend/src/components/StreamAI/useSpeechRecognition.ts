import { useState, useEffect, useRef, useCallback } from 'react';

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface UseSpeechRecognitionReturn {
  transcript: string;
  isListening: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  hasRecognitionSupport: boolean;
}

export const useSpeechRecognition = (
  onTranscript?: (text: string) => void,
  language: string = 'en-US'
): UseSpeechRecognitionReturn => {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef('');
  const onTranscriptRef = useRef(onTranscript);

  // Check if browser supports speech recognition
  const hasRecognitionSupport = typeof window !== 'undefined' && 
    (window.SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Check if we're on HTTPS or localhost (required for microphone access)
  const isSecureContext = typeof window !== 'undefined' && 
    (window.location.protocol === 'https:' || 
     window.location.hostname === 'localhost' || 
     window.location.hostname === '127.0.0.1');

  // Update callback ref when it changes
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  // Helper function to create a new recognition instance
  const createRecognition = useCallback((): SpeechRecognition | null => {
    if (!hasRecognitionSupport) {
      return null;
    }

    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition() as SpeechRecognition;

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = language;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const current = event.resultIndex;
      const transcript = event.results[current][0].transcript;
      console.log('Speech recognition result:', transcript);
      
      finalTranscriptRef.current = transcript;
      setTranscript(transcript);
      
      if (onTranscriptRef.current) {
        onTranscriptRef.current(transcript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error, event.message);
      
      let errorMessage = 'Speech recognition error occurred.';
      
      switch (event.error) {
        case 'no-speech':
          errorMessage = 'No speech detected. Please try again.';
          break;
        case 'audio-capture':
          errorMessage = 'No microphone found. Please check your microphone settings.';
          break;
        case 'not-allowed':
          errorMessage = 'Microphone permission denied. Please allow microphone access.';
          break;
        case 'network':
          errorMessage = 'Network error. Please check your connection.';
          break;
        case 'aborted':
          return;
        default:
          errorMessage = `Recognition error: ${event.error}`;
      }
      
      setError(errorMessage);
      setIsListening(false);
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      setIsListening(false);
      // Clear the ref so we create a new instance next time
      recognitionRef.current = null;
    };

    recognition.onstart = () => {
      console.log('Speech recognition started');
      setIsListening(true);
      setError(null);
      finalTranscriptRef.current = '';
      setTranscript('');
    };

    return recognition;
  }, [hasRecognitionSupport, language]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
          recognitionRef.current.abort();
        } catch (e) {
          // Ignore errors during cleanup
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  const startListening = useCallback(() => {
    if (!hasRecognitionSupport) {
      setError('Speech recognition is not supported in your browser.');
      console.error('Speech recognition not supported');
      return;
    }

    if (!isSecureContext) {
      setError('Microphone access requires HTTPS or localhost. Please use a secure connection.');
      console.error('Not a secure context - microphone access requires HTTPS or localhost');
      return;
    }

    // Stop any existing recognition first
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current.abort();
      } catch (e) {
        // Ignore errors
      }
      recognitionRef.current = null;
    }

    // Create a new recognition instance (required - can only be used once)
    const recognition = createRecognition();
    if (!recognition) {
      setError('Failed to initialize speech recognition.');
      return;
    }

    recognitionRef.current = recognition;

    try {
      console.log('Starting speech recognition...');
      setError(null);
      recognition.start();
    } catch (err: any) {
      console.error('Error starting recognition:', err);
      recognitionRef.current = null;
      
      if (err.name === 'InvalidStateError' || err.message?.includes('already started')) {
        // Try again after a short delay
        setTimeout(() => {
          const newRecognition = createRecognition();
          if (newRecognition) {
            recognitionRef.current = newRecognition;
            try {
              newRecognition.start();
            } catch (retryErr) {
              console.error('Retry failed:', retryErr);
              setError('Failed to start speech recognition. Please try again.');
            }
          }
        }, 200);
      } else {
        setError('Failed to start speech recognition. Please check microphone permissions.');
      }
    }
  }, [hasRecognitionSupport, isSecureContext, createRecognition, isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current.abort();
      } catch (err) {
        console.error('Error stopping recognition:', err);
      }
    }
  }, []);

  return {
    transcript,
    isListening,
    error,
    startListening,
    stopListening,
    hasRecognitionSupport,
  };
};


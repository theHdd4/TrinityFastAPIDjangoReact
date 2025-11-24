import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSpeechRecognition } from './useSpeechRecognition';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'ghost' | 'outline';
  language?: string;
}

const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscript,
  disabled = false,
  className,
  size = 'sm',
  variant = 'ghost',
  language = 'en-US',
}) => {
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | null>(null);
  const { isListening, error, startListening, stopListening, hasRecognitionSupport } = useSpeechRecognition(
    (text) => {
      onTranscript(text);
      // Auto-stop after getting transcript
      setTimeout(() => {
        stopListening();
      }, 100);
    },
    language
  );

  // Check microphone permission status
  useEffect(() => {
    const checkPermission = async () => {
      // Only check permissions if we're in a secure context
      const isSecure = window.location.protocol === 'https:' || 
                       window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1';
      
      if (!isSecure) {
        console.warn('Not a secure context - microphone permissions cannot be checked');
        return;
      }

      if (navigator.permissions && navigator.permissions.query) {
        try {
          const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          setPermissionStatus(result.state);
          
          result.onchange = () => {
            setPermissionStatus(result.state);
          };
        } catch (e) {
          // Permission API not fully supported, that's okay
          console.log('Permission API not fully supported');
        }
      }
    };
    checkPermission();
  }, []);

  const handleClick = async () => {
    if (isListening) {
      stopListening();
    } else {
      // Check if we're in a secure context (HTTPS or localhost)
      const isSecure = window.location.protocol === 'https:' || 
                       window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1';
      
      if (!isSecure) {
        alert(
          'Microphone access requires a secure connection.\n\n' +
          'Please access the application using one of the following:\n' +
          '• https://localhost:8081 (if configured)\n' +
          '• http://localhost:8081 (localhost is allowed)\n' +
          '• Or set up HTTPS for your server\n\n' +
          'Current URL: ' + window.location.href
        );
        return;
      }

      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert(
          'Microphone access is not available.\n\n' +
          'This may be because:\n' +
          '• The page is not served over HTTPS or localhost\n' +
          '• Your browser does not support microphone access\n' +
          '• The browser has blocked microphone access\n\n' +
          'Please use localhost or HTTPS to enable voice input.'
        );
        return;
      }

      // Check if we need to request permission first
      if (permissionStatus === 'denied' || permissionStatus === 'prompt') {
        // Try to request permission explicitly
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Permission granted, stop the stream and start recognition
          stream.getTracks().forEach(track => track.stop());
          setPermissionStatus('granted');
        } catch (err: any) {
          console.error('Microphone permission denied:', err);
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            alert(
              'Microphone permission was denied.\n\n' +
              'To enable voice input:\n' +
              '1. Click the microphone icon in the browser address bar\n' +
              '2. Select "Allow" for microphone access\n' +
              '3. Or go to Browser Settings → Privacy → Site Settings → Microphone\n\n' +
              'Then try clicking the microphone button again.'
            );
            return;
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            alert('No microphone found. Please connect a microphone and try again.');
            return;
          } else {
            alert('Failed to access microphone: ' + (err.message || err.name));
            return;
          }
        }
      }
      startListening();
    }
  };

  // If no support, show disabled state
  if (!hasRecognitionSupport) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={variant}
              size={size}
              disabled={true}
              className={cn(className)}
            >
              <MicOff className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Speech recognition not supported in your browser. Please use Chrome, Edge, or Safari.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Check if we're in a secure context
  const isSecure = typeof window !== 'undefined' && (
    window.location.protocol === 'https:' || 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1'
  );

  // Determine tooltip message
  let tooltipMessage = isListening ? 'Click to stop listening' : 'Click to start voice input';
  if (!isSecure) {
    tooltipMessage = 'Microphone requires HTTPS or localhost. Current: ' + window.location.hostname;
  } else if (error) {
    tooltipMessage = error;
  } else if (permissionStatus === 'denied') {
    tooltipMessage = 'Microphone permission denied. Click to try again or allow in browser settings.';
  } else if (permissionStatus === 'prompt') {
    tooltipMessage = 'Click to allow microphone access and start voice input';
  }

  // If error (especially permission denied or insecure context), show error state
  const hasPermissionError = !isSecure ||
                            error?.toLowerCase().includes('permission') || 
                            error?.toLowerCase().includes('not-allowed') ||
                            error?.toLowerCase().includes('secure') ||
                            permissionStatus === 'denied';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size={size}
            onClick={handleClick}
            disabled={disabled}
            className={cn(
              className,
              isListening && 'animate-pulse bg-red-500 hover:bg-red-600 text-white',
              !isListening && hasPermissionError && 'text-red-500 hover:text-red-600',
              !isListening && !hasPermissionError && 'hover:bg-gray-100 hover:text-gray-800'
            )}
          >
            {isListening ? (
              <Mic className="w-4 h-4 animate-pulse" />
            ) : hasPermissionError ? (
              <AlertCircle className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p>{tooltipMessage}</p>
          {!isSecure && (
            <p className="text-xs mt-1 text-yellow-300">
              ⚠️ Use localhost or HTTPS: http://localhost:8081 or https://your-domain.com
            </p>
          )}
          {hasPermissionError && isSecure && (
            <p className="text-xs mt-1 text-yellow-300">
              Tip: Check browser address bar for microphone icon, or go to Settings → Privacy → Site Settings → Microphone
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default VoiceInputButton;


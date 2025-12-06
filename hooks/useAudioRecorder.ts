import { useState, useRef, useEffect, useCallback } from 'react';

interface UseAudioRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
}

export const useAudioRecorder = ({ onRecordingComplete }: UseAudioRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  
  // Ref to track duration for the callback (solves closure stale state issue)
  const durationRef = useRef(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Audio Context for Visualizer
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      sourceRef.current = source;

      // Media Recorder
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        // Use ref.current to get the up-to-date duration
        const finalDuration = durationRef.current;
        onRecordingComplete(blob, finalDuration);
        cleanupAudio();
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      // Reset state and ref
      setDuration(0);
      durationRef.current = 0;
      setPermissionError(null);

      // Clear any existing timer just in case
      if (timerRef.current) clearInterval(timerRef.current);
      
      timerRef.current = window.setInterval(() => {
        setDuration(prev => {
          const next = prev + 1;
          durationRef.current = next; // Sync ref with state
          return next;
        });
      }, 1000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      setPermissionError("마이크 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.");
    }
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, []); // Dependency array is empty as we rely on refs

  const cleanupAudio = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(e => console.error("Error closing AudioContext:", e));
    }

    analyserRef.current = null;
    sourceRef.current = null;
    audioContextRef.current = null;
    streamRef.current = null; // Clear stream ref
  };

  // Cleanup on unmount (only if app completely closes)
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      cleanupAudio();
    };
  }, []);

  return {
    isRecording,
    duration,
    permissionError,
    analyser: analyserRef.current,
    startRecording,
    stopRecording
  };
};
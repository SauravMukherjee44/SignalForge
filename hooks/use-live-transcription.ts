'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function useLiveTranscription(
  onFinal: (text: string) => void | Promise<void>,
) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const continueRef = useRef(false);
  const callbackRef = useRef(onFinal);
  const [supported] = useState(() => {
    if (typeof window === 'undefined') return true;
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    return Boolean(
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition,
    );
  });
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    callbackRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => {
    const recognitionConstructor =
      (
        window as Window & {
          SpeechRecognition?: SpeechRecognitionConstructor;
          webkitSpeechRecognition?: SpeechRecognitionConstructor;
        }
      ).SpeechRecognition ??
      (
        window as Window & {
          webkitSpeechRecognition?: SpeechRecognitionConstructor;
        }
      ).webkitSpeechRecognition;
    if (!recognitionConstructor) return;
    const recognition = new recognitionConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
    recognition.onresult = (event) => {
      let partial = '';
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index];
        const text = result[0].transcript.trim();
        if (result.isFinal && text) void callbackRef.current(text);
        else partial += `${text} `;
      }
      setInterim(partial.trim());
    };
    recognition.onerror = (event) => {
      if (event.error !== 'no-speech')
        setError(event.error ?? 'Speech recognition failed.');
    };
    recognition.onend = () => {
      if (continueRef.current) {
        try {
          recognition.start();
        } catch {
          setListening(false);
        }
      } else setListening(false);
    };
    recognitionRef.current = recognition;
    return () => {
      continueRef.current = false;
      recognition.abort();
    };
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setError(null);
    continueRef.current = true;
    recognitionRef.current.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    continueRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);
    setInterim('');
  }, []);

  return { supported, listening, interim, error, start, stop };
}

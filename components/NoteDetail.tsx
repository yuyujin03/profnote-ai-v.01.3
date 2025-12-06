import React, { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, FileText, CheckCircle, HelpCircle, Download, Folder, Play, Pause, FileAudio, AlertCircle, RefreshCw, Loader2, Sparkles } from 'lucide-react';
import { Recording } from '../types';
import { formatDate } from '../utils/audioUtils';
import { getAudio } from '../services/storageService';

interface NoteDetailProps {
  recording: Recording;
  onBack: () => void;
  onRetry: () => void;
}

const NoteDetail: React.FC<NoteDetailProps> = ({ recording, onBack, onRetry }) => {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  useEffect(() => {
    const loadAudio = async () => {
      // If audioBlob is already in memory and is a valid Blob, use it
      if (recording.audioBlob && recording.audioBlob instanceof Blob) {
        setAudioUrl(URL.createObjectURL(recording.audioBlob));
        return;
      }

      // Otherwise, try to fetch from IndexedDB
      setIsLoadingAudio(true);
      try {
        const blob = await getAudio(recording.id);
        if (blob && blob instanceof Blob) {
          setAudioUrl(URL.createObjectURL(blob));
        }
      } catch (error) {
        console.error("Failed to load audio file:", error);
      } finally {
        setIsLoadingAudio(false);
      }
    };

    loadAudio();

    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [recording.id, recording.audioBlob]);

  const handleDownloadNote = () => {
    if (!recording.data) return;

    const { summary, transcript, keyTerms, examQuestions } = recording.data;
    const content = `
# ${recording.title}
과목: ${recording.subject}
날짜: ${formatDate(recording.date)}

## 📌 핵심 요약
${summary}

## 🔑 주요 용어
${keyTerms.map(term => `- ${term}`).join('\n')}

## 📝 예상 시험 문제
${examQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

## 💬 전체 스크립트
${transcript}
    `.trim();

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${recording.title.replace(/\s+/g, '_')}_notes.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAudio = () => {
    if (!audioUrl) return;
    
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = `${recording.title.replace(/\s+/g, '_')}.webm`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderContent = () => {
    if (recording.status === 'processing') {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-100 rounded-full animate-ping opacity-75"></div>
            <div className="relative bg-white p-4 rounded-full shadow-lg border border-indigo-100">
               <Loader2 size={48} className="text-indigo-600 animate-spin" />
            </div>
          </div>
          <div>
             <h3 className="text-xl font-bold text-slate-800 mb-2">AI가 강의를 분석하고 있습니다</h3>
             <p className="text-slate-500 max-w-md mx-auto">
               오디오 길이에 따라 1~3분 정도 소요될 수 있습니다.<br/>
               잠시만 기다려주세요...
             </p>
          </div>
        </div>
      );
    }

    if (recording.status === 'error' || !recording.data) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <div className="p-4 bg-red-100 text-red-500 rounded-full">
            <AlertCircle size={40} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              {recording.status === 'error' ? '분석에 실패했습니다' : '분석 결과가 없습니다'}
            </h3>
            <p className="text-slate-500 max-w-sm mx-auto mb-6">
              {recording.errorMessage || "네트워크 상태를 확인하고 다시 시도해주세요. 오디오 파일은 안전하게 저장되어 있습니다."}
            </p>
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-md transition-all hover:scale-105 active:scale-95"
            >
              <Sparkles size={18} />
              AI 분석 다시 시도하기
            </button>
          </div>
        </div>
      );
    }

    const { summary, transcript, keyTerms, examQuestions } = recording.data;

    return (
      <>
        {/* Summary Section */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-indigo-600">
            <BookOpen size={20} />
            <h2 className="font-semibold text-lg">핵심 요약</h2>
          </div>
          <div className="bg-indigo-50 p-5 rounded-xl text-slate-800 leading-relaxed border border-indigo-100">
            {summary}
          </div>
        </section>

        {/* Key Terms Section */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle size={20} />
            <h2 className="font-semibold text-lg">주요 용어</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {keyTerms.map((term, idx) => (
              <div key={idx} className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <span className="font-medium text-emerald-800 block mb-1">
                   • {term.split(':')[0]}
                </span>
                <span className="text-sm text-slate-600 block">
                  {term.split(':')[1] || term}
                </span>
              </div>
            ))}
          </div>
        </section>

         {/* Exam Questions Section */}
         <section className="space-y-3">
          <div className="flex items-center gap-2 text-rose-600">
            <HelpCircle size={20} />
            <h2 className="font-semibold text-lg">예상 시험 문제</h2>
          </div>
          <div className="space-y-3">
            {examQuestions.map((q, idx) => (
              <div key={idx} className="flex gap-3 bg-white p-4 rounded-lg border border-slate-200">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xs">
                  Q{idx + 1}
                </span>
                <p className="text-slate-700">{q}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Transcript Section */}
        <section className="space-y-3 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2 text-slate-500">
            <FileText size={20} />
            <h2 className="font-semibold text-lg">전체 스크립트</h2>
          </div>
          <div className="bg-slate-50 p-5 rounded-xl text-slate-600 text-sm leading-7 whitespace-pre-wrap font-sans">
            {transcript}
          </div>
        </section>
      </>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200 p-4 flex items-center justify-between bg-white z-10 sticky top-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">
              {recording.title}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                <Folder size={10} />
                {recording.subject}
              </span>
              <span className="text-sm text-slate-400">•</span>
              <p className="text-sm text-slate-500">{formatDate(recording.date)}</p>
            </div>
          </div>
        </div>
        
        {recording.status === 'completed' && (
          <button
            onClick={handleDownloadNote}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm font-medium transition-colors"
            title="강의 노트 다운로드"
          >
            <FileText size={18} />
            <span className="hidden sm:inline">노트 저장</span>
          </button>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        
        {/* Audio Player Section - Always visible if audio exists */}
        <section className="bg-slate-900 rounded-xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-3">
               <div className={`p-2 rounded-lg ${recording.status === 'error' ? 'bg-red-500' : 'bg-indigo-500'}`}>
                 <FileAudio size={24} />
               </div>
               <div>
                 <h3 className="font-semibold text-slate-100">강의 녹음 파일</h3>
                 <p className="text-xs text-slate-400">
                   {isLoadingAudio ? '오디오 파일 불러오는 중...' : audioUrl ? '재생 준비 완료' : '오디오 파일을 찾을 수 없습니다'}
                 </p>
               </div>
             </div>
             {audioUrl && (
               <button 
                 onClick={handleDownloadAudio}
                 className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-300 hover:text-white"
                 title="오디오 다운로드"
               >
                 <Download size={20} />
               </button>
             )}
          </div>
          
          {audioUrl && (
            <audio controls className="w-full h-10 block rounded-lg accent-indigo-500" src={audioUrl}>
              Your browser does not support the audio element.
            </audio>
          )}
        </section>

        {renderContent()}

      </div>
    </div>
  );
};

export default NoteDetail;
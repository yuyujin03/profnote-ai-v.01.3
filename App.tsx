import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Mic, List, Loader2, Sparkles, AlertCircle, Trash2, Edit2, Folder, FolderOpen, X, Check, StopCircle, ChevronUp, Upload, FileAudio, FileText, ChevronDown } from 'lucide-react';
import Recorder from './components/Recorder';
import NoteDetail from './components/NoteDetail';
import { Recording, NoteData } from './types';
import { analyzeLectureAudio } from './services/geminiService';
import { formatTime, formatDate } from './utils/audioUtils';
import { useAudioRecorder } from './hooks/useAudioRecorder';

// [중요] storageService에서 필요한 함수들 import (getAllRecordings 포함)
import { saveRecording, deleteAudio, getAudio, getAllRecordings, updateRecording, importRecording } from './services/storageService';

// Mock UUID generator (임시 ID 생성용)
const generateId = () => Math.random().toString(36).substr(2, 9);

function App() {
  // 1. [변경] LocalStorage 초기화 로직 제거 -> 빈 배열로 시작
  const [recordings, setRecordings] = useState<Recording[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'home' | 'recording'>('home');
  
  // Edit Modal State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSubject, setEditSubject] = useState('');
  // Dropdown state for folder selection
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importAudioFile, setImportAudioFile] = useState<File | null>(null);
  const [importMdFile, setImportMdFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Expanded Folders State (Default all open)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['기타']));

  // 2. [추가] 컴포넌트 마운트 시 백엔드에서 데이터 불러오기
  useEffect(() => {
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    try {
      const data = await getAllRecordings();
      // 백엔드 데이터(날짜 문자열)를 Date 객체로 변환
      const formattedData = data.map((item: any) => ({
        ...item,
        data:item.noteData,

        date: new Date(item.date),
        // 오디오 Blob은 목록에서는 필요 없으므로 undefined (상세보기 시 로드됨)
        audioBlob: undefined 
      }));
      // 날짜 최신순 정렬
      formattedData.sort((a: any, b: any) => b.date.getTime() - a.date.getTime());
      setRecordings(formattedData);
    } catch (error) {
      console.error("목록 불러오기 실패:", error);
    }
  };

  // [삭제됨] LocalStorage 저장용 useEffect는 제거했습니다.

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // --- Logic for Recording ---
  // 3. [변경] 녹음 완료 처리 로직 (임시 상태 표시 -> 분석 -> 저장 -> 목록 갱신)
  const handleRecordingCompleteCallback = async (blob: Blob, duration: number) => {
    setView('home');

    // 로딩 표시를 위한 임시 데이터 추가 (ID는 임시로 생성)
    const tempId = "temp-" + Date.now();
    const newRecording: Recording = {
      id: tempId,
      title: "새로운 강의 분석 중...",
      subject: "기타",
      date: new Date(),
      duration,
      audioBlob: blob,
      status: 'processing',
    };

    // 임시 데이터를 목록에 추가하여 "분석 중" 상태 보여줌
    setRecordings(prev => [newRecording, ...prev]);
    
    // 분석 및 저장 프로세스 시작
    processAnalysis(tempId, blob, duration);
  };

  const processAnalysis = async (tempId: string, blob: Blob, duration: number) => {
    try {
      // (1) Gemini 분석 수행
      const result = await analyzeLectureAudio(blob);
      
      // (2) 제목 확정
      const generatedTitle = extractTitle(result.summary) || `강의 녹음 ${new Date().toLocaleTimeString()}`;

      // (3) 백엔드에 저장 (오디오 + 분석결과 한번에 전송)
      console.log("백엔드 저장 시작...");
      await saveRecording(
        generatedTitle, 
        '기타', 
        blob, 
        result
      );
      
      // (4) [핵심] 저장 완료 후 백엔드에서 '진짜 데이터'를 다시 받아와 목록 갱신
      // 이렇게 하면 임시 데이터(tempId)는 사라지고, DB의 실제 데이터(ObjectId)로 교체됩니다.
      await loadRecordings(); 
      console.log("✅ 저장 및 목록 갱신 완료");

    } catch (error) {
      console.error("분석/저장 실패:", error);
      // 에러 발생 시 해당 임시 항목을 에러 상태로 변경
      setRecordings(prev => prev.map(rec => 
        rec.id === tempId 
          ? { ...rec, status: 'error', errorMessage: 'AI 분석 또는 저장 실패' } 
          : rec
      ));
    }
  };

  const handleRetryAnalysis = async (id: string) => {
    // 재시도 로직: 필요하다면 백엔드 재전송 로직으로 수정 필요하지만, 
    // 현재는 기존 로직 유지 (오디오가 메모리에 있다면 재시도)
    const recording = recordings.find(r => r.id === id);
    if (!recording) return;

    setRecordings(prev => prev.map(r => r.id === id ? { ...r, status: 'processing', errorMessage: undefined } : r));

    try {
      let blob = (recording.audioBlob instanceof Blob) ? recording.audioBlob : undefined;
      
      if (!blob) {
        blob = await getAudio(id);
      }

      if (blob && blob instanceof Blob) {
        // 재시도 시에는 임시 ID가 아닌 실제 ID를 사용하므로 로직 분리가 필요할 수 있으나,
        // 간단하게 처리하기 위해 여기서는 재분석만 수행 (저장은 별도 처리 필요할 수 있음)
        // 일단 UI 흐름상 다시 processAnalysis를 타도록 유도
        await processAnalysis(id, blob, recording.duration);
      } else {
        throw new Error("오디오 파일을 찾을 수 없습니다.");
      }
    } catch (error) {
      console.error("Retry failed:", error);
      setRecordings(prev => prev.map(r => r.id === id ? { ...r, status: 'error', errorMessage: '재시도 실패' } : r));
    }
  };

  const {
    isRecording,
    duration,
    permissionError,
    analyser,
    startRecording,
    stopRecording
  } = useAudioRecorder({ onRecordingComplete: handleRecordingCompleteCallback });

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  useEffect(() => {
    // Initial expansion of all folders found in data
    const subjects = new Set(recordings.map(r => r.subject));
    setExpandedFolders(subjects);
  }, [recordings]); // recordings가 바뀔 때마다 폴더 목록 갱신

  // 4. [변경] 삭제 기능 (백엔드 연동)
  const deleteRecording = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    
    if (window.confirm('정말 이 강의 노트를 삭제하시겠습니까? 복구할 수 없습니다.')) {
      try {
        // (1) 백엔드에 삭제 요청
        await deleteAudio(id);
        
        // (2) 성공 시 화면 목록에서 제거
        setRecordings(prev => prev.filter(r => r.id !== id));
        
        if (selectedId === id) {
          setSelectedId(null);
        }
      } catch (error) {
        console.error("삭제 실패:", error);
        alert("삭제 중 오류가 발생했습니다.");
      }
    }
  };

  const startEditing = (e: React.MouseEvent, rec: Recording) => {
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    setEditingId(rec.id);
    setEditTitle(rec.title);
    setEditSubject(rec.subject);
    setIsDropdownOpen(false); 
  };

  const saveEdit = async () => {
    if (!editingId) return;
    // 참고: 수정 기능도 백엔드 API(PUT/PATCH)가 필요하지만, 
    // 우선 프론트엔드 상태만 변경하고 나중에 백엔드 API 추가 시 연결합니다.
    try{
      // 백엔드에 수정 요청 전송
      await updateRecording(editingId, editTitle, editSubject);

      // 성공 시 프론트엔드 목록 업데이트(화면 갱신)
      setRecordings(prev => prev.map(rec => 
      rec.id === editingId 
        ? { ...rec, title: editTitle, subject: editSubject.trim() || '기타' }
        : rec
      ));

      // 폴더 목록 갱신 로직 (기존 유지)
      if (editSubject && !expandedFolders.has(editSubject)) {
      setExpandedFolders(prev => new Set(prev).add(editSubject));
      }

      setEditingId(null); //모달 닫기

    }
    catch(error){
      console.error("수정 실패:", error);
      alert("강의 정보 수정에 실패했습니다.");
    }
    
  };

  // --- Import Logic ---
  const parseMarkdownContent = (content: string): { meta: Partial<Recording>, data: NoteData } | null => {
    try {
      const titleMatch = content.match(/^# (.*)$/m);
      const subjectMatch = content.match(/^과목: (.*)$/m);
      
      const summaryMatch = content.match(/## 📌 핵심 요약\n([\s\S]*?)(?=\n##)/);
      const termsMatch = content.match(/## 🔑 주요 용어\n([\s\S]*?)(?=\n##)/);
      const questionsMatch = content.match(/## 📝 예상 시험 문제\n([\s\S]*?)(?=\n##)/);
      const transcriptMatch = content.match(/## 💬 전체 스크립트\n([\s\S]*?)$/);

      if (!summaryMatch || !transcriptMatch) return null;

      const title = titleMatch ? titleMatch[1].trim() : '가져온 강의';
      const subject = subjectMatch ? subjectMatch[1].trim() : '기타';
      
      const summary = summaryMatch[1].trim();
      const transcript = transcriptMatch[1].trim();
      
      const keyTerms = termsMatch 
        ? termsMatch[1].split('\n').map(line => line.replace(/^-\s*/, '').trim()).filter(Boolean)
        : [];
        
      const examQuestions = questionsMatch
        ? questionsMatch[1].split('\n').map(line => line.replace(/^\d+\.\s*/, '').trim()).filter(Boolean)
        : [];

      return {
        meta: { title, subject },
        data: { summary, transcript, keyTerms, examQuestions }
      };
    } catch (e) {
      console.error("Markdown parsing error", e);
      return null;
    }
  };

  const handleImport = async () => {
    // 파일이 하나라도 없으면 함수 종료
    if (!importAudioFile && !importMdFile) return;
    
    setIsImporting(true); // 로딩 시작

    try {
      // 1. 제목 및 데이터 준비
      let initialTitle = "가져온 강의";
      // 파일 이름에서 확장자(.mp3, .md 등) 제거하여 제목으로 사용
      if (importAudioFile) initialTitle = importAudioFile.name.replace(/\.[^/.]+$/, "");
      else if (importMdFile) initialTitle = importMdFile.name.replace(/\.[^/.]+$/, "");

      // 노트 데이터 파싱 (있으면)
      let parsedNoteData: NoteData | null = null;
      let subject = '기타';

      if (importMdFile) {
        const text = await importMdFile.text();
        const parsed = parseMarkdownContent(text);
        if (parsed) {
          parsedNoteData = parsed.data;
          // 마크다운 안에 제목/과목이 있으면 그걸 우선 사용
          if (parsed.meta.title) initialTitle = parsed.meta.title;
          if (parsed.meta.subject) subject = parsed.meta.subject;
        }
      }

      // 2. [핵심] 백엔드 Import API 호출
      // 오디오만 있든, 노트만 있든, 둘 다 있든 알아서 처리됩니다.
      console.log("파일 업로드 시작...");
      await importRecording(
        initialTitle,
        subject,
        importAudioFile, // 파일 객체 (없으면 null)
        parsedNoteData   // 노트 데이터 객체 (없으면 null)
      );

      // 3. 목록 갱신 (DB에서 최신 데이터 받아오기)
      // loadRecordings 함수가 App 컴포넌트에 정의되어 있어야 합니다.
      await loadRecordings(); 
      
      // 모달 닫기 및 초기화
      setIsImportModalOpen(false);
      setImportAudioFile(null);
      setImportMdFile(null);
      
      alert("파일을 성공적으로 가져왔습니다!");

    } catch (error) {
      console.error("Import failed:", error);
      alert("파일 가져오기에 실패했습니다.");
    } finally {
      setIsImporting(false); // 로딩 끝
    }
  };

  const toggleFolder = (subject: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });
  };

  const extractTitle = (summary: string): string | null => {
    const sentences = summary.split(/[.!?]/);
    if (sentences.length > 0 && sentences[0].length < 30) {
      return sentences[0];
    }
    return null;
  };

  const getMonthLabel = (date: Date) => {
    return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' }).format(date);
  };

  const selectedRecording = recordings.find(r => r.id === selectedId);

  const groupedRecordings = useMemo(() => {
    const groups: Record<string, Recording[]> = {};
    recordings.forEach(rec => {
      const subj = rec.subject || '기타';
      if (!groups[subj]) groups[subj] = [];
      groups[subj].push(rec);
    });
    return groups;
  }, [recordings]);

  const sortedSubjects = Object.keys(groupedRecordings).sort();

  return (
    <div className="flex h-screen bg-slate-50 relative overflow-hidden">
      {/* Sidebar / List View */}
      <aside className={`w-full md:w-80 bg-white border-r border-slate-200 flex-col flex ${selectedId ? 'hidden md:flex' : 'flex'} ${view === 'recording' ? 'hidden md:flex' : ''}`}>
        <div className="p-5 border-b border-slate-100 bg-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Sparkles className="text-indigo-600" size={24} />
            <h1 className="text-xl font-bold text-slate-800">ProfNote AI</h1>
          </div>
          <button 
            onClick={() => setIsImportModalOpen(true)}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="파일 가져오기"
          >
            <Upload size={20} />
          </button>
        </div>

        {/* Action Button */}
        <div className="p-4">
          <button
            onClick={() => {
              setSelectedId(null);
              setView('recording');
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-medium shadow-md transition-all active:scale-95"
          >
            <Mic size={20} />
            {isRecording ? "녹음 화면으로 이동" : "새 강의 녹음하기"}
          </button>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto px-2 pb-24 md:pb-4 space-y-4">
          {recordings.length === 0 && (
            <div className="text-center py-10 px-4 text-slate-400 text-sm">
              <p>아직 녹음된 강의가 없습니다.</p>
              <p className="mt-1">첫 번째 강의를 기록해보세요!</p>
            </div>
          )}

          {sortedSubjects.map(subject => {
            // Sort recordings by date descending (Newest first)
            const subjectRecordings = groupedRecordings[subject].sort((a, b) => b.date.getTime() - a.date.getTime());
            
            return (
              <div key={subject} className="mb-2">
                <button 
                  onClick={() => toggleFolder(subject)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors text-sm font-semibold uppercase tracking-wider mb-1"
                >
                  {expandedFolders.has(subject) ? <FolderOpen size={16} /> : <Folder size={16} />}
                  {subject}
                  <span className="text-xs font-normal ml-auto bg-slate-100 px-2 py-0.5 rounded-full">
                    {subjectRecordings.length}
                  </span>
                </button>

                {expandedFolders.has(subject) && (
                  <div className="space-y-1 pl-2">
                    {subjectRecordings.map((rec, index, array) => {
                      const currentMonth = getMonthLabel(rec.date);
                      const prevMonth = index > 0 ? getMonthLabel(array[index - 1].date) : null;
                      // Show header if it's the first item OR if month changed from previous item
                      const showHeader = index === 0 || currentMonth !== prevMonth;

                      return (
                        <React.Fragment key={rec.id}>
                          {showHeader && (
                             <div className="flex items-center gap-2 py-3 pr-2 pl-1 select-none">
                               <div className="h-px bg-slate-200 flex-1"></div>
                               <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{currentMonth}</span>
                               <div className="h-px bg-slate-200 flex-1"></div>
                             </div>
                          )}
                          <div className="relative group pr-2">
                            <button
                              onClick={() => {
                                setSelectedId(rec.id);
                                setView('home');
                              }}
                              className={`w-full text-left p-3 rounded-lg transition-colors flex items-start gap-3 border ${
                                selectedId === rec.id 
                                  ? 'bg-indigo-50 border-indigo-100 shadow-sm' 
                                  : 'hover:bg-slate-50 border-transparent'
                              }`}
                            >
                              <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                                rec.status === 'completed' ? 'bg-emerald-500' : 
                                rec.status === 'processing' ? 'bg-amber-400 animate-pulse' : 
                                rec.status === 'recorded' ? 'bg-blue-400' : 'bg-red-400'
                              }`} />
                              
                              <div className="flex-1 min-w-0 pr-14">
                                <h4 className={`font-medium text-sm truncate ${selectedId === rec.id ? 'text-indigo-900' : 'text-slate-700'}`}>
                                  {rec.title}
                                </h4>
                                <div className="flex items-center justify-between mt-1 text-xs text-slate-500">
                                  <span>{formatDate(rec.date)}</span>
                                  <span>{formatTime(rec.duration)}</span>
                                </div>
                                {rec.status === 'processing' && (
                                  <div className="mt-2 text-xs text-amber-600 flex items-center gap-1 bg-amber-50 px-2 py-1 rounded w-fit">
                                    <Loader2 size={10} className="animate-spin" />
                                    AI 분석 중...
                                  </div>
                                )}
                                {rec.status === 'error' && (
                                  <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                                    <AlertCircle size={10} />
                                    {rec.errorMessage || "분석 실패"}
                                  </div>
                                )}
                                {rec.status === 'recorded' && (
                                  <div className="mt-2 text-xs text-blue-600 flex items-center gap-1">
                                    <Sparkles size={10} />
                                    분석 대기 중
                                  </div>
                                )}
                              </div>
                            </button>
                            
                            <div className="absolute right-2 top-2 flex items-center gap-1 z-20">
                              <div className="flex bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-slate-100 p-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                  <button 
                                    onClick={(e) => startEditing(e, rec)}
                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                    title="제목/폴더 수정"
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  <div className="w-px bg-slate-200 my-1"></div>
                                  <button 
                                    onClick={(e) => deleteRecording(e, rec.id)}
                                    className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-colors"
                                    title="삭제"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col h-full bg-slate-50 relative ${!selectedId && view !== 'recording' ? 'hidden md:flex' : 'flex'}`}>
        
        {view === 'recording' ? (
           <div className="h-full flex flex-col">
              <div className="md:hidden p-4">
                <button onClick={() => setView('home')} className="text-slate-500 hover:text-slate-800">
                   뒤로가기
                </button>
              </div>
              <Recorder 
                isRecording={isRecording}
                duration={duration}
                analyser={analyser}
                permissionError={permissionError}
                onToggleRecording={toggleRecording}
              />
           </div>
        ) : selectedRecording ? (
          <NoteDetail 
            recording={selectedRecording} 
            onBack={() => setSelectedId(null)}
            onRetry={() => handleRetryAnalysis(selectedRecording.id)}
          />
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
              <List size={40} className="text-slate-300" />
            </div>
            <p className="text-lg font-medium text-slate-500">강의를 선택하여 노트를 확인하세요</p>
            <p className="text-sm">좌측 목록에서 강의를 선택하거나 새로운 녹음을 시작하세요.</p>
          </div>
        )}
      </main>

      {/* Floating Bottom Recording Bar (Mini Player) */}
      {isRecording && view !== 'recording' && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-in slide-in-from-bottom-5 duration-300">
          <div className="max-w-3xl mx-auto bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl p-3 flex items-center justify-between border border-white/10 ring-1 ring-black/5">
            <div 
              className="flex items-center gap-4 flex-1 cursor-pointer group"
              onClick={() => {
                setSelectedId(null);
                setView('recording');
              }}
            >
              <div className="relative w-10 h-10 flex items-center justify-center bg-indigo-500 rounded-full shrink-0 group-hover:bg-indigo-400 transition-colors">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <Mic size={20} className="relative z-10" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200 group-hover:text-white">강의 녹음 중...</p>
                <p className="font-mono text-lg font-bold leading-none tracking-wide text-indigo-200">{formatTime(duration)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  setSelectedId(null);
                  setView('recording');
                }}
                className="hidden sm:flex p-2 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition-colors"
                title="녹음 화면 열기"
              >
                <ChevronUp size={24} />
              </button>
              <button 
                onClick={stopRecording}
                className="p-3 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors shadow-lg flex items-center justify-center"
                title="녹음 종료"
              >
                <StopCircle size={24} fill="currentColor" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal Overlay */}
      {editingId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900">강의 정보 수정</h3>
              <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">강의 제목</label>
                <input 
                  type="text" 
                  value={editTitle} 
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="강의 제목을 입력하세요"
                  autoFocus
                />
              </div>
              
              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-1">과목 (폴더명)</label>
                <div className="relative" ref={dropdownRef}>
                  <input 
                    type="text" 
                    value={editSubject} 
                    onChange={(e) => setEditSubject(e.target.value)}
                    onFocus={() => setIsDropdownOpen(true)}
                    className="w-full pl-10 pr-10 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    placeholder="예: 컴퓨터구조, 경영학개론"
                  />
                  <Folder className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <button 
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 outline-none"
                    tabIndex={-1}
                  >
                    <ChevronDown size={16} className={`transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Custom Dropdown List */}
                  {isDropdownOpen && sortedSubjects.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                      {sortedSubjects.map(s => (
                        <div 
                          key={s}
                          onMouseDown={(e) => {
                            e.preventDefault(); // Prevents the input from losing focus immediately
                            setEditSubject(s);
                            setIsDropdownOpen(false);
                          }}
                          className="px-4 py-2.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer flex items-center gap-2 transition-colors border-b border-slate-50 last:border-none"
                        >
                          <Folder size={14} />
                          {s}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setEditingId(null)}
                className="flex-1 px-4 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors"
              >
                취소
              </button>
              <button 
                onClick={saveEdit}
                className="flex-1 px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Check size={18} />
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal Overlay */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <Upload size={24} className="text-indigo-600" />
                <h3 className="text-lg font-bold text-slate-900">파일 가져오기</h3>
              </div>
              <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            <p className="text-slate-500 text-sm mb-6">
              녹음 파일(필수)과 기존 노트 파일(선택)을 업로드하여 목록에 추가합니다.
            </p>
            
            <div className="space-y-4">
              {/* Audio Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  녹음 파일 <span className="text-slate-400 font-normal">(선택)</span>
                </label>
                <div className={`border-2 border-dashed rounded-xl p-4 transition-colors ${importAudioFile ? 'border-indigo-300 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400'}`}>
                   <input 
                     type="file" 
                     id="audio-upload"
                     accept="audio/*"
                     className="hidden"
                     onChange={(e) => setImportAudioFile(e.target.files?.[0] || null)}
                   />
                   <label htmlFor="audio-upload" className="flex flex-col items-center justify-center cursor-pointer">
                      {importAudioFile ? (
                        <div className="flex items-center gap-2 text-indigo-700">
                           <FileAudio size={20} />
                           <span className="truncate max-w-[200px] text-sm font-medium">{importAudioFile.name}</span>
                        </div>
                      ) : (
                        <>
                           <Upload size={24} className="text-slate-400 mb-2" />
                           <span className="text-sm text-slate-500">오디오 파일 선택 (mp3, webm 등)</span>
                        </>
                      )}
                   </label>
                </div>
              </div>

              {/* MD Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  노트 파일 (.md) <span className="text-slate-400 font-normal">(선택)</span>
                </label>
                <div className={`border-2 border-dashed rounded-xl p-4 transition-colors ${importMdFile ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 hover:border-emerald-400'}`}>
                   <input 
                     type="file" 
                     id="md-upload"
                     accept=".md,.txt"
                     className="hidden"
                     onChange={(e) => setImportMdFile(e.target.files?.[0] || null)}
                   />
                   <label htmlFor="md-upload" className="flex flex-col items-center justify-center cursor-pointer">
                      {importMdFile ? (
                        <div className="flex items-center gap-2 text-emerald-700">
                           <FileText size={20} />
                           <span className="truncate max-w-[200px] text-sm font-medium">{importMdFile.name}</span>
                        </div>
                      ) : (
                        <>
                           <FileText size={24} className="text-slate-400 mb-2" />
                           <span className="text-sm text-slate-500">마크다운 파일 선택</span>
                        </>
                      )}
                   </label>
                </div>
                <p className="text-xs text-slate-400 mt-1">노트 파일을 함께 업로드하면 내용을 즉시 확인할 수 있습니다.</p>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setIsImportModalOpen(false)}
                className="flex-1 px-4 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors"
                disabled={isImporting}
              >
                취소
              </button>
              <button 
                onClick={handleImport}
                disabled={(!importAudioFile && !importMdFile) || isImporting}
                className={`flex-1 px-4 py-2 text-white rounded-lg font-medium shadow-md transition-all flex items-center justify-center gap-2 ${
                  (!importAudioFile && !importMdFile) || isImporting 
                  ? 'bg-slate-300 cursor-not-allowed' 
                  : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'
                }`}
              >
                {isImporting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    처리 중...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    가져오기
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
// services/storageService.ts
import { NoteData } from '../types'; // types.ts 경로에 맞춰 수정해주세요

// 백엔드 주소 (Vite 프록시를 안 쓸 경우 직접 지정)
const API_BASE_URL = 'http://localhost:8080/api/recordings';

// 1. 녹음 파일과 결과 저장 (백엔드로 전송)
// 기존 saveAudio 함수를 대체합니다. 이제 제목, 과목, 분석데이터를 함께 보냅니다.
export const saveRecording = async (
  title: string,
  subject: string,
  audioBlob: Blob,
  noteData: NoteData
): Promise<void> => {
  const formData = new FormData();
  formData.append('title', title);
  formData.append('subject', subject);
  // 파일 이름은 'recording.webm'으로 고정하거나 동적으로 생성해도 됩니다.
  formData.append('file', audioBlob, 'recording.webm');
  formData.append('noteData', JSON.stringify(noteData));

  try {
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`서버 저장 실패: ${response.status}`);
    }
  } catch (error) {
    console.error('녹음 저장 중 오류 발생:', error);
    throw error;
  }
};

// 2. 전체 녹음 목록 가져오기
export const getAllRecordings = async (): Promise<any[]> => {
  try {
    const response = await fetch(API_BASE_URL);
    if (!response.ok) {
      throw new Error('목록 불러오기 실패');
    }
    return await response.json();
  } catch (error) {
    console.error('목록 조회 중 오류:', error);
    return [];
  }
};

// 3. 특정 녹음 상세 정보 가져오기
export const getRecording = async (id: string): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/${id}`);
  if (!response.ok) {
    throw new Error('상세 정보 불러오기 실패');
  }
  return await response.json();
};

// 4. 오디오 파일 URL 생성 (HTML audio 태그용)
export const getAudioUrl = (id: string): string => {
  return `${API_BASE_URL}/${id}/audio`;
};

// 5. 삭제 기능 (백엔드에 삭제 요청 전송)
export const deleteAudio = async (id: string): Promise<void> => {
  // DELETE 메서드로 백엔드에 요청을 보냅니다.
  const response = await fetch(`${API_BASE_URL}/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('삭제 실패');
  }
};


// 6. 오디오 파일 Blob으로 가져오기 (App.tsx, NoteDetail.tsx에서 사용)
export const getAudio = async (id: string): Promise<Blob> => {
  const response = await fetch(`${API_BASE_URL}/${id}/audio`);
  if (!response.ok) {
    throw new Error('오디오 파일 불러오기 실패');
  }
  return await response.blob();
};


// 7. 녹음 정보 업데이트 (제목, 과목 등)
export const updateRecording = async (
  id: string,
  title: string,
  subject: string
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, subject }),
  });

  if (!response.ok) {
    throw new Error('업데이트 실패');
  }
};

// 8. 파일 가져오기 (Import)
export const importRecording = async (
  title: string,
  subject: string,
  audioFile: File | null,
  noteData: NoteData | null
): Promise<void> => {
  const formData = new FormData();
  formData.append('title', title);
  formData.append('subject', subject);
  
  // 파일이 있을 때만 추가
  if (audioFile) {
    formData.append('file', audioFile);
  }
  
  // 노트 데이터가 있을 때만 추가
  if (noteData) {
    formData.append('noteData', JSON.stringify(noteData));
  }

  const response = await fetch(`${API_BASE_URL}/import`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('파일 가져오기 실패');
  }
};
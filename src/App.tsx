/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Play, 
  Globe, 
  Settings, 
  Save, 
  ChevronLeft, 
  Image as ImageIcon,
  Heart,
  Timer,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  RefreshCw,
  Navigation,
  BookOpen,
  Map as MapIcon,
  MousePointer2,
  Zap,
  Pentagon,
  Upload
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { MapContainer, TileLayer, Marker as LeafletMarker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// --- Types ---

type Point = { x: number; y: number };

type Marker = {
  id: string;
  x: number; // percentage 0-100 (for Image mode center or start)
  y: number; // percentage 0-100 (for Image mode center or start)
  lat?: number; // for Atlas mode
  lng?: number; // for Atlas mode
  name: string;
  description: string;
  feedback: string;
  type: 'point' | 'polygon';
  polygon?: Point[]; // for Image mode polygons
  latlngs?: { lat: number; lng: number }[]; // for Atlas mode polygons
};

type QuizConfig = {
  id: string;
  title: string;
  type: 'image' | 'atlas';
  imageUrl?: string;
  markers: Marker[];
  mode: 'play' | 'explore';
  timeLimit: number | null;
  lives: number | null;
  updatedAt: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
};

type GameState = {
  status: 'idle' | 'playing' | 'feedback' | 'gameover' | 'success';
  currentMarkerIndex: number;
  score: number;
  livesRemaining: number;
  timeLeft: number;
  selectedMarkerId: string | null;
};

// --- Utils ---

const generateId = () => Math.random().toString(36).substring(2, 9);

function isPointInPolygon(point: Point, polygon: Point[]) {
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y))
        && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
  }
  return isInside;
}

const INITIAL_QUIZ: QuizConfig = {
  id: generateId(),
  title: 'Lost Empires of the East',
  type: 'atlas',
  markers: [
    { id: '1', lat: 34.05, lng: 74.8, type: 'point', name: 'Kushant Empire', description: 'Center of the Silk Road influence', feedback: 'Correct! This was the heart of the Kushan power.', x: 0, y: 0 },
    { id: '2', lat: 21.0, lng: 78.0, type: 'point', name: 'Satavahana Dynasty', description: 'Ancient dynasty in the Deccan region', feedback: 'Correct! They were known for their distinct coinage.', x: 0, y: 0 },
    { id: '3', lat: 10.8, lng: 78.7, type: 'point', name: 'Chola Dynasty', description: 'Dominant maritime empire of South India', feedback: 'Correct! The Cholas were masters of the sea.', x: 0, y: 0 },
  ],
  mode: 'play',
  timeLimit: 90,
  lives: 3,
  difficulty: 'Medium',
  updatedAt: Date.now(),
};

// --- Components ---

export default function App() {
  const [view, setView] = useState<'home' | 'editor' | 'player'>('home');
  const [quizzes, setQuizzes] = useState<QuizConfig[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<QuizConfig | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('mapmaster_quizzes_v2');
    if (saved) {
      try {
        setQuizzes(JSON.parse(saved));
      } catch (e) {
        setQuizzes([INITIAL_QUIZ]);
      }
    } else {
      setQuizzes([INITIAL_QUIZ]);
      localStorage.setItem('mapmaster_quizzes_v2', JSON.stringify([INITIAL_QUIZ]));
    }
  }, []);

  const saveQuizzes = (updatedQuizzes: QuizConfig[]) => {
    setQuizzes(updatedQuizzes);
    localStorage.setItem('mapmaster_quizzes_v2', JSON.stringify(updatedQuizzes));
  };

  const handleCreateNew = (type: 'image' | 'atlas') => {
    const newQuiz: QuizConfig = {
      id: generateId(),
      title: type === 'atlas' ? 'Unnamed Atlas' : 'New Diagram',
      type,
      imageUrl: type === 'image' ? 'https://picsum.photos/seed/diagram/1200/800' : undefined,
      markers: [],
      mode: 'play',
      timeLimit: null,
      lives: 3,
      difficulty: 'Easy',
      updatedAt: Date.now(),
    };
    setActiveQuiz(newQuiz);
    setView('editor');
  };

  const handleDelete = (id: string) => {
    const next = quizzes.filter(q => q.id !== id);
    saveQuizzes(next);
  };

  return (
    <div className="min-h-screen bg-[#F5F2ED] text-[#2C2C2E] font-serif selection:bg-[#5A5A40]/20">
      <AnimatePresence mode="wait">
        {view === 'home' && (
          <motion.div
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="max-w-6xl mx-auto px-8 py-16"
          >
            <header className="mb-20 text-center">
              <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 bg-[#5A5A40]/10 rounded-full text-[#5A5A40] text-xs font-bold tracking-[0.2em] uppercase">
                <Globe size={14} />
                MapMaster Atlas
              </div>
              <h1 className="text-7xl font-display font-bold italic tracking-tight mb-6">Chart the Unknown.</h1>
              <p className="text-xl text-[#2C2C2E]/60 max-w-2xl mx-auto font-serif italic">
                From ancient history to modern biological diagrams, create concept-driven interactive maps that bridge the gap between vision and knowledge.
              </p>
              
              <div className="mt-12 flex justify-center gap-4">
                <button
                  onClick={() => handleCreateNew('atlas')}
                  className="flex items-center gap-3 bg-[#5A5A40] text-white px-8 py-4 rounded-full hover:bg-[#4A4A30] transition-all active:scale-95 shadow-xl shadow-[#5A5A40]/20 font-sans font-bold"
                >
                  <Plus size={20} />
                  New Geographic Atlas
                </button>
                <button
                  onClick={() => handleCreateNew('image')}
                  className="flex items-center gap-3 bg-white border border-[#5A5A40]/20 text-[#5A5A40] px-8 py-4 rounded-full hover:bg-white hover:border-[#5A5A40] transition-all active:scale-95 shadow-lg shadow-black/[0.02] font-sans font-bold"
                >
                  <ImageIcon size={20} />
                  New Diagram Activity
                </button>
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {quizzes.map((quiz) => (
                <QuizCard 
                  key={quiz.id} 
                  quiz={quiz} 
                  onEdit={() => { setActiveQuiz(quiz); setView('editor'); }} 
                  onPlay={() => { setActiveQuiz(quiz); setView('player'); }}
                  onDelete={() => handleDelete(quiz.id)}
                />
              ))}
            </div>
          </motion.div>
        )}

        {view === 'editor' && activeQuiz && (
          <Editor 
            key={`editor-${activeQuiz.id}`}
            quiz={activeQuiz} 
            onBack={() => setView('home')} 
            onSave={(updated) => {
              const exists = quizzes.find(q => q.id === updated.id);
              const nextQuizzes = exists 
                ? quizzes.map(q => q.id === updated.id ? updated : q)
                : [updated, ...quizzes];
              saveQuizzes(nextQuizzes);
              setView('home');
            }}
          />
        )}

        {view === 'player' && activeQuiz && (
          <Player 
            key={`player-${activeQuiz.id}`}
            quiz={activeQuiz} 
            onBack={() => setView('home')} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-components ---

function QuizCard({ quiz, onEdit, onPlay, onDelete }: { 
  quiz: QuizConfig; 
  onEdit: () => void; 
  onPlay: () => void;
  onDelete: () => void;
  key?: React.Key;
}) {
  return (
    <motion.div
      whileHover={{ y: -8 }}
      className="bg-white rounded-[2rem] border border-[#5A5A40]/10 p-6 shadow-sm hover:shadow-2xl hover:shadow-[#5A5A40]/10 transition-all flex flex-col group"
    >
      <div className="relative aspect-[4/3] rounded-2xl overflow-hidden mb-6 bg-[#F5F2ED]">
        {quiz.type === 'atlas' ? (
          <div className="w-full h-full flex items-center justify-center bg-indigo-50/50">
            <Globe size={48} className="text-indigo-200" />
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent" />
          </div>
        ) : (
          <img 
            src={quiz.imageUrl} 
            alt={quiz.title} 
            className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all"
            referrerPolicy="no-referrer"
          />
        )}
        <div className="absolute top-4 right-4 flex gap-2">
           <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-2.5 bg-white/90 backdrop-blur-md rounded-full text-red-400 hover:bg-red-500 hover:text-white transition-all shadow-sm"
          >
            <Trash2 size={16} />
          </button>
        </div>
        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] text-[#5A5A40]">
           {quiz.type === 'atlas' ? 'Cartographic' : 'Diagram'}
        </div>
      </div>
      
      <h3 className="text-2xl font-display font-bold italic mb-3">{quiz.title}</h3>
      
      <div className="flex items-center gap-4 mb-8">
        <div className="flex items-center gap-1.5 text-xs text-[#5A5A40]/60 font-sans font-semibold">
          <BookOpen size={14} />
          <span>{quiz.markers.length} Insights</span>
        </div>
        <div className="px-2 py-0.5 rounded bg-[#5A5A40]/5 text-[#5A5A40] text-[10px] font-bold uppercase tracking-tighter">
          {quiz.difficulty}
        </div>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-3">
        <button
          onClick={onEdit}
          className="flex items-center justify-center gap-2 py-3 px-4 bg-[#F5F2ED] text-[#5A5A40] rounded-2xl hover:bg-[#5A5A40]/10 transition-colors font-sans font-bold text-sm"
        >
          <Settings size={18} />
          Configure
        </button>
        <button
          onClick={onPlay}
          className="flex items-center justify-center gap-2 py-3 px-4 bg-[#5A5A40] text-white rounded-2xl hover:bg-[#4A4A30] transition-all active:scale-95 shadow-lg shadow-[#5A5A40]/10 font-sans font-bold text-sm"
        >
          <Play size={18} fill="white" />
          Venture
        </button>
      </div>
    </motion.div>
  );
}

function Editor({ quiz, onBack, onSave }: { quiz: QuizConfig; onBack: () => void; onSave: (q: QuizConfig) => void; key?: React.Key }) {
  const [formData, setFormData] = useState<QuizConfig>(quiz);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [drawMode, setDrawMode] = useState<'point' | 'polygon'>('point');
  const imageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeMarker = useMemo(() => 
    formData.markers.find(m => m.id === selectedMarkerId), 
    [formData.markers, selectedMarkerId]
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFormData(prev => ({ ...prev, imageUrl: ev.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleImageClick = (e: React.MouseEvent) => {
    if (formData.type === 'atlas') return;
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (drawMode === 'polygon' && activeMarker && activeMarker.type === 'polygon') {
      // Add point to existing polygon
      const currentPoly = activeMarker.polygon || [];
      updateMarker(activeMarker.id, { polygon: [...currentPoly, { x, y }] });
      return;
    }

    const newMarker: Marker = {
      id: generateId(),
      x,
      y,
      type: drawMode,
      polygon: drawMode === 'polygon' ? [{ x, y }] : undefined,
      name: drawMode === 'polygon' ? `Region ${formData.markers.length + 1}` : `POI ${formData.markers.length + 1}`,
      description: '',
      feedback: 'Excellent discovery.'
    };

    setFormData(prev => ({ ...prev, markers: [...prev.markers, newMarker] }));
    setSelectedMarkerId(newMarker.id);
  };

  const MapEvents = () => {
    useMapEvents({
      click(e) {
        const newMarker: Marker = {
          id: generateId(),
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          type: 'point',
          x: 0,
          y: 0,
          name: `Uncharted Area ${formData.markers.length + 1}`,
          description: '',
          feedback: 'Accurate navigation!'
        };
        setFormData(prev => ({ ...prev, markers: [...prev.markers, newMarker] }));
        setSelectedMarkerId(newMarker.id);
      },
    });
    return null;
  };

  const updateMarker = (id: string, updates: Partial<Marker>) => {
    setFormData(prev => ({
      ...prev,
      markers: prev.markers.map(m => m.id === id ? { ...m, ...updates } : m)
    }));
  };

  const deleteMarker = (id: string) => {
    setFormData(prev => ({
      ...prev,
      markers: prev.markers.filter(m => m.id !== id)
    }));
    if (selectedMarkerId === id) setSelectedMarkerId(null);
  };

  const handleSuggestLabels = async () => {
    if (!process.env.GEMINI_API_KEY) return;
    setIsAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = formData.type === 'atlas' 
        ? `I am creating a geographic atlas activity titled "${formData.title}". 
           Suggest 4 key historical or geographic coordinates relevant to this topic.
           Provide lat/lng coordinates and meaningful descriptions.
           Return ONLY a JSON array of objects with 'name', 'description', 'lat', 'lng' properties.`
        : `Analyze this image URL: ${formData.imageUrl}. 
           Suggest 4 key anatomical or mechanical parts to identify.
           Return ONLY a JSON array of objects with 'name', 'description' properties.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ text: prompt }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                lat: { type: Type.NUMBER },
                lng: { type: Type.NUMBER }
              }
            }
          }
        }
      });

      const suggestions = JSON.parse(response.text || '[]');
      const newMarkers = suggestions.map((s: any, idx: number) => ({
        id: generateId(),
        x: 40 + (idx * 5),
        y: 40 + (idx * 5),
        type: 'point',
        lat: s.lat || 0,
        lng: s.lng || 0,
        name: s.name,
        description: s.description,
        feedback: `Indeed, this is ${s.name}.`
      }));

      setFormData(prev => ({ ...prev, markers: [...prev.markers, ...newMarkers] }));
    } catch (e) {
      console.error("AI Error:", e);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Sidebar */}
      <div className="w-[22rem] border-r border-[#5A5A40]/10 flex flex-col bg-[#F5F2ED]/50 backdrop-blur-3xl">
        <div className="p-8 pb-4">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-[#5A5A40]/60 hover:text-[#5A5A40] mb-8 transition-colors font-sans font-bold uppercase tracking-widest"
          >
            <ChevronLeft size={16} />
            Dashboard
          </button>
          
          <div className="space-y-6">
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] font-black text-[#5A5A40]/40 mb-2 block">Manuscript Title</label>
              <input 
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                className="w-full bg-white border border-[#5A5A40]/10 rounded-2xl px-5 py-3 text-lg font-display italic focus:ring-2 focus:ring-[#5A5A40] outline-none transition-all"
                placeholder="Empire of the Sun..."
              />
            </div>
            
            {formData.type === 'image' && (
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] font-black text-[#5A5A40]/40 mb-2 block">Map Artwork</label>
                  <div className="flex gap-2">
                    <input 
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-[#5A5A40]/10 rounded-2xl hover:bg-white hover:border-[#5A5A40] transition-all font-sans font-bold text-xs text-[#5A5A40]"
                    >
                      <Upload size={14} />
                      Upload Blank Map
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] font-black text-[#5A5A40]/40 mb-2 block">Illustration Source (URL)</label>
                  <input 
                    value={formData.imageUrl || ''}
                    onChange={e => setFormData({ ...formData, imageUrl: e.target.value })}
                    className="w-full bg-white border border-[#5A5A40]/10 rounded-2xl px-5 py-3 text-sm font-serif focus:ring-2 focus:ring-[#5A5A40] outline-none transition-all"
                    placeholder="https://..."
                  />
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-3">
               <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] font-black text-[#5A5A40]/40 mb-2 block">Difficulty</label>
                  <select 
                    value={formData.difficulty}
                    onChange={e => setFormData({ ...formData, difficulty: e.target.value as any })}
                    className="w-full bg-white border border-[#5A5A40]/10 rounded-2xl px-3 py-2.5 text-sm font-sans font-bold outline-none"
                  >
                    <option>Easy</option>
                    <option>Medium</option>
                    <option>Hard</option>
                  </select>
               </div>
               <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] font-black text-[#5A5A40]/40 mb-2 block">Lives</label>
                  <input 
                    type="number"
                    value={formData.lives || 0}
                    onChange={e => setFormData({ ...formData, lives: Math.max(1, Number(e.target.value)) })}
                    className="w-full bg-white border border-[#5A5A40]/10 rounded-2xl px-3 py-2.5 text-sm font-sans font-bold outline-none"
                  />
               </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 pt-4 space-y-8">
          {formData.type === 'image' && (
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] font-black text-[#5A5A40]/40 mb-4 block">Cartography Tools</label>
              <div className="flex bg-white rounded-2xl border border-[#5A5A40]/10 p-1 shadow-sm">
                <button 
                  onClick={() => setDrawMode('point')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all font-sans font-bold text-xs ${drawMode === 'point' ? 'bg-[#5A5A40] text-white shadow-lg' : 'text-[#5A5A40]/60 hover:bg-[#F5F2ED]'}`}
                >
                  <MousePointer2 size={14} />
                  Point
                </button>
                <button 
                  onClick={() => setDrawMode('polygon')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all font-sans font-bold text-xs ${drawMode === 'polygon' ? 'bg-[#5A5A40] text-white shadow-lg' : 'text-[#5A5A40]/60 hover:bg-[#F5F2ED]'}`}
                >
                  <Pentagon size={14} />
                  Region
                </button>
              </div>
              {drawMode === 'polygon' && activeMarker?.type === 'polygon' && (
                <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                   <p className="text-[11px] text-indigo-700 font-medium leading-relaxed mb-2">
                     Drawing <strong>{activeMarker.name}</strong>. Click the map to add vertices.
                   </p>
                   <button 
                    onClick={() => setSelectedMarkerId(null)}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-xl font-sans font-bold text-[10px] uppercase tracking-widest"
                   >
                     Finish Drawing
                   </button>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="flex justify-between items-center mb-6">
               <label className="text-[10px] uppercase tracking-[0.2em] font-black text-[#5A5A40]/40">Insights List</label>
               <button 
                  onClick={handleSuggestLabels}
                  disabled={isAiLoading || !process.env.GEMINI_API_KEY}
                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#5A5A40] hover:text-black disabled:opacity-30 transition-all"
               >
                 {isAiLoading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                 Curate with AI
               </button>
            </div>
            <div className="space-y-3">
              {formData.markers.map((m, idx) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMarkerId(m.id)}
                  className={`w-full text-left p-4 rounded-2xl text-sm transition-all flex items-center justify-between group border ${selectedMarkerId === m.id ? 'bg-[#5A5A40] border-[#5A5A40] text-white shadow-xl' : 'bg-white border-[#5A5A40]/10 hover:border-[#5A5A40]/30'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold ${selectedMarkerId === m.id ? 'bg-white/20' : 'bg-[#5A5A40]/5 text-[#5A5A40]'}`}>
                      {idx + 1}
                    </span>
                    <span className="truncate max-w-[120px] font-display italic font-semibold">{m.name}</span>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteMarker(m.id); }}
                    className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ${selectedMarkerId === m.id ? 'hover:bg-white/10' : 'hover:bg-red-50 text-red-400'}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-8 border-t border-[#5A5A40]/10 bg-white">
          <button
            onClick={() => onSave(formData)}
            className="w-full flex items-center justify-center gap-3 bg-[#5A5A40] text-white py-4 rounded-2xl hover:bg-[#4A4A30] transition-all active:scale-[0.98] shadow-2xl shadow-[#5A5A40]/20 font-sans font-bold"
          >
            <Save size={20} />
            Commit to Atlas
          </button>
        </div>
      </div>

      {/* Editor Main */}
      <div className="flex-1 bg-white p-4 md:p-8 lg:p-12 flex flex-col relative overflow-hidden">
        <div className="bg-[#F5F2ED] rounded-[3rem] shadow-2xl shadow-[#5A5A40]/10 overflow-hidden flex-1 relative flex items-center justify-center border-8 border-white p-2 md:p-4">
          {formData.type === 'atlas' ? (
            <MapContainer center={[20, 78]} zoom={4} zoomControl={false} className="z-10 bg-blue-50 w-full h-full rounded-[2rem]">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapEvents />
              {formData.markers.map(m => (
                m.lat !== undefined && m.lng !== undefined && (
                  <LeafletMarker 
                    key={m.id} 
                    position={[m.lat, m.lng]}
                    eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); setSelectedMarkerId(m.id); } }}
                    icon={L.divIcon({
                      className: 'atlas-marker-icon',
                      html: `<div class="w-8 h-8 rounded-full border-4 border-white shadow-xl flex items-center justify-center font-bold text-[10px] text-white ${selectedMarkerId === m.id ? 'bg-black scale-125' : 'bg-red-500'}">${formData.markers.indexOf(m) + 1}</div>`
                    })}
                  />
                )
              ))}
            </MapContainer>
          ) : (
            <div className="relative inline-block max-h-full cursor-crosshair group" ref={imageRef} onClick={handleImageClick}>
               <img src={formData.imageUrl} className="max-h-[75vh] w-auto pointer-events-none rounded-xl" referrerPolicy="no-referrer" />
               <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                 {formData.markers.filter(m => m.type === 'polygon' && m.polygon).map(m => (
                   <polygon
                    key={`poly-${m.id}`}
                    points={m.polygon!.map(p => `${p.x}% ${p.y}%`).join(', ')}
                    className={`transition-all ${selectedMarkerId === m.id ? 'fill-[#5A5A40]/40 stroke-[#5A5A40] stroke-2' : 'fill-black/10 stroke-black/20 stroke-1'}`}
                   />
                 ))}
               </svg>
               {formData.markers.map(m => (
                 <motion.div
                   key={m.id}
                   style={{ left: `${m.x}%`, top: `${m.y}%` }}
                   className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-4 border-white shadow-2xl flex items-center justify-center transition-all ${selectedMarkerId === m.id ? 'bg-black scale-125 z-20' : 'bg-red-500 z-10 hover:scale-110'}`}
                   onClick={(e) => { e.stopPropagation(); setSelectedMarkerId(m.id); }}
                 >
                   <span className="text-white text-[10px] font-bold">{formData.markers.indexOf(m) + 1}</span>
                 </motion.div>
               ))}
               <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-md text-white px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                 {drawMode === 'polygon' ? 'Click to draw region' : 'Identify a Point'}
               </div>
            </div>
          )}
        </div>

        {/* Floating Sidebar Inspector */}
        <AnimatePresence>
          {activeMarker && (
            <motion.div
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 100, opacity: 0 }}
              className="absolute right-16 top-16 bottom-16 w-96 bg-white border border-[#5A5A40]/10 rounded-[2.5rem] shadow-2xl p-8 space-y-6 z-50 flex flex-col"
            >
              <div className="flex justify-between items-center pb-4 border-b border-[#5A5A40]/10">
                <h4 className="font-display italic font-bold text-2xl">Insight #{formData.markers.indexOf(activeMarker) + 1}</h4>
                <button onClick={() => setSelectedMarkerId(null)} className="p-2 text-[#5A5A40]/40 hover:text-black">
                   <XCircle size={24} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] font-black text-[#5A5A40]/40 mb-2 block">Nomen (Label)</label>
                  <input 
                    value={activeMarker.name}
                    onChange={e => updateMarker(activeMarker.id, { name: e.target.value })}
                    className="w-full bg-[#F5F2ED]/50 border-none rounded-2xl px-5 py-4 font-display italic font-semibold focus:ring-2 focus:ring-[#5A5A40] outline-none"
                    placeholder="e.g. Byzantine..."
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] font-black text-[#5A5A40]/40 mb-2 block">Hint / Concept</label>
                  <textarea 
                    value={activeMarker.description}
                    onChange={e => updateMarker(activeMarker.id, { description: e.target.value })}
                    className="w-full bg-[#F5F2ED]/50 border-none rounded-2xl px-5 py-4 text-sm font-serif h-32 resize-none focus:ring-2 focus:ring-[#5A5A40] outline-none"
                    placeholder="Describe the essence..."
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] font-black text-[#5A5A40]/40 mb-2 block">Revelation (Success)</label>
                  <textarea 
                    value={activeMarker.feedback}
                    onChange={e => updateMarker(activeMarker.id, { feedback: e.target.value })}
                    className="w-full bg-[#F5F2ED]/50 border-none rounded-2xl px-5 py-4 text-sm font-serif h-32 resize-none focus:ring-2 focus:ring-[#5A5A40] outline-none"
                    placeholder="What they learn upon discovery..."
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-[#5A5A40]/10">
                <button 
                  onClick={() => deleteMarker(activeMarker.id)}
                  className="w-full py-4 text-red-500 font-sans font-bold uppercase tracking-widest text-xs hover:bg-red-50 rounded-2xl transition-all"
                >
                  Omit Insight
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Player({ quiz, onBack }: { quiz: QuizConfig; onBack: () => void; key?: React.Key }) {
  const [gameState, setGameState] = useState<GameState>({
    status: 'idle',
    currentMarkerIndex: 0,
    score: 0,
    livesRemaining: quiz.lives || 3,
    timeLeft: quiz.timeLimit || 0,
    selectedMarkerId: null
  });

  const [shuffledMarkers, setShuffledMarkers] = useState<Marker[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const shuffled = [...quiz.markers].sort(() => Math.random() - 0.5);
    setShuffledMarkers(shuffled);
  }, [quiz.markers]);

  useEffect(() => {
    if (gameState.status === 'playing' && quiz.timeLimit) {
      timerRef.current = setInterval(() => {
        setGameState(prev => {
          if (prev.timeLeft <= 1) {
            clearInterval(timerRef.current!);
            return { ...prev, status: 'gameover', timeLeft: 0 };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState.status, quiz.timeLimit]);

  const handleMarkerClick = (id: string) => {
    if (gameState.status !== 'playing') return;
    const correct = id === shuffledMarkers[gameState.currentMarkerIndex].id;
    
    if (correct) {
      setGameState(prev => ({
        ...prev,
        status: 'feedback',
        score: prev.score + (prev.status === 'playing' ? 100 : 0),
        selectedMarkerId: id
      }));
    } else {
      setGameState(prev => {
        const nextLives = prev.livesRemaining - 1;
        if (nextLives <= 0) return { ...prev, status: 'gameover', livesRemaining: 0, selectedMarkerId: id };
        return { ...prev, livesRemaining: nextLives, status: 'feedback', selectedMarkerId: id };
      });
    }
  };

  const handleNext = () => {
    if (gameState.currentMarkerIndex >= shuffledMarkers.length - 1) {
      setGameState(prev => ({ ...prev, status: 'success' }));
    } else {
      setGameState(prev => ({
        ...prev,
        currentMarkerIndex: prev.currentMarkerIndex + 1,
        status: 'playing',
        selectedMarkerId: null
      }));
    }
  };

  const currentMarker = shuffledMarkers[gameState.currentMarkerIndex];
  const isCorrect = gameState.selectedMarkerId === currentMarker?.id;

  const handleGeneralClick = (e: React.MouseEvent) => {
    if (gameState.status !== 'playing' || quiz.type !== 'image') return;
    if (!imageRef.current) return;
    
    // Check if we hit any marker directly (point markers)
    // If it's a polygon goal, we should check if the click was inside the polygon
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    if (currentMarker.type === 'polygon' && currentMarker.polygon) {
      if (isPointInPolygon({ x, y }, currentMarker.polygon)) {
        handleMarkerClick(currentMarker.id);
      } else {
        // Miss! Penalize with an invalid ID
        handleMarkerClick('MISSED_REGION');
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0A0A0B] text-[#F5F2ED] overflow-hidden flex flex-col font-serif">
      {/* Immersive HUD - More Compact */}
      <div className="px-6 py-4 flex justify-between items-center z-50 bg-[#0A0A0B]/80 backdrop-blur-md border-b border-white/5">
        <button onClick={onBack} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all active:scale-95 border border-white/5">
          <ChevronLeft size={24} />
        </button>
        
        <div className="flex items-center gap-8 bg-white/5 backdrop-blur-3xl px-8 py-3 rounded-2xl border border-white/10 shadow-xl">
          <div className="flex items-center gap-3">
             <Heart size={18} className={gameState.livesRemaining <= 1 ? 'text-red-500 animate-pulse' : 'text-red-400'} />
             <p className="font-mono text-xl leading-none">{gameState.livesRemaining}</p>
          </div>

          <div className="w-px h-6 bg-white/10" />

          {quiz.timeLimit && (
            <div className="flex items-center gap-3">
              <Timer size={18} className={gameState.timeLeft <= 15 ? 'text-orange-500 animate-pulse' : 'text-indigo-400'} />
              <p className="font-mono text-xl leading-none">{gameState.timeLeft}s</p>
            </div>
          )}

          <div className="w-px h-6 bg-white/10" />

          <div className="flex items-center gap-3">
            <p className="text-[10px] text-white/30 uppercase font-bold tracking-[0.2em]">Score</p>
            <p className="font-mono text-xl leading-none text-[#F5F2ED]">{gameState.score}</p>
          </div>
        </div>

        <div className="w-10" />
      </div>

      <div className={`flex-1 relative flex ${
        (gameState.status === 'playing' || gameState.status === 'feedback') 
          ? 'items-stretch justify-stretch overflow-hidden' 
          : 'items-center justify-center overflow-y-auto p-8 md:p-12'
      }`}>
        <AnimatePresence mode="wait">
          {gameState.status === 'idle' && (
            <motion.div
              key="start"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="z-50 text-center max-w-4xl"
            >
              <h2 className="text-6xl md:text-8xl font-display font-bold italic mb-8 drop-shadow-2xl">{quiz.title}</h2>
              <div className="flex justify-center gap-4 mb-14">
                 <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-full text-xs font-bold uppercase tracking-[0.2em] flex items-center gap-2">
                   <Navigation size={16} />
                   {quiz.markers.length} Regions
                 </div>
                 <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-full text-xs font-bold uppercase tracking-[0.2em] flex items-center gap-2">
                   <BookOpen size={16} />
                   {quiz.difficulty} Difficulty
                 </div>
              </div>
              <button
                onClick={() => setGameState(prev => ({ ...prev, status: 'playing' }))}
                className="group relative inline-flex items-center gap-6 bg-[#F5F2ED] text-[#2C2C2E] px-16 py-7 rounded-full font-sans font-black text-2xl hover:scale-105 transition-all shadow-[0_0_60px_rgba(245,242,237,0.15)]"
              >
                Inaugurate Journey
                <Play size={28} fill="currentColor" className="group-hover:translate-x-2 transition-transform" />
              </button>
            </motion.div>
          )}

          {(gameState.status === 'playing' || gameState.status === 'feedback') && (
            <motion.div
              key="game"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full flex flex-col lg:flex-row"
            >
              {/* Map Section - Left/Center */}
              <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden h-[60vh] lg:h-auto">
                <div className="absolute inset-0 z-0 p-4 lg:p-8 flex items-center justify-center">
                  {quiz.type === 'atlas' ? (
                    <MapContainer center={[30, 80]} zoom={4} zoomControl={false} className="w-full h-full rounded-[2rem] border-4 border-white/5">
                      <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png" />
                      {quiz.markers.map(m => (
                        m.lat !== undefined && m.lng !== undefined && (
                          <LeafletMarker 
                            key={m.id} 
                            position={[m.lat, m.lng]} 
                            eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); handleMarkerClick(m.id); } }}
                            icon={L.divIcon({
                              className: 'atlas-marker-icon',
                              html: `<div class="w-10 h-10 md:w-12 md:h-12 rounded-full border-[6px] border-white/30 flex items-center justify-center transition-all ${gameState.selectedMarkerId === m.id ? m.id === currentMarker.id ? 'bg-green-500 scale-125 shadow-[0_0_30px_rgba(34,197,94,0.6)]' : 'bg-red-500 scale-125' : 'bg-white/10 hover:bg-white/30'}">
                                ${gameState.selectedMarkerId === m.id ? m.id === currentMarker.id ? '<svg viewBox="0 0 24 24" class="w-6 h-6 text-white"><polyline points="20 6 9 17 4 12"/></svg>' : '<svg viewBox="0 0 24 24" class="w-6 h-6 text-white"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' : ''}
                              </div>`
                            })}
                          />
                        )
                      ))}
                    </MapContainer>
                  ) : (
                    <div className="relative inline-block max-h-full transition-all duration-700" ref={imageRef} onClick={handleGeneralClick}>
                      <img src={quiz.imageUrl} className="max-h-[55vh] lg:max-h-[85vh] w-auto rounded-3xl brightness-[0.9] contrast-[1.1] shadow-2xl border-2 border-white/10" referrerPolicy="no-referrer" />
                      
                      {/* Region Overlay */}
                      <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                         {quiz.markers.filter(m => m.type === 'polygon' && m.polygon).map(m => (
                           <polygon
                            key={`play-poly-${m.id}`}
                            points={m.polygon!.map(p => `${p.x}% ${p.y}%`).join(', ')}
                            className={`transition-all duration-500 ${
                              gameState.selectedMarkerId === m.id 
                               ? m.id === currentMarker.id ? 'fill-green-500/40 stroke-green-500 stroke-4' : 'fill-red-500/40 stroke-red-500 stroke-4'
                               : 'fill-transparent'
                            }`}
                           />
                         ))}
                      </svg>

                      {quiz.markers.map(m => (
                        <div
                          key={m.id}
                          style={{ left: `${m.x}%`, top: `${m.y}%` }}
                          className={`absolute -translate-x-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 rounded-full border-4 flex items-center justify-center cursor-pointer transition-all duration-300 ${
                            m.type === 'polygon' ? 'hidden' : 
                            gameState.selectedMarkerId === m.id 
                              ? m.id === currentMarker.id ? 'bg-green-500 border-white scale-125 z-30 shadow-[0_0_30px_rgba(34,197,94,0.6)]' : 'bg-red-500 border-white scale-125 z-30'
                              : 'bg-white/5 border-white/20 hover:bg-white/20 z-10'
                          }`}
                          onClick={(e) => { e.stopPropagation(); handleMarkerClick(m.id); }}
                        >
                           {gameState.selectedMarkerId === m.id && (isCorrect ? <CheckCircle2 size={24} /> : <XCircle size={24} />)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Progress bar in map view */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-white/5 z-20">
                   <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(gameState.currentMarkerIndex / quiz.markers.length) * 100}%` }}
                    className="h-full bg-indigo-500"
                   />
                </div>
              </div>

              {/* Info Sidebar - Right */}
              <div className="w-full lg:w-[400px] bg-[#121214] border-t lg:border-t-0 lg:border-l border-white/5 p-8 flex flex-col gap-8 overflow-y-auto">
                <div className="space-y-4">
                   <p className="text-[#5A5A40] text-[10px] font-black uppercase tracking-[0.4em]">Active Mandate</p>
                   <h3 className="text-4xl font-display font-bold italic text-white leading-tight break-words">{currentMarker?.name}</h3>
                   {currentMarker?.description && (
                     <p className="text-white/40 text-lg font-serif italic flex items-start gap-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                       <HelpCircle className="text-indigo-400 mt-1 flex-shrink-0" size={20} />
                       {currentMarker.description}
                     </p>
                   )}
                </div>

                <AnimatePresence mode="wait">
                  {gameState.status === 'feedback' && (
                    <motion.div
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -20, opacity: 0 }}
                      className={`space-y-6 p-6 rounded-[2rem] border ${isCorrect ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}
                    >
                       <div>
                          <p className={`font-display font-bold italic text-2xl mb-1 ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                            {isCorrect ? 'Magnificent.' : 'Misdirected.'}
                          </p>
                          <p className="text-white/50 text-sm italic leading-relaxed">{isCorrect ? (currentMarker.feedback || 'Accurate coordination.') : 'Incorrect territory detected.'}</p>
                       </div>
                       <button
                         onClick={handleNext}
                         className={`w-full py-4 rounded-2xl font-sans font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-2xl ${isCorrect ? 'bg-green-500 text-white shadow-green-500/20' : 'bg-red-500 text-white shadow-red-500/20'}`}
                       >
                         {gameState.currentMarkerIndex >= shuffledMarkers.length - 1 ? 'Conclude Mission' : 'Proceed to Next'}
                       </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mt-auto pt-8 border-t border-white/5">
                  <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest text-white/20 mb-2">
                    <span>Expedition Progress</span>
                    <span>{gameState.currentMarkerIndex} / {quiz.markers.length}</span>
                  </div>
                  <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500/50 transition-all duration-500" 
                      style={{ width: `${(gameState.currentMarkerIndex / quiz.markers.length) * 100}%` }} 
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {(gameState.status === 'gameover' || gameState.status === 'success') && (
            <motion.div
              key="end"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              className="z-50 text-center bg-[#F5F2ED] text-[#2C2C2E] p-8 md:p-12 rounded-[3.5rem] shadow-2xl border border-[#5A5A40]/10 max-w-2xl w-full mx-auto my-auto"
            >
                <div className={`w-20 h-20 md:w-24 md:h-24 rounded-full mx-auto flex items-center justify-center mb-8 shadow-xl ${gameState.status === 'success' ? 'bg-[#5A5A40] text-white' : 'bg-red-500 text-white'}`}>
                  {gameState.status === 'success' ? <CheckCircle2 size={48} /> : <XCircle size={48} />}
                </div>
                
                <h2 className="text-5xl md:text-7xl font-display font-bold italic mb-4">
                  {gameState.status === 'success' ? 'Legendary.' : 'Fallen.'}
                </h2>
                <p className="text-gray-500 text-xl italic font-serif mb-10">
                  {gameState.status === 'success' ? `You have mapped all ${quiz.markers.length} territories.` : 'The journey has exceeded your endurance limit.'}
                </p>

              <div className="grid grid-cols-2 gap-8 mb-10">
                <div className="text-center p-6 bg-white rounded-3xl border border-black/5 shadow-sm">
                   <p className="text-[9px] text-gray-400 uppercase font-black tracking-widest mb-1">Scholarship</p>
                   <p className="font-mono text-4xl font-bold">{gameState.score}</p>
                </div>
                <div className="text-center p-6 bg-white rounded-3xl border border-black/5 shadow-sm">
                   <p className="text-[9px] text-gray-400 uppercase font-black tracking-widest mb-1">Accuracy</p>
                   <p className="font-mono text-4xl font-bold">
                     {Math.round((gameState.score / (quiz.markers.length * 100)) * 100)}%
                   </p>
                </div>
              </div>

              <div className="flex gap-4">
                <button onClick={onBack} className="flex-1 bg-white border border-[#5A5A40]/10 text-[#5A5A40] py-5 rounded-[1.5rem] text-lg font-sans font-black uppercase tracking-widest hover:bg-[#F5F2ED] transition-all">
                  Retire
                </button>
                <button onClick={() => window.location.reload()} className="flex-1 bg-[#5A5A40] text-white py-5 rounded-[1.5rem] text-lg font-sans font-black uppercase tracking-widest shadow-xl shadow-[#5A5A40]/20 transition-all hover:scale-105 active:scale-95">
                  Relaunch
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Atmospheric Backdrops */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-500/5 rounded-full blur-[150px] -z-10" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[150px] -z-10" />
    </div>
  );
}

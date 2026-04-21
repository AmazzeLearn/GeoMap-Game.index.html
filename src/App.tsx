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

const INITIAL_ATLAS_QUIZ: QuizConfig = {
  id: generateId(),
  title: 'Lost Empires of the East',
  type: 'atlas',
  imageUrl: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80',
  markers: [
    { id: '1', lat: 34.05, lng: 74.8, type: 'point', name: 'Kushan Empire', description: 'Center of the Silk Road influence', feedback: 'Correct! This was the heart of Kushan power.', x: 0, y: 0 },
    { id: '2', lat: 21.0, lng: 78.0, type: 'point', name: 'Satavahana Dynasty', description: 'Ancient dynasty in the Deccan region', feedback: 'Correct! They were known for distinct coinage.', x: 0, y: 0 },
    { id: '3', lat: 10.8, lng: 78.7, type: 'point', name: 'Chola Dynasty', description: 'Dominant maritime empire of South India', feedback: 'Correct! Masters of the sea.', x: 0, y: 0 },
  ],
  mode: 'play',
  timeLimit: 90,
  lives: 3,
  difficulty: 'Medium',
  updatedAt: Date.now(),
};

const INITIAL_IMAGE_QUIZ: QuizConfig = {
  id: generateId(),
  title: 'Cellular Structure',
  type: 'image',
  imageUrl: 'https://images.unsplash.com/photo-1532053229679-b141b712bc33?auto=format&fit=crop&q=80',
  markers: [
    { id: 'c1', type: 'point', name: 'Nucleus', description: 'The command center of the cell.', feedback: 'Contains the genetic material.', x: 45, y: 55 },
    { id: 'c2', type: 'point', name: 'Mitochondria', description: 'The powerhouse of the cell.', feedback: 'Produces the energy currency (ATP).', x: 65, y: 35 },
    { id: 'c3', type: 'point', name: 'Cell Membrane', description: 'The outer boundary.', feedback: 'Controls what enters and exits.', x: 85, y: 20 },
  ],
  mode: 'play',
  timeLimit: 60,
  lives: 2,
  difficulty: 'Easy',
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
        setQuizzes([INITIAL_ATLAS_QUIZ, INITIAL_IMAGE_QUIZ]);
      }
    } else {
      setQuizzes([INITIAL_ATLAS_QUIZ, INITIAL_IMAGE_QUIZ]);
      localStorage.setItem('mapmaster_quizzes_v2', JSON.stringify([INITIAL_ATLAS_QUIZ, INITIAL_IMAGE_QUIZ]));
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
      imageUrl: type === 'image' 
        ? 'https://images.unsplash.com/photo-1532053229679-b141b712bc33?auto=format&fit=crop&q=80' 
        : 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80',
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
            <header className="mb-16 md:mb-24 text-center">
              <div className="inline-flex items-center gap-2 md:gap-3 mb-6 md:mb-8 px-4 md:px-6 py-1.5 md:py-2 bg-white border border-[#5A5A40]/10 rounded-full text-[#5A5A40] text-[9px] md:text-[10px] font-black tracking-[0.3em] md:tracking-[0.4em] uppercase shadow-sm">
                <Globe size={14} />
                MapMaster Atlas
              </div>
              <h1 className="text-6xl sm:text-7xl md:text-9xl font-display font-bold italic tracking-tighter mb-6 md:mb-8 leading-[0.9] text-[#2C2C2E]">
                Chart the <br />
                <span className="text-[#5A5A40]/30 selection:text-[#5A5A40]">Unknown.</span>
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl text-[#2C2C2E]/50 max-w-2xl mx-auto font-serif italic leading-relaxed px-4">
                From ancient history to modern biological diagrams, create concept-driven interactive maps that bridge the gap between vision and knowledge.
              </p>
              
              <div className="mt-12 md:mt-16 flex flex-col sm:flex-row justify-center gap-4 md:gap-6 px-4">
                <button
                  onClick={() => handleCreateNew('atlas')}
                  className="shimmer-effect flex items-center justify-center gap-3 bg-[#5A5A40] text-white px-8 md:px-10 py-4 md:py-5 rounded-[1.5rem] hover:bg-[#4A4A30] transition-all active:scale-95 shadow-[0_20px_50px_rgba(90,90,64,0.3)] font-sans font-black uppercase tracking-widest text-[10px] md:text-xs"
                >
                  <Plus size={18} />
                  New Geographic Atlas
                </button>
                <button
                  onClick={() => handleCreateNew('image')}
                  className="flex items-center justify-center gap-3 bg-white border border-[#5A5A40]/20 text-[#5A5A40] px-8 md:px-10 py-4 md:py-5 rounded-[1.5rem] hover:bg-white hover:border-[#5A5A40] transition-all active:scale-95 shadow-lg shadow-black/[0.02] font-sans font-black uppercase tracking-widest text-[10px] md:text-xs"
                >
                  <ImageIcon size={18} />
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
      whileHover={{ y: -12 }}
      className="bg-white rounded-[2.5rem] border border-[#5A5A40]/10 p-7 shadow-sm hover:shadow-2xl hover:shadow-[#5A5A40]/15 transition-all flex flex-col group relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#5A5A40]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative aspect-[4/3] rounded-3xl overflow-hidden mb-8 bg-[#F5F2ED] group-hover:shadow-inner transition-shadow">
        {quiz.type === 'atlas' ? (
          <div className="w-full h-full relative flex items-center justify-center bg-indigo-50/30">
            {quiz.imageUrl ? (
              <img 
                src={quiz.imageUrl} 
                alt={quiz.title} 
                className="absolute inset-0 w-full h-full object-cover opacity-60 grayscale-[0.8] group-hover:grayscale-0 transition-all duration-700 scale-105 group-hover:scale-100 mix-blend-multiply"
                referrerPolicy="no-referrer"
              />
            ) : null}
            <Globe size={56} className="text-[#5A5A40]/30 group-hover:scale-110 group-hover:text-indigo-400 transition-all duration-700 relative z-10 drop-shadow-xl" />
            <div className="absolute inset-0 bg-gradient-to-br from-[#5A5A40]/10 via-transparent to-[#5A5A40]/20 mix-blend-overlay" />
          </div>
        ) : (
          <img 
            src={quiz.imageUrl} 
            alt={quiz.title} 
            className="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all duration-700 scale-105 group-hover:scale-100"
            referrerPolicy="no-referrer"
          />
        )}
        <div className="absolute top-5 right-5 flex gap-2">
           <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-3 bg-white/80 backdrop-blur-xl rounded-full text-red-400 hover:bg-red-500 hover:text-white transition-all shadow-lg border border-white/20"
          >
            <Trash2 size={16} />
          </button>
        </div>
        <div className="absolute bottom-5 left-5 bg-white/80 backdrop-blur-xl px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-[0.3em] text-[#5A5A40] border border-white/20 shadow-sm">
           {quiz.type === 'atlas' ? 'Cartographic' : 'Diagram'}
        </div>
      </div>
      
      <h3 className="text-3xl font-display font-bold italic mb-4 text-[#2C2C2E] group-hover:text-black transition-colors">{quiz.title}</h3>
      
      <div className="flex items-center gap-5 mb-10">
        <div className="flex items-center gap-2 text-xs text-[#5A5A40]/50 font-sans font-bold uppercase tracking-widest">
          <BookOpen size={14} className="opacity-60" />
          <span>{quiz.markers.length} Insights</span>
        </div>
        <div className="w-1 h-1 rounded-full bg-[#5A5A40]/20" />
        <div className="px-3 py-1 rounded-full bg-[#5A5A40]/5 text-[#5A5A40] text-[10px] font-black uppercase tracking-widest border border-[#5A5A40]/10">
          {quiz.difficulty}
        </div>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-4">
        <button
          onClick={onEdit}
          className="flex items-center justify-center gap-2 py-4 px-4 bg-[#F5F2ED] text-[#5A5A40] rounded-[1.25rem] hover:bg-[#5A5A40]/10 transition-all font-sans font-black uppercase tracking-widest text-[10px] border border-[#5A5A40]/5"
        >
          <Settings size={16} />
          Configure
        </button>
        <button
          onClick={onPlay}
          className="shimmer-effect flex items-center justify-center gap-2 py-4 px-4 bg-[#5A5A40] text-white rounded-[1.25rem] hover:bg-[#4A4A30] transition-all active:scale-95 shadow-xl shadow-[#5A5A40]/20 font-sans font-black uppercase tracking-widest text-[10px]"
        >
          <Play size={16} fill="white" />
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
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden bg-white">
      {/* Sidebar */}
      <div className="w-full lg:w-[24rem] h-[40vh] lg:h-full border-b lg:border-b-0 lg:border-r border-[#5A5A40]/10 flex flex-col bg-[#F5F2ED] shadow-2xl relative z-20 shrink-0">
        <div className="hidden lg:block absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-[#5A5A40]/10 to-transparent" />
        <div className="p-6 md:p-10 pb-4 md:pb-6">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 md:gap-3 text-[10px] text-[#5A5A40]/40 hover:text-[#5A5A40] mb-6 md:mb-12 transition-all font-sans font-black uppercase tracking-[0.4em]"
          >
            <ChevronLeft size={16} />
            Imperial Dashboard
          </button>
          
          <div className="space-y-8">
            <div>
              <label className="text-[10px] uppercase tracking-[0.4em] font-black text-[#5A5A40] mb-3 block">Manuscript Title</label>
              <input 
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                className="w-full bg-white border border-[#5A5A40]/10 rounded-[1.5rem] px-6 py-4 text-xl font-display italic font-bold focus:ring-2 focus:ring-[#5A5A40] outline-none transition-all shadow-sm"
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

        <div className="flex-1 overflow-y-auto p-6 md:p-10 pt-2 md:pt-4 space-y-8 md:space-y-10 custom-scrollbar">
          {formData.type === 'image' && (
            <div>
              <label className="text-[10px] uppercase tracking-[0.4em] font-black text-[#5A5A40] mb-5 block">Cartography Tools</label>
              <div className="flex bg-[#F5F2ED] rounded-[1.5rem] border border-[#5A5A40]/10 p-1.5 shadow-inner">
                <button 
                  onClick={() => setDrawMode('point')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl transition-all font-sans font-black text-[10px] uppercase tracking-widest ${drawMode === 'point' ? 'bg-[#5A5A40] text-white shadow-xl' : 'text-[#5A5A40]/40 hover:bg-white'}`}
                >
                  <MousePointer2 size={14} />
                  Point
                </button>
                <button 
                  onClick={() => setDrawMode('polygon')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl transition-all font-sans font-black text-[10px] uppercase tracking-widest ${drawMode === 'polygon' ? 'bg-[#5A5A40] text-white shadow-xl' : 'text-[#5A5A40]/40 hover:bg-white'}`}
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
                <div
                  key={m.id}
                  onClick={() => setSelectedMarkerId(m.id)}
                  onKeyDown={e => e.key === 'Enter' && setSelectedMarkerId(m.id)}
                  role="button"
                  tabIndex={0}
                  className={`w-full text-left p-4 rounded-2xl text-sm transition-all flex items-center justify-between group border cursor-pointer select-none outline-none ${selectedMarkerId === m.id ? 'bg-[#5A5A40] border-[#5A5A40] text-white shadow-xl' : 'bg-white border-[#5A5A40]/10 hover:border-[#5A5A40]/30'}`}
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
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8 border-t border-[#5A5A40]/10 bg-white shrink-0">
          <button
            onClick={() => onSave(formData)}
            className="w-full flex items-center justify-center gap-3 bg-[#5A5A40] text-white py-3 md:py-4 rounded-2xl hover:bg-[#4A4A30] transition-all active:scale-[0.98] shadow-2xl shadow-[#5A5A40]/20 font-sans font-bold text-sm md:text-base"
          >
            <Save size={20} />
            Commit to Atlas
          </button>
        </div>
      </div>

      {/* Editor Main */}
      <div className="flex-1 bg-white p-4 md:p-8 flex flex-col relative overflow-hidden">
        <div className="bg-[#F5F2ED] rounded-[2rem] md:rounded-[3rem] shadow-2xl shadow-[#5A5A40]/10 overflow-hidden flex-1 relative flex items-center justify-center border-4 md:border-8 border-white p-2 md:p-4">
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
                      html: `<div class="relative w-10 h-10 flex items-center justify-center">
                        <div class="absolute inset-0 rounded-full border border-[#5A5A40]/30 marker-orbit"></div>
                        <div class="relative w-7 h-7 rounded-full border-2 border-white flex items-center justify-center transition-all ${selectedMarkerId === m.id ? 'bg-[#5A405A] scale-125 marker-premium-glow' : 'bg-[#5A5A40]'} shadow-xl">
                          <span class="text-white text-[10px] font-black">${formData.markers.indexOf(m) + 1}</span>
                        </div>
                      </div>`
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
                   className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-all cursor-pointer ${selectedMarkerId === m.id ? 'z-20' : 'z-10'}`}
                   onClick={(e) => { e.stopPropagation(); setSelectedMarkerId(m.id); }}
                 >
                   <div className="relative w-10 h-10 flex items-center justify-center">
                      <div className={`absolute inset-0 rounded-full border border-[#5A5A40]/30 marker-orbit ${selectedMarkerId === m.id ? 'scale-125' : 'hidden md:block'}`}></div>
                      <div className={`relative w-7 h-7 rounded-full border-2 border-white flex items-center justify-center transition-all ${selectedMarkerId === m.id ? 'bg-[#5A405A] scale-125 marker-premium-glow shadow-[0_0_20px_rgba(90,64,90,0.4)]' : 'bg-[#5A5A40] shadow-lg hover:scale-110'}`}>
                        <span className="text-white text-[10px] font-black">{formData.markers.indexOf(m) + 1}</span>
                      </div>
                   </div>
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
              className="absolute inset-x-4 bottom-4 lg:inset-auto lg:right-16 lg:top-16 lg:bottom-16 max-h-[50vh] lg:max-h-none lg:w-96 glass-premium border border-white/5 rounded-[2rem] lg:rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.4)] p-6 lg:p-10 space-y-6 lg:space-y-8 z-50 flex flex-col bg-[#2C2C2E]/90 lg:bg-transparent"
            >
              <div className="flex justify-between items-center pb-4 lg:pb-6 border-b border-white/10 lg:border-white/5 shrink-0">
                <h4 className="font-display italic font-bold text-2xl lg:text-3xl text-premium-gradient">Insight #{formData.markers.indexOf(activeMarker) + 1}</h4>
                <button onClick={() => setSelectedMarkerId(null)} className="p-2 text-white/50 hover:text-white transition-colors">
                   <XCircle size={24} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-6 lg:space-y-8 pr-2 custom-scrollbar">
                <div>
                  <label className="text-[9px] lg:text-[10px] uppercase tracking-[0.3em] lg:tracking-[0.4em] font-black text-[#5A5A40] lg:text-[#F5F2ED] mb-2 block">Nomen (Label)</label>
                  <input 
                    value={activeMarker.name}
                    onChange={e => updateMarker(activeMarker.id, { name: e.target.value })}
                    className="w-full bg-white/10 border border-white/20 rounded-[1rem] lg:rounded-2xl px-4 lg:px-6 py-3 lg:py-4 font-display italic font-semibold text-white text-base lg:text-lg focus:ring-2 focus:ring-[#5A5A40] outline-none transition-all"
                    placeholder="e.g. Byzantine..."
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.4em] font-black text-[#5A5A40] mb-3 block">Hint / Concept</label>
                  <textarea 
                    value={activeMarker.description}
                    onChange={e => updateMarker(activeMarker.id, { description: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-serif h-36 resize-none text-white/70 focus:ring-2 focus:ring-[#5A5A40] outline-none transition-all"
                    placeholder="Describe the essence..."
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.4em] font-black text-[#5A5A40] mb-3 block">Revelation (Success)</label>
                  <textarea 
                    value={activeMarker.feedback}
                    onChange={e => updateMarker(activeMarker.id, { feedback: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-serif h-36 resize-none text-white/70 focus:ring-2 focus:ring-[#5A5A40] outline-none transition-all"
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
      <div className="px-4 md:px-6 py-3 md:py-4 flex flex-col sm:flex-row justify-between items-center gap-4 sm:gap-0 z-50 glass-premium border-b border-white/5">
        <div className="flex w-full sm:w-auto justify-between items-center">
          <button onClick={onBack} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all active:scale-95 border border-white/5 shrink-0">
            <ChevronLeft size={20} className="md:w-6 md:h-6" />
          </button>
        </div>
        
        <div className="flex items-center gap-4 sm:gap-8 bg-white/5 backdrop-blur-3xl px-4 sm:px-8 py-2 sm:py-3 rounded-2xl border border-white/10 shadow-2xl overflow-x-auto w-full sm:w-auto justify-center">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
             <Heart size={16} className={`md:w-[18px] md:h-[18px] ${gameState.livesRemaining <= 1 ? 'text-red-500 animate-pulse' : 'text-red-400'}`} />
             <p className="font-mono text-sm sm:text-xl leading-none text-premium-gradient">{gameState.livesRemaining}</p>
          </div>

          <div className="w-px h-6 bg-white/10 shrink-0" />

          {quiz.timeLimit && (
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <Timer size={16} className={`md:w-[18px] md:h-[18px] ${gameState.timeLeft <= 15 ? 'text-orange-500 animate-pulse' : 'text-indigo-400'}`} />
              <p className="font-mono text-sm sm:text-xl leading-none text-premium-gradient">{gameState.timeLeft}s</p>
            </div>
          )}

          <div className="w-px h-6 bg-white/10 shrink-0" />

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <p className="text-[8px] sm:text-[10px] text-white/30 uppercase font-black tracking-[0.2em] sm:tracking-[0.4em]">Scholarship</p>
            <p className="font-mono text-sm sm:text-xl leading-none text-premium-gradient">{gameState.score}</p>
          </div>
        </div>

        <div className="hidden sm:block w-10 shrink-0" />
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
              className="z-50 text-center max-w-4xl px-4"
            >
              <h2 className="text-4xl md:text-6xl lg:text-8xl font-display font-bold italic mb-6 sm:mb-8 drop-shadow-2xl leading-tight">{quiz.title}</h2>
              <div className="flex flex-col sm:flex-row justify-center gap-3 md:gap-4 mb-10 sm:mb-14">
                 <div className="px-4 md:px-6 py-3 bg-white/5 border border-white/10 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                   <Navigation size={16} />
                   {quiz.markers.length} Regions
                 </div>
                 <div className="px-4 md:px-6 py-3 bg-white/5 border border-white/10 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                   <BookOpen size={16} />
                   {quiz.difficulty} Difficulty
                 </div>
              </div>
              <button
                onClick={() => setGameState(prev => ({ ...prev, status: 'playing' }))}
                className="group relative inline-flex items-center gap-4 sm:gap-6 bg-[#F5F2ED] text-[#2C2C2E] px-10 sm:px-16 py-5 sm:py-7 rounded-full font-sans font-black text-lg sm:text-2xl hover:scale-105 transition-all shadow-[0_0_60px_rgba(245,242,237,0.15)]"
              >
                Inaugurate Journey
                <Play size={20} className="sm:w-7 sm:h-7 group-hover:translate-x-2 transition-transform" fill="currentColor" />
              </button>
            </motion.div>
          )}

          {(gameState.status === 'playing' || gameState.status === 'feedback') && (
            <motion.div
              key="game"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full flex flex-col lg:flex-row overflow-y-auto overflow-x-hidden lg:overflow-hidden custom-scrollbar"
            >
              {/* Map Section - Left/Center */}
              <div className="flex-none lg:flex-1 relative bg-black flex items-center justify-center overflow-hidden h-[45vh] sm:h-[50vh] lg:h-auto shrink-0 border-b border-white/10 lg:border-b-0 lg:border-r">
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
                              html: `<div class="relative w-14 h-14 flex items-center justify-center">
                                <div class="absolute inset-0 rounded-full border border-white/30 marker-orbit"></div>
                                <div class="absolute inset-3 rounded-full border border-white/20"></div>
                                <div class="relative w-9 h-9 rounded-full border-2 border-white flex items-center justify-center transition-all marker-premium-glow ${gameState.selectedMarkerId === m.id ? (m.id === currentMarker.id ? 'bg-green-500 scale-125 shadow-[0_0_50px_rgba(34,197,94,0.9)]' : 'bg-red-500 scale-125 shadow-[0_0_50px_rgba(239,68,68,0.9)]') : 'bg-white/20 hover:bg-white/50 backdrop-blur-sm'}">
                                  ${gameState.selectedMarkerId === m.id ? (m.id === currentMarker.id ? '<svg viewBox="0 0 24 24" class="w-5 h-5 text-white"><polyline points="20 6 9 17 4 12" stroke-width="4" stroke="currentColor" fill="none"/></svg>' : '<svg viewBox="0 0 24 24" class="w-5 h-5 text-white"><line x1="18" y1="6" x2="6" y2="18" stroke-width="4" stroke="currentColor"/><line x1="6" y1="6" x2="18" y2="18" stroke-width="4" stroke="currentColor"/></svg>') : '<div class="w-2 h-2 bg-white rounded-full shadow-[0_0_10px_white]"></div>'}
                                </div>
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
                          className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer transition-all duration-300 ${
                            m.type === 'polygon' ? 'hidden' : 'z-20'
                          }`}
                          onClick={(e) => { e.stopPropagation(); handleMarkerClick(m.id); }}
                        >
                          <div className={`relative w-14 h-14 flex items-center justify-center`}>
                            {/* Orbiting Ring */}
                            <div className={`absolute inset-0 rounded-full border border-white/30 marker-orbit ${gameState.selectedMarkerId === m.id ? 'hidden' : ''}`}></div>
                            <div className={`absolute inset-3 rounded-full border border-white/20 ${gameState.selectedMarkerId === m.id ? 'hidden' : ''}`}></div>
                            
                            {/* Main Pointer */}
                            <div className={`relative w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${
                              gameState.selectedMarkerId === m.id 
                                ? m.id === currentMarker.id 
                                  ? 'bg-green-500 border-white scale-125 shadow-[0_0_50px_rgba(34,197,94,0.9)]' 
                                  : 'bg-red-500 border-white scale-125 shadow-[0_0_50px_rgba(239,68,68,0.9)]'
                                : 'bg-white/20 border-white/50 backdrop-blur-sm marker-premium-glow'
                            }`}>
                              {gameState.selectedMarkerId === m.id ? (
                                isCorrect ? <CheckCircle2 size={20} /> : <XCircle size={20} />
                              ) : (
                                <div className="w-2 h-2 bg-white rounded-full shadow-[0_0_10px_white]"></div>
                              )}
                            </div>
                          </div>
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
              <div className="w-full lg:w-[420px] glass-premium lg:border-l border-white/5 p-6 md:p-10 flex flex-col gap-8 md:gap-10 shrink-0 bg-[#0A0A0B]/80 lg:bg-transparent lg:overflow-y-auto border-t lg:border-t-0 flex-none pb-12 lg:pb-10">
                <div className="space-y-4 md:space-y-6">
                   <p className="text-[#5A5A40] text-[9px] md:text-[10px] font-black uppercase tracking-[0.4em] md:tracking-[0.6em]">Active Mandate</p>
                   <h3 className="text-4xl md:text-5xl font-display font-bold italic text-white leading-tight break-words text-premium-gradient">{currentMarker?.name}</h3>
                   {currentMarker?.description && (
                     <div className="text-white/50 text-lg md:text-xl font-serif italic flex items-start gap-3 md:gap-4 glass-premium p-4 md:p-6 rounded-[2rem] md:rounded-[2.5rem] border border-white/5">
                       <HelpCircle className="text-indigo-400 mt-1 flex-shrink-0" size={20} />
                       <p className="leading-relaxed">{currentMarker.description}</p>
                     </div>
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
              className="z-50 text-center glass-premium p-6 sm:p-10 md:p-16 rounded-[2rem] sm:rounded-[3rem] md:rounded-[4rem] shadow-[0_40px_100px_rgba(0,0,0,0.5)] border border-white/5 max-w-2xl w-[90%] sm:w-full mx-auto my-auto relative overflow-hidden"
            >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#5A5A40] to-transparent opacity-30" />
                
                <div className={`w-16 h-16 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-full mx-auto flex items-center justify-center mb-6 sm:mb-10 shadow-2xl ${gameState.status === 'success' ? 'bg-[#5A5A40] text-white' : 'bg-red-500 text-white'}`}>
                  {gameState.status === 'success' ? <CheckCircle2 className="w-8 h-8 sm:w-16 sm:h-16 marker-premium-glow" /> : <XCircle className="w-8 h-8 sm:w-16 sm:h-16" />}
                </div>
                
                <h2 className="text-4xl sm:text-6xl md:text-8xl font-display font-bold italic mb-4 sm:mb-6 text-premium-gradient">
                  {gameState.status === 'success' ? 'Legendary.' : 'Fallen.'}
                </h2>
                <p className="text-white/40 text-lg sm:text-2xl italic font-serif mb-8 sm:mb-12 px-4 sm:px-0">
                  {gameState.status === 'success' ? `You have mapped all ${quiz.markers.length} territories.` : 'The journey has exceeded your endurance limit.'}
                </p>

              <div className="grid grid-cols-2 gap-4 sm:gap-10 mb-8 sm:mb-12">
                <div className="text-center p-4 sm:p-8 glass-premium rounded-3xl sm:rounded-[2.5rem] border border-white/5">
                   <p className="text-[8px] sm:text-[10px] text-[#5A5A40] uppercase font-black tracking-[0.2em] sm:tracking-[0.4em] mb-2">Scholarship</p>
                   <p className="font-mono text-3xl sm:text-5xl font-bold text-premium-gradient">{gameState.score}</p>
                </div>
                <div className="text-center p-4 sm:p-8 glass-premium rounded-3xl sm:rounded-[2.5rem] border border-white/5">
                   <p className="text-[8px] sm:text-[10px] text-[#5A5A40] uppercase font-black tracking-[0.2em] sm:tracking-[0.4em] mb-2">Accuracy</p>
                   <p className="font-mono text-3xl sm:text-5xl font-bold text-premium-gradient">
                     {Math.round((gameState.score / (quiz.markers.length * 100)) * 100)}%
                   </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                <button 
                  onClick={onBack} 
                  className="flex-1 bg-white/5 border border-white/10 text-white/60 py-4 sm:py-6 rounded-[1.5rem] sm:rounded-[2rem] text-xs sm:text-sm font-sans font-black uppercase tracking-[0.3em] hover:bg-white/10 transition-all"
                >
                  Retire
                </button>
                <button 
                  onClick={() => window.location.reload()} 
                  className="shimmer-effect flex-1 bg-[#5A5A40] text-white py-4 sm:py-6 rounded-[1.5rem] sm:rounded-[2rem] text-xs sm:text-sm font-sans font-black uppercase tracking-[0.3em] shadow-2xl shadow-[#5A5A40]/30 transition-all hover:scale-105 active:scale-95"
                >
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

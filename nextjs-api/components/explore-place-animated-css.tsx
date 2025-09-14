'use client';

import { useState, useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { ThumbsUp, ThumbsDown, MapPin, Clock, DollarSign, Star, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

// Initialize Mapbox
if (typeof window !== 'undefined' && !mapboxgl.accessToken) {
  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
}

interface Place {
  placeName: string;
  description: string;
  coordinates: [number, number];
  imageUrl?: string;
  category: 'attraction' | 'restaurant' | 'activity' | 'accommodation' | 'shopping' | 'nature';
  rating?: number;
  priceLevel?: string;
  estimatedDuration?: string;
  address?: string;
  whyVisit: string;
  tags?: string[];
}

interface ExplorePlaceAnimatedProps {
  city: string;
  places: Place[];
  onComplete?: (reactions: Map<string, 'like' | 'dislike'>) => void;
}

const categoryColors = {
  attraction: '#3B82F6',
  restaurant: '#10B981',
  activity: '#8B5CF6',
  accommodation: '#EC4899',
  shopping: '#F59E0B',
  nature: '#84CC16',
};

// Typewriter effect component with CSS
function TypewriterText({ text, delay = 0, speed = 30 }: { text: string; delay?: number; speed?: number }) {
  const [displayedText, setDisplayedText] = useState('');
  const [showCursor, setShowCursor] = useState(false);
  
  useEffect(() => {
    setDisplayedText('');
    setShowCursor(false);
    
    const startTimeout = setTimeout(() => {
      setShowCursor(true);
      let i = 0;
      const interval = setInterval(() => {
        if (i < text.length) {
          setDisplayedText(text.slice(0, i + 1));
          i++;
        } else {
          clearInterval(interval);
          setShowCursor(false);
        }
      }, speed);
      
      return () => clearInterval(interval);
    }, delay);
    
    return () => clearTimeout(startTimeout);
  }, [text, delay, speed]);
  
  return (
    <span className="typewriter-container">
      {displayedText}
      {showCursor && <span className="typewriter-cursor" />}
    </span>
  );
}

export function ExplorePlaceAnimatedCSS({
  city,
  places,
  onComplete,
}: ExplorePlaceAnimatedProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reactions, setReactions] = useState<Map<string, 'like' | 'dislike'>>(new Map());
  const [showIntro, setShowIntro] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  
  const currentPlace = places[currentIndex];
  const isLastPlace = currentIndex === places.length - 1;
  
  console.log('[ExplorePlaceAnimatedCSS] Rendering with:', { 
    city, 
    placesCount: places?.length, 
    currentIndex, 
    mapReady,
    currentPlace: currentPlace?.placeName,
    imageUrl: currentPlace?.imageUrl
  });

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: places[0]?.coordinates || [-74.5, 40],
      zoom: 13,
      interactive: true,
      pitch: 45,
      bearing: -17.6,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    
    map.current.on('load', () => {
      setMapReady(true);
    });
    
    // Hide intro after delay
    setTimeout(() => setShowIntro(false), 2000);

    return () => {
      setMapReady(false);
      markers.current.forEach(marker => marker.remove());
      markers.current = [];
      map.current?.remove();
      map.current = null;
    };
  }, [places]);

  // Add markers when map is ready
  useEffect(() => {
    if (!map.current || !mapReady || places.length === 0) return;

    // Clear existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    // Create markers for all places
    places.forEach((place, index) => {
      const el = document.createElement('div');
      el.className = `map-marker ${index === currentIndex ? 'active' : ''}`;
      el.style.setProperty('--marker-color', categoryColors[place.category]);
      el.innerHTML = `
        <div class="marker-pulse"></div>
        <div class="marker-core">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          </svg>
        </div>
      `;

      const marker = new mapboxgl.Marker(el)
        .setLngLat(place.coordinates)
        .addTo(map.current!);

      const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
        .setHTML(`
          <div class="p-3">
            <h3 class="font-bold text-lg">${place.placeName}</h3>
            ${place.address ? `<p class="text-sm text-gray-600 mt-1">${place.address}</p>` : ''}
          </div>
        `);
      
      marker.setPopup(popup);
      markers.current.push(marker);
    });

    // Fly to current place
    if (currentPlace && map.current) {
      map.current.flyTo({
        center: currentPlace.coordinates,
        zoom: 16,
        duration: 2000,
        essential: true,
        curve: 1.5,
      });

      // Update marker states
      markers.current.forEach((marker, index) => {
        const markerEl = marker.getElement();
        if (index === currentIndex) {
          markerEl.classList.add('active');
          setTimeout(() => {
            marker.getPopup().addTo(map.current!);
          }, 2000);
        } else {
          markerEl.classList.remove('active');
          marker.getPopup().remove();
        }
      });
    }
  }, [mapReady, places, currentIndex, currentPlace]);

  const handleReaction = (reaction: 'like' | 'dislike') => {
    const newReactions = new Map(reactions);
    newReactions.set(currentPlace.placeName, reaction);
    setReactions(newReactions);

    if (isLastPlace) {
      onComplete?.(newReactions);
    } else {
      // Smooth transition to next place
      setTransitioning(true);
      setTimeout(() => {
        setCurrentIndex(currentIndex + 1);
        setTimeout(() => setTransitioning(false), 300);
      }, 300);
    }
  };

  if (!currentPlace) {
    return <div>No places to explore</div>;
  }

  return (
    <>
      <style jsx global>{`
        /* Typewriter cursor animation */
        .typewriter-cursor {
          display: inline-block;
          width: 2px;
          height: 1.2em;
          background: currentColor;
          margin-left: 2px;
          animation: cursor-blink 1s infinite;
        }
        
        @keyframes cursor-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }

        /* Map marker animations */
        .map-marker {
          position: relative;
          width: 48px;
          height: 48px;
          cursor: pointer;
          transition: transform 0.3s ease;
        }
        
        .map-marker:hover {
          transform: scale(1.1);
        }
        
        .marker-pulse {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: var(--marker-color);
          opacity: 0;
          transform: translate(-50%, -50%);
        }
        
        .map-marker.active .marker-pulse {
          animation: pulse-ring 2s infinite;
        }
        
        @keyframes pulse-ring {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.3;
          }
          100% {
            transform: translate(-50%, -50%) scale(2.5);
            opacity: 0;
          }
        }
        
        .marker-core {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--marker-color);
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          transform: translate(-50%, -50%);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        
        .map-marker.active .marker-core {
          animation: marker-bounce 0.6s ease;
        }
        
        @keyframes marker-bounce {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.3); }
        }

        /* Ken Burns effect for images */
        .ken-burns-container {
          width: 100%;
          height: 100%;
          overflow: hidden;
          position: relative;
        }
        
        .ken-burns-image {
          width: 110%;
          height: 110%;
          object-fit: cover;
          animation: ken-burns 20s infinite;
        }
        
        @keyframes ken-burns {
          0% {
            transform: scale(1) translate(0, 0);
          }
          25% {
            transform: scale(1.2) translate(-2%, -2%);
          }
          50% {
            transform: scale(1.3) translate(2%, -3%);
          }
          75% {
            transform: scale(1.2) translate(-1%, 2%);
          }
          100% {
            transform: scale(1) translate(0, 0);
          }
        }

        /* Intro animation */
        .intro-overlay {
          position: absolute;
          inset: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.95);
          backdrop-filter: blur(20px);
          animation: intro-fade-in 0.5s ease-out;
        }
        
        .intro-overlay.hiding {
          animation: intro-fade-out 0.5s ease-out forwards;
        }
        
        @keyframes intro-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        @keyframes intro-fade-out {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
            visibility: hidden;
          }
        }
        
        .intro-content {
          text-align: center;
          animation: intro-scale 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        
        @keyframes intro-scale {
          from {
            transform: scale(0) rotate(-180deg);
          }
          to {
            transform: scale(1) rotate(0);
          }
        }
        
        .intro-title {
          font-size: 5rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #feca57 75%, #48c6ef 100%);
          background-size: 200% 200%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: gradient-shift 3s ease infinite;
        }
        
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        
        .intro-sparkle {
          display: inline-block;
          animation: sparkle-float 2s ease-in-out infinite;
        }
        
        @keyframes sparkle-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        
        .intro-bars {
          display: flex;
          justify-content: center;
          gap: 4px;
          margin-top: 2rem;
        }
        
        .intro-bar {
          width: 4px;
          height: 32px;
          background: linear-gradient(to top, #3b82f6, #8b5cf6);
          border-radius: 2px;
          animation: bar-dance 1s ease-in-out infinite;
        }
        
        .intro-bar:nth-child(2) { animation-delay: 0.1s; }
        .intro-bar:nth-child(3) { animation-delay: 0.2s; }
        .intro-bar:nth-child(4) { animation-delay: 0.3s; }
        .intro-bar:nth-child(5) { animation-delay: 0.4s; }
        
        @keyframes bar-dance {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }

        /* Lower third animation */
        .lower-third {
          position: absolute;
          bottom: 2rem;
          left: 2rem;
          right: 2rem;
          z-index: 20;
          animation: slide-up 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        
        .lower-third.transitioning {
          animation: slide-down 0.3s ease-out forwards;
        }
        
        @keyframes slide-up {
          from {
            transform: translateY(150%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        @keyframes slide-down {
          from {
            transform: translateY(0);
            opacity: 1;
          }
          to {
            transform: translateY(150%);
            opacity: 0;
          }
        }
        
        .lower-third-bg {
          position: relative;
          overflow: hidden;
          border-radius: 1rem;
          backdrop-filter: blur(20px);
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        
        .dark .lower-third-bg {
          background: rgba(0, 0, 0, 0.9);
        }
        
        .lower-third-gradient {
          position: absolute;
          inset: 0;
          opacity: 0.1;
          animation: gradient-pan 10s linear infinite;
        }
        
        @keyframes gradient-pan {
          0% { background-position: 0% 0%; }
          100% { background-position: 100% 100%; }
        }
        
        .lower-third-spotlight {
          position: absolute;
          inset: 0;
          opacity: 0.1;
          background: linear-gradient(90deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%);
          background-size: 200% 100%;
          animation: spotlight 3s ease-in-out infinite;
        }
        
        @keyframes spotlight {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }

        /* Progress bars */
        .progress-bar {
          height: 4px;
          border-radius: 2px;
          transition: all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        
        .progress-bar.past {
          background: #10b981;
          width: 32px;
        }
        
        .progress-bar.current {
          background: #3b82f6;
          width: 48px;
          animation: progress-pulse 1s ease-in-out infinite;
        }
        
        @keyframes progress-pulse {
          0%, 100% { transform: scaleX(1); opacity: 1; }
          50% { transform: scaleX(1.1); opacity: 0.8; }
        }
        
        .progress-bar.future {
          background: rgba(255, 255, 255, 0.2);
          width: 32px;
        }

        /* Image fade effect */
        .place-image {
          animation: image-fade-in 0.5s ease-out;
        }
        
        @keyframes image-fade-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        /* Button animations */
        .action-button {
          transition: all 0.2s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        
        .action-button:hover {
          transform: scale(1.05);
        }
        
        .action-button:active {
          transform: scale(0.95);
        }

        /* Completion animation */
        .completion-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(10px);
          z-index: 40;
          animation: fade-in 0.5s ease-out;
        }
        
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .completion-content {
          animation: completion-bounce 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        
        @keyframes completion-bounce {
          from {
            transform: scale(0.5);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        
        .completion-icon {
          animation: spin 2s linear infinite;
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .completion-dots {
          display: flex;
          justify-content: center;
          gap: 4px;
          margin-top: 1rem;
        }
        
        .completion-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: white;
          animation: dot-pulse 1s ease-in-out infinite;
        }
        
        .completion-dot:nth-child(2) { animation-delay: 0.2s; }
        .completion-dot:nth-child(3) { animation-delay: 0.4s; }
        
        @keyframes dot-pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>

      <div className="relative w-full min-h-[800px] bg-gradient-to-br from-background to-muted/20 rounded-2xl overflow-hidden border-2 border-primary/20">
        {/* Intro animation */}
        {showIntro && (
          <div className={cn("intro-overlay", !showIntro && "hiding")}>
            <div className="intro-content space-y-6 p-8">
              <div className="intro-sparkle">
                <Sparkles className="w-16 h-16 mx-auto text-primary mb-4" />
              </div>
              
              <h1 className="intro-title">
                Exploring
              </h1>
              
              <h2 className="text-4xl font-bold text-white">
                {city}
              </h2>
              
              <p className="text-xl text-white/80">
                {places.length} Amazing Destinations
              </p>
              
              <div className="intro-bars">
                {Array.from({ length: Math.min(5, places.length) }, (_, i) => (
                  <div key={i} className="intro-bar" />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="relative h-[800px]">
          {/* Map */}
          <div className="absolute inset-0">
            <div ref={mapContainer} className="w-full h-full" />
          </div>

          {/* Image with Ken Burns effect */}
          {currentPlace.imageUrl && (
            <div
              key={currentPlace.placeName}
              className="place-image absolute top-6 right-6 w-96 h-64 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20"
            >
              <div className="ken-burns-container">
                <img
                  src={currentPlace.imageUrl}
                  alt={currentPlace.placeName}
                  className="ken-burns-image"
                />
              </div>
            </div>
          )}

          {/* Lower third */}
          <div className={cn("lower-third", transitioning && "transitioning")} key={currentPlace.placeName}>
            <div className="lower-third-bg">
              <div 
                className="lower-third-gradient"
                style={{
                  background: `linear-gradient(135deg, ${categoryColors[currentPlace.category]} 0%, transparent 100%)`,
                }}
              />
              <div className="lower-third-spotlight" />
              
              <div className="relative p-6 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: categoryColors[currentPlace.category] }}
                    >
                      {currentIndex + 1}
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">
                      of {places.length} Places
                    </span>
                  </div>
                  
                  <div
                    className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: categoryColors[currentPlace.category] }}
                  >
                    <Sparkles className="w-3 h-3" />
                    {currentPlace.category}
                  </div>
                </div>
                
                {/* Title */}
                <div>
                  <h2 className="text-3xl font-bold">
                    <TypewriterText text={currentPlace.placeName} delay={100} />
                  </h2>
                  <p className="text-muted-foreground mt-1">
                    <TypewriterText text={currentPlace.description} delay={500} speed={20} />
                  </p>
                </div>
                
                {/* Metadata */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {currentPlace.rating && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/20">
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      <span className="text-sm font-medium">{currentPlace.rating}/5</span>
                    </div>
                  )}
                  {currentPlace.priceLevel && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-green-100 dark:bg-green-900/20">
                      <DollarSign className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium">{currentPlace.priceLevel}</span>
                    </div>
                  )}
                  {currentPlace.estimatedDuration && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
                      <Clock className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium">{currentPlace.estimatedDuration}</span>
                    </div>
                  )}
                  {currentPlace.address && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-100 dark:bg-purple-900/20">
                      <MapPin className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-medium truncate">{currentPlace.address.split(',')[0]}</span>
                    </div>
                  )}
                </div>
                
                {/* Why visit */}
                <div
                  className="relative overflow-hidden p-4 rounded-xl"
                  style={{
                    background: `linear-gradient(135deg, ${categoryColors[currentPlace.category]}15 0%, ${categoryColors[currentPlace.category]}05 100%)`,
                    borderLeft: `3px solid ${categoryColors[currentPlace.category]}`,
                  }}
                >
                  <p className="text-sm font-medium mb-1" style={{ color: categoryColors[currentPlace.category] }}>
                    Why visit?
                  </p>
                  <p className="text-sm">
                    <TypewriterText text={currentPlace.whyVisit} delay={1000} speed={15} />
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="absolute top-6 left-6 flex gap-3">
            <Button
              onClick={() => handleReaction('like')}
              variant="default"
              size="lg"
              disabled={reactions.has(currentPlace.placeName)}
              className="action-button backdrop-blur-xl bg-green-600/90 hover:bg-green-600 text-white"
            >
              <ThumbsUp className="w-5 h-5 mr-2" />
              Love it
            </Button>
            <Button
              onClick={() => handleReaction('dislike')}
              variant="outline"
              size="lg"
              disabled={reactions.has(currentPlace.placeName)}
              className="action-button backdrop-blur-xl bg-white/10 hover:bg-white/20 text-white border-white/20"
            >
              <ThumbsDown className="w-5 h-5 mr-2" />
              Skip
            </Button>
          </div>

          {/* Progress indicator */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex gap-2">
            {places.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'progress-bar',
                  i < currentIndex && 'past',
                  i === currentIndex && 'current',
                  i > currentIndex && 'future'
                )}
              />
            ))}
          </div>

          {/* Completion message */}
          {isLastPlace && reactions.size === places.length && (
            <div className="completion-overlay">
              <div className="completion-content text-center space-y-4 p-8 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20">
                <div className="completion-icon w-20 h-20 mx-auto rounded-full bg-gradient-to-r from-primary to-purple-600 flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-white">All Set!</h2>
                <p className="text-xl text-white/80">
                  Creating your personalized {city} itinerary...
                </p>
                <div className="completion-dots">
                  <div className="completion-dot" />
                  <div className="completion-dot" />
                  <div className="completion-dot" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
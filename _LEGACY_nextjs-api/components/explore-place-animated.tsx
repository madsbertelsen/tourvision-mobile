'use client';

import { useState, useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@/styles/explore-animations.css';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ThumbsUp, ThumbsDown, MapPin, Clock, DollarSign, Star, ChevronRight, Sparkles } from 'lucide-react';
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

// Typewriter effect component
function TypewriterText({ text, delay = 0, speed = 30 }: { text: string; delay?: number; speed?: number }) {
  const [displayedText, setDisplayedText] = useState('');
  
  useEffect(() => {
    setDisplayedText('');
    const timeout = setTimeout(() => {
      let i = 0;
      const interval = setInterval(() => {
        if (i < text.length) {
          setDisplayedText(text.slice(0, i + 1));
          i++;
        } else {
          clearInterval(interval);
        }
      }, speed);
      
      return () => clearInterval(interval);
    }, delay);
    
    return () => clearTimeout(timeout);
  }, [text, delay, speed]);
  
  return (
    <span>
      {displayedText}
      {displayedText.length < text.length && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          className="inline-block w-0.5 h-5 bg-primary ml-0.5"
        />
      )}
    </span>
  );
}

// Ken Burns effect for images
function KenBurnsImage({ src, alt }: { src: string; alt: string }) {
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  useEffect(() => {
    const animations = [
      { scale: 1.2, x: -10, y: -10 },
      { scale: 1.3, x: 10, y: -5 },
      { scale: 1.2, x: -5, y: 10 },
      { scale: 1, x: 0, y: 0 },
    ];
    
    let index = 0;
    const interval = setInterval(() => {
      const target = animations[index % animations.length];
      animate(scale, target.scale, { duration: 5, ease: "easeInOut" });
      animate(x, target.x, { duration: 5, ease: "easeInOut" });
      animate(y, target.y, { duration: 5, ease: "easeInOut" });
      index++;
    }, 5000);
    
    return () => clearInterval(interval);
  }, [scale, x, y]);
  
  return (
    <motion.div className="w-full h-full overflow-hidden">
      <motion.img
        src={src}
        alt={alt}
        style={{ scale, x, y }}
        className="w-full h-full object-cover"
      />
    </motion.div>
  );
}

// TV production style lower third
function LowerThird({ place, index, total }: { place: Place; index: number; total: number }) {
  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: "spring", damping: 20, stiffness: 300 }}
      className="absolute bottom-6 left-6 right-6 z-20"
    >
      {/* Background with glassmorphism */}
      <div className="relative overflow-hidden rounded-2xl backdrop-blur-xl bg-white/90 dark:bg-black/90 border border-white/20 shadow-2xl">
        {/* Animated gradient background */}
        <motion.div
          className="absolute inset-0 opacity-10"
          style={{
            background: `linear-gradient(135deg, ${categoryColors[place.category]} 0%, transparent 100%)`,
          }}
          animate={{
            backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
          }}
          transition={{ duration: 10, repeat: Infinity }}
        />
        
        <div className="relative p-6 space-y-4">
          {/* Header with location counter */}
          <div className="flex items-center justify-between">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="flex items-center gap-2"
            >
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: categoryColors[place.category] }}
              >
                {index + 1}
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                of {total} Places
              </span>
            </motion.div>
            
            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: categoryColors[place.category] }}
            >
              <Sparkles className="w-3 h-3" />
              {place.category}
            </motion.div>
          </div>
          
          {/* Title with typewriter effect */}
          <div>
            <h2 className="text-3xl font-bold">
              <TypewriterText text={place.placeName} delay={500} />
            </h2>
            <p className="text-muted-foreground mt-1">
              <TypewriterText text={place.description} delay={1000} speed={20} />
            </p>
          </div>
          
          {/* Animated metadata bars */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
          >
            {place.rating && (
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="flex items-center gap-2 p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/20"
              >
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                <span className="text-sm font-medium">{place.rating}/5</span>
              </motion.div>
            )}
            {place.priceLevel && (
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="flex items-center gap-2 p-2 rounded-lg bg-green-100 dark:bg-green-900/20"
              >
                <DollarSign className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium">{place.priceLevel}</span>
              </motion.div>
            )}
            {place.estimatedDuration && (
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="flex items-center gap-2 p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20"
              >
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium">{place.estimatedDuration}</span>
              </motion.div>
            )}
            {place.address && (
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="flex items-center gap-2 p-2 rounded-lg bg-purple-100 dark:bg-purple-900/20"
              >
                <MapPin className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium truncate">{place.address.split(',')[0]}</span>
              </motion.div>
            )}
          </motion.div>
          
          {/* Why visit callout */}
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 2 }}
            className="relative overflow-hidden p-4 rounded-xl"
            style={{
              background: `linear-gradient(135deg, ${categoryColors[place.category]}15 0%, ${categoryColors[place.category]}05 100%)`,
              borderLeft: `3px solid ${categoryColors[place.category]}`,
            }}
          >
            <motion.div
              className="absolute inset-0 opacity-10"
              animate={{
                x: ['-100%', '200%'],
              }}
              transition={{ duration: 3, repeat: Infinity, repeatDelay: 5 }}
              style={{
                background: `linear-gradient(90deg, transparent, ${categoryColors[place.category]}40, transparent)`,
              }}
            />
            <p className="text-sm font-medium mb-1" style={{ color: categoryColors[place.category] }}>
              Why visit?
            </p>
            <p className="text-sm relative z-10">
              <TypewriterText text={place.whyVisit} delay={2500} speed={15} />
            </p>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

export function ExplorePlaceAnimated({
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
  
  const currentPlace = places[currentIndex];
  const isLastPlace = currentIndex === places.length - 1;
  
  console.log('[ExplorePlaceAnimated] Rendering with:', { 
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
    
    // Mark map as ready when it's loaded
    map.current.on('load', () => {
      setMapReady(true);
    });
    
    // Hide intro after shorter delay to see animations sooner
    setTimeout(() => setShowIntro(false), 1500);

    return () => {
      setMapReady(false);
      // Clean up markers
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

    // Add style for animated markers if not already added
    if (!document.querySelector('#animated-marker-styles')) {
      const style = document.createElement('style');
      style.id = 'animated-marker-styles';
      style.textContent = `
        .animated-marker {
          position: relative;
          width: 48px;
          height: 48px;
          cursor: pointer;
        }
        
        .marker-pulse {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          opacity: 0.3;
          transform: translate(-50%, -50%);
        }
        
        .marker-pulse.active {
          animation: pulse 2s infinite;
        }
        
        .marker-core {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          transform: translate(-50%, -50%);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.3s ease;
        }
        
        .marker-core.active {
          animation: bounce 0.5s ease;
        }
        
        .animated-marker:hover .marker-core {
          transform: translate(-50%, -50%) scale(1.1);
        }
        
        @keyframes pulse {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.3;
          }
          50% {
            transform: translate(-50%, -50%) scale(2);
            opacity: 0;
          }
          100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.3;
          }
        }
        
        @keyframes bounce {
          0%, 100% {
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            transform: translate(-50%, -50%) scale(1.2);
          }
        }
      `;
      document.head.appendChild(style);
    }

    // Create markers for all places
    places.forEach((place, index) => {
      const el = document.createElement('div');
      el.className = 'animated-marker';
      
      const pulseEl = document.createElement('div');
      pulseEl.className = `marker-pulse ${index === currentIndex ? 'active' : ''}`;
      pulseEl.style.backgroundColor = categoryColors[place.category];
      
      const coreEl = document.createElement('div');
      coreEl.className = `marker-core ${index === currentIndex ? 'active' : ''}`;
      coreEl.style.backgroundColor = categoryColors[place.category];
      coreEl.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        </svg>
      `;
      
      el.appendChild(pulseEl);
      el.appendChild(coreEl);

      const marker = new mapboxgl.Marker(el)
        .setLngLat(place.coordinates)
        .addTo(map.current!);

      // Add popup
      const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
        .setHTML(`
          <div class="p-3">
            <h3 class="font-bold text-lg">${place.placeName}</h3>
            ${place.address ? `<p class="text-sm text-gray-600 mt-1">${place.address}</p>` : ''}
            <div class="flex items-center gap-2 mt-2">
              ${place.rating ? `
                <span class="flex items-center gap-1 text-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="gold">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  ${place.rating}
                </span>
              ` : ''}
              <span class="px-2 py-0.5 rounded-full text-xs font-medium text-white" style="background-color: ${categoryColors[place.category]}">
                ${place.category}
              </span>
            </div>
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
        const pulseEl = markerEl.querySelector('.marker-pulse');
        const coreEl = markerEl.querySelector('.marker-core');
        
        if (index === currentIndex) {
          pulseEl?.classList.add('active');
          coreEl?.classList.add('active');
          // Show popup for active marker
          setTimeout(() => {
            marker.getPopup().addTo(map.current!);
          }, 2000);
        } else {
          pulseEl?.classList.remove('active');
          coreEl?.classList.remove('active');
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
      // Quick flash transition effect
      setShowIntro(true);
      setTimeout(() => {
        setCurrentIndex(currentIndex + 1);
        setTimeout(() => setShowIntro(false), 300);
      }, 300);
    }
  };

  if (!currentPlace) {
    return <div>No places to explore</div>;
  }

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="relative w-full min-h-[800px] bg-gradient-to-br from-background to-muted/20 rounded-2xl overflow-hidden border-2 border-primary/20"
    >
      {/* TV noise overlay effect */}
      <div className="tv-noise" />
      
      {/* Intro animation */}
      <AnimatePresence>
        {showIntro && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              transition={{ type: "spring", damping: 10 }}
              className="text-center space-y-6 p-8"
            >
              {/* Flashing lights effect */}
              <motion.div
                className="absolute inset-0 pointer-events-none"
                animate={{ opacity: [0, 0.3, 0] }}
                transition={{ duration: 0.5, repeat: 3 }}
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, transparent 70%)',
                }}
              />
              
              <motion.div
                animate={{ y: [-10, 10, -10] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Sparkles className="w-16 h-16 mx-auto text-primary mb-4" />
              </motion.div>
              
              <motion.h1 
                className="text-7xl font-black uppercase tracking-wider"
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #feca57 75%, #48c6ef 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundSize: '200% 200%',
                }}
                animate={{ 
                  backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
                }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                {showIntro ? 'Exploring' : `Place ${currentIndex + 1}`}
              </motion.h1>
              
              <motion.h2
                className="text-4xl font-bold text-white"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                {city}
              </motion.h2>
              
              <motion.p 
                className="text-xl text-white/80"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                {places.length} Amazing Destinations
              </motion.p>
              
              {/* Animated loading bars */}
              <motion.div className="flex justify-center gap-1 mt-8">
                {Array.from({ length: places.length }, (_, i) => (
                  <motion.div
                    key={i}
                    className="w-1 h-8 bg-gradient-to-t from-primary to-purple-600 rounded-full"
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: [0, 1, 0.3] }}
                    transition={{ 
                      delay: i * 0.05,
                      duration: 0.5,
                      repeat: Infinity,
                      repeatDelay: 1
                    }}
                  />
                ))}
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="relative h-[800px]">
        {/* Map */}
        <div className="absolute inset-0">
          <div ref={mapContainer} className="w-full h-full" />
        </div>

        {/* Image overlay with Ken Burns effect */}
        {currentPlace.imageUrl && (
          <motion.div
            key={currentPlace.placeName}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute top-6 right-6 w-96 h-64 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20"
          >
            <KenBurnsImage src={currentPlace.imageUrl} alt={currentPlace.placeName} />
          </motion.div>
        )}

        {/* Lower third with place information */}
        <AnimatePresence mode="wait">
          <LowerThird 
            key={currentPlace.placeName}
            place={currentPlace} 
            index={currentIndex} 
            total={places.length} 
          />
        </AnimatePresence>

        {/* Action buttons */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 3 }}
          className="absolute top-6 left-6 flex gap-3"
        >
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              onClick={() => handleReaction('like')}
              variant="default"
              size="lg"
              disabled={reactions.has(currentPlace.placeName)}
              className="backdrop-blur-xl bg-green-600/90 hover:bg-green-600 text-white"
            >
              <ThumbsUp className="w-5 h-5 mr-2" />
              Love it
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              onClick={() => handleReaction('dislike')}
              variant="outline"
              size="lg"
              disabled={reactions.has(currentPlace.placeName)}
              className="backdrop-blur-xl bg-white/10 hover:bg-white/20 text-white border-white/20"
            >
              <ThumbsDown className="w-5 h-5 mr-2" />
              Skip
            </Button>
          </motion.div>
        </motion.div>

        {/* Progress indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="absolute top-6 left-1/2 -translate-x-1/2 flex gap-2"
        >
          {places.map((_, i) => (
            <motion.div
              key={i}
              className={cn(
                'h-1 rounded-full transition-all duration-500',
                i < currentIndex
                  ? 'bg-green-500 w-8'
                  : i === currentIndex
                  ? 'bg-primary w-12'
                  : 'bg-white/20 w-8'
              )}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: i * 0.05 }}
            />
          ))}
        </motion.div>

        {/* Completion message */}
        {isLastPlace && reactions.size === places.length && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-xl z-40"
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-center space-y-4 p-8 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-20 h-20 mx-auto rounded-full bg-gradient-to-r from-primary to-purple-600 flex items-center justify-center"
              >
                <Sparkles className="w-10 h-10 text-white" />
              </motion.div>
              <h2 className="text-3xl font-bold text-white">All Set!</h2>
              <p className="text-xl text-white/80">
                Creating your personalized {city} itinerary...
              </p>
              <div className="flex justify-center gap-1 pt-4">
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-3 h-3 rounded-full bg-white"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
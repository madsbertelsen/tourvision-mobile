'use client';

import { motion } from 'framer-motion';
import { Heart, X, Star, DollarSign, Clock, } from 'lucide-react';
import type { Destination } from '@/artifacts/exploration/types';
import { cn } from '@/lib/utils';

interface DestinationCardProps {
  destination: Destination;
  isLiked: boolean;
  onToggleLike: () => void;
  onRemove: () => void;
  onHover: () => void;
  onHoverEnd: () => void;
  index: number;
}

const categoryColors = {
  attraction: '#3B82F6',
  restaurant: '#10B981', 
  activity: '#F59E0B',
  accommodation: '#8B5CF6',
  shopping: '#EC4899',
  nature: '#06B6D4',
};

const categoryLabels = {
  attraction: 'Attraction',
  restaurant: 'Restaurant',
  activity: 'Activity',
  accommodation: 'Accommodation',
  shopping: 'Shopping',
  nature: 'Nature',
};

export function DestinationCard({
  destination,
  isLiked,
  onToggleLike,
  onRemove,
  onHover,
  onHoverEnd,
  index,
}: DestinationCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ delay: index * 0.05 }}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      className={cn(
        'relative bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm',
        'border-2 transition-all duration-200',
        'hover:shadow-md hover:scale-[1.02]',
        isLiked ? 'border-red-200' : 'border-gray-200 dark:border-gray-700',
      )}
    >
      {/* Category badge */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white"
          style={{ backgroundColor: categoryColors[destination.category] }}
        >
          {categoryLabels[destination.category]}
        </span>
        
        {/* Action buttons */}
        <div className="flex gap-1">
          <button
            onClick={onToggleLike}
            className={cn(
              'p-1.5 rounded-full transition-colors',
              isLiked ? 'bg-red-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700',
            )}
          >
            <Heart className="w-4 h-4" fill={isLiked ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Destination name */}
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1 line-clamp-1">
        {destination.name}
      </h3>

      {/* Description */}
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
        {destination.description}
      </p>

      {/* Meta information */}
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        {destination.rating && (
          <div className="flex items-center gap-0.5">
            <Star className="w-3 h-3 fill-current text-yellow-500" />
            <span>{destination.rating}</span>
          </div>
        )}
        {destination.priceLevel && (
          <div className="flex items-center">
            {Array.from({ length: destination.priceLevel.length }).map((_, i) => (
              <DollarSign key={i} className="w-3 h-3 text-green-600" />
            ))}
          </div>
        )}
        {destination.estimatedDuration && (
          <div className="flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            <span>{destination.estimatedDuration}</span>
          </div>
        )}
      </div>

      {/* Tags */}
      {destination.tags && destination.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {destination.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
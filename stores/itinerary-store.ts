import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { 
  TipTapDocument, 
  DestinationNode, 
  DayNode,
  extractDestinations,
  calculateDayCost,
  CostInfo,
  BookingInfo,
  Collaborator,
  ViewPreferences,
  TipTapNode,
  GroupSplitNode
} from '../types/tiptap'

interface Destination {
  id: string
  name: string
  context?: string // e.g., "Paris, France"
  location?: {
    lat: number
    lng: number
  }
  description?: string
  duration?: string
  arrivalTime?: string
  departureTime?: string
  cost?: CostInfo
  booking?: BookingInfo
  category?: 'landmark' | 'museum' | 'restaurant' | 'activity' | 'shopping'
  colorIndex?: number
  weatherDependent?: boolean
  tips?: string[]
}

interface SplitGroup {
  id: string
  name: string
  members: string[]
  destinations: Destination[]
  estimatedCost?: number
}

interface ItineraryState {
  // Current itinerary
  currentItinerary: {
    id: string | null
    title: string
    description: string
    document: TipTapDocument | null
    destinations: Destination[]
    splitGroups: SplitGroup[]
    dateRange?: {
      start: string
      end: string
    }
    collaborators?: Collaborator[]
    totalCost?: number
    totalDays?: number
    version?: number
  }
  
  // View preferences
  viewMode: 'split' | 'text' | 'map'
  selectedDay: string | 'all'
  commentsEnabled: boolean
  editingEnabled: boolean
  
  // Actions - Itinerary management
  setItinerary: (itinerary: Partial<ItineraryState['currentItinerary']>) => void
  updateDocument: (document: TipTapDocument) => void
  clearItinerary: () => void
  
  // Actions - Destination management
  addDestination: (destination: Destination) => void
  removeDestination: (id: string) => void
  updateDestination: (id: string, updates: Partial<Destination>) => void
  
  // Actions - Split group management
  addSplitGroup: (group: SplitGroup) => void
  removeSplitGroup: (id: string) => void
  updateSplitGroup: (id: string, updates: Partial<SplitGroup>) => void
  
  // Actions - View preferences
  setViewMode: (mode: 'split' | 'text' | 'map') => void
  setSelectedDay: (day: string | 'all') => void
  toggleComments: () => void
  toggleEditing: () => void
  
  // Actions - Document synchronization
  syncDestinationsFromDocument: () => void
  buildDocumentFromDestinations: () => TipTapDocument
  
  // Actions - Cost calculations
  calculateTotalCost: () => number
  calculateDayCosts: () => Record<number, number>
}

export const useItineraryStore = create<ItineraryState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentItinerary: {
        id: null,
        title: '',
        description: '',
        document: null,
        destinations: [],
        splitGroups: [],
        totalCost: 0,
        totalDays: 1,
        version: 1,
      },
      
      viewMode: 'split',
      selectedDay: 'all',
      commentsEnabled: false,
      editingEnabled: false,

      // Itinerary management
      setItinerary: (itinerary) =>
        set((state) => ({
          currentItinerary: {
            ...state.currentItinerary,
            ...itinerary,
            version: (state.currentItinerary.version || 0) + 1,
          },
        })),

      updateDocument: (document) =>
        set((state) => ({
          currentItinerary: {
            ...state.currentItinerary,
            document,
            version: (state.currentItinerary.version || 0) + 1,
          },
        })),

      clearItinerary: () =>
        set({
          currentItinerary: {
            id: null,
            title: '',
            description: '',
            document: null,
            destinations: [],
            splitGroups: [],
            totalCost: 0,
            totalDays: 1,
            version: 1,
          },
        }),

      // Destination management
      addDestination: (destination) =>
        set((state) => {
          const colorIndex = destination.colorIndex ?? state.currentItinerary.destinations.length
          const newDestination = { ...destination, colorIndex }
          
          return {
            currentItinerary: {
              ...state.currentItinerary,
              destinations: [...state.currentItinerary.destinations, newDestination],
            },
          }
        }),

      removeDestination: (id) =>
        set((state) => ({
          currentItinerary: {
            ...state.currentItinerary,
            destinations: state.currentItinerary.destinations.filter((d) => d.id !== id),
          },
        })),

      updateDestination: (id, updates) =>
        set((state) => ({
          currentItinerary: {
            ...state.currentItinerary,
            destinations: state.currentItinerary.destinations.map((d) =>
              d.id === id ? { ...d, ...updates } : d
            ),
          },
        })),

      // Split group management
      addSplitGroup: (group) =>
        set((state) => ({
          currentItinerary: {
            ...state.currentItinerary,
            splitGroups: [...state.currentItinerary.splitGroups, group],
          },
        })),

      removeSplitGroup: (id) =>
        set((state) => ({
          currentItinerary: {
            ...state.currentItinerary,
            splitGroups: state.currentItinerary.splitGroups.filter((g) => g.id !== id),
          },
        })),

      updateSplitGroup: (id, updates) =>
        set((state) => ({
          currentItinerary: {
            ...state.currentItinerary,
            splitGroups: state.currentItinerary.splitGroups.map((g) =>
              g.id === id ? { ...g, ...updates } : g
            ),
          },
        })),

      // View preferences
      setViewMode: (mode) => set({ viewMode: mode }),
      setSelectedDay: (day) => set({ selectedDay: day }),
      toggleComments: () => set((state) => ({ commentsEnabled: !state.commentsEnabled })),
      toggleEditing: () => set((state) => ({ editingEnabled: !state.editingEnabled })),

      // Document synchronization
      syncDestinationsFromDocument: () => {
        const state = get()
        if (!state.currentItinerary.document) return

        const destinations = extractDestinations(state.currentItinerary.document)
        const mappedDestinations: Destination[] = destinations.map((node) => ({
          id: node.attrs.destinationId,
          name: node.attrs.name,
          context: node.attrs.context,
          location: node.attrs.coordinates ? {
            lat: node.attrs.coordinates[1],
            lng: node.attrs.coordinates[0],
          } : undefined,
          colorIndex: node.attrs.colorIndex,
          cost: node.attrs.cost,
          booking: node.attrs.booking,
          duration: node.attrs.duration,
          category: node.attrs.category,
          weatherDependent: node.attrs.weatherDependent,
          tips: node.attrs.tips,
        }))

        set((state) => ({
          currentItinerary: {
            ...state.currentItinerary,
            destinations: mappedDestinations,
          },
        }))
      },

      buildDocumentFromDestinations: () => {
        const state = get()
        const { destinations, title, description } = state.currentItinerary

        // Group destinations by day (simplified - you might want to enhance this)
        const content: TipTapNode[] = []

        // Add title
        if (title) {
          content.push({
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: title }],
          })
        }

        // Add description
        if (description) {
          content.push({
            type: 'paragraph',
            content: [{ type: 'text', text: description }],
          })
        }

        // Add destinations
        destinations.forEach((dest, index) => {
          const destNode: DestinationNode = {
            type: 'destination',
            attrs: {
              destinationId: dest.id,
              name: dest.name,
              context: dest.context,
              coordinates: dest.location ? [dest.location.lng, dest.location.lat] : undefined,
              colorIndex: dest.colorIndex || index,
              cost: dest.cost,
              booking: dest.booking,
              duration: dest.duration,
              category: dest.category,
              weatherDependent: dest.weatherDependent,
              tips: dest.tips,
              priority: 'medium',
            },
            content: dest.description ? [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: dest.description }],
              }
            ] : [],
          }
          content.push(destNode)
        })

        return {
          type: 'doc',
          content,
        }
      },

      // Cost calculations
      calculateTotalCost: () => {
        const state = get()
        let total = 0
        
        state.currentItinerary.destinations.forEach((dest) => {
          if (dest.cost) {
            total += dest.cost.amount
          }
        })
        
        state.currentItinerary.splitGroups.forEach((group) => {
          if (group.estimatedCost) {
            total += group.estimatedCost
          }
        })
        
        return total
      },

      calculateDayCosts: () => {
        const state = get()
        const dayCosts: Record<number, number> = {}
        
        // This is simplified - in a real app, you'd group destinations by actual days
        // For now, we'll just return a single day cost
        dayCosts[1] = state.calculateTotalCost()
        
        return dayCosts
      },
    }),
    {
      name: 'tourvision-itinerary-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        currentItinerary: state.currentItinerary,
        viewMode: state.viewMode,
        selectedDay: state.selectedDay,
        commentsEnabled: state.commentsEnabled,
        editingEnabled: state.editingEnabled,
      }),
    }
  )
)
export interface Database {
  public: {
    Tables: {
      itineraries: {
        Row: {
          id: string
          title: string
          description: string | null
          document: any // TipTap JSON document
          created_by: string
          created_at: string
          updated_at: string
          is_public: boolean
          collaborators: string[]
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          document: any
          created_by?: string
          created_at?: string
          updated_at?: string
          is_public?: boolean
          collaborators?: string[]
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          document?: any
          created_by?: string
          created_at?: string
          updated_at?: string
          is_public?: boolean
          collaborators?: string[]
        }
      }
      places: {
        Row: {
          id: string
          name: string
          description: string | null
          location: {
            lat: number
            lng: number
          }
          address: string | null
          category: string | null
          images: string[]
          rating: number | null
          google_place_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          location: {
            lat: number
            lng: number
          }
          address?: string | null
          category?: string | null
          images?: string[]
          rating?: number | null
          google_place_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          location?: {
            lat: number
            lng: number
          }
          address?: string | null
          category?: string | null
          images?: string[]
          rating?: number | null
          google_place_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activity_notifications: {
        Row: {
          activity_id: string | null
          chat_message_id: string | null
          created_at: string
          id: string
          is_read: boolean
          read_at: string | null
          thread_id: string | null
          thread_message_id: string | null
          trip_id: string
          user_id: string
        }
        Insert: {
          activity_id?: string | null
          chat_message_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          read_at?: string | null
          thread_id?: string | null
          thread_message_id?: string | null
          trip_id: string
          user_id: string
        }
        Update: {
          activity_id?: string | null
          chat_message_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          read_at?: string | null
          thread_id?: string | null
          thread_message_id?: string | null
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_notifications_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "trip_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_notifications_chat_message_id_fkey"
            columns: ["chat_message_id"]
            isOneToOne: false
            referencedRelation: "trip_chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_notifications_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "trip_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_notifications_thread_message_id_fkey"
            columns: ["thread_message_id"]
            isOneToOne: false
            referencedRelation: "thread_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_notifications_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      activity_reactions: {
        Row: {
          activity_id: string | null
          chat_message_id: string | null
          created_at: string
          emoji: string
          id: string
          thread_message_id: string | null
          user_id: string
        }
        Insert: {
          activity_id?: string | null
          chat_message_id?: string | null
          created_at?: string
          emoji: string
          id?: string
          thread_message_id?: string | null
          user_id: string
        }
        Update: {
          activity_id?: string | null
          chat_message_id?: string | null
          created_at?: string
          emoji?: string
          id?: string
          thread_message_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_reactions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "trip_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_reactions_chat_message_id_fkey"
            columns: ["chat_message_id"]
            isOneToOne: false
            referencedRelation: "trip_chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_reactions_thread_message_id_fkey"
            columns: ["thread_message_id"]
            isOneToOne: false
            referencedRelation: "thread_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      collaboration_sessions: {
        Row: {
          created_at: string
          cursor_position: Json | null
          id: string
          is_active: boolean
          itinerary_id: string
          last_seen: string
          selection: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          cursor_position?: Json | null
          id?: string
          is_active?: boolean
          itinerary_id: string
          last_seen?: string
          selection?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          cursor_position?: Json | null
          id?: string
          is_active?: boolean
          itinerary_id?: string
          last_seen?: string
          selection?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaboration_sessions_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      itineraries: {
        Row: {
          collaborators: string[]
          created_at: string
          created_by: string
          description: string | null
          document: Json
          id: string
          is_public: boolean
          title: string
          updated_at: string
        }
        Insert: {
          collaborators?: string[]
          created_at?: string
          created_by: string
          description?: string | null
          document: Json
          id?: string
          is_public?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          collaborators?: string[]
          created_at?: string
          created_by?: string
          description?: string | null
          document?: Json
          id?: string
          is_public?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "itineraries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      itinerary_places: {
        Row: {
          arrival_time: string | null
          created_at: string
          departure_time: string | null
          id: string
          itinerary_id: string
          notes: string | null
          order_index: number
          place_id: string
        }
        Insert: {
          arrival_time?: string | null
          created_at?: string
          departure_time?: string | null
          id?: string
          itinerary_id: string
          notes?: string | null
          order_index: number
          place_id: string
        }
        Update: {
          arrival_time?: string | null
          created_at?: string
          departure_time?: string | null
          id?: string
          itinerary_id?: string
          notes?: string | null
          order_index?: number
          place_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_places_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_places_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          }
        ]
      }
      map_tiles: {
        Row: {
          bounds: Json
          created_at: string
          file_size: number | null
          id: string
          name: string
          region: string
          storage_path: string
          updated_at: string
          zoom_levels: Json
        }
        Insert: {
          bounds: Json
          created_at?: string
          file_size?: number | null
          id?: string
          name: string
          region: string
          storage_path: string
          updated_at?: string
          zoom_levels: Json
        }
        Update: {
          bounds?: Json
          created_at?: string
          file_size?: number | null
          id?: string
          name?: string
          region?: string
          storage_path?: string
          updated_at?: string
          zoom_levels?: Json
        }
        Relationships: []
      }
      places: {
        Row: {
          address: string | null
          category: string | null
          created_at: string
          description: string | null
          google_place_id: string | null
          id: string
          images: string[]
          location: Json
          name: string
          rating: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          google_place_id?: string | null
          id?: string
          images?: string[]
          location: Json
          name: string
          rating?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          google_place_id?: string | null
          id?: string
          images?: string[]
          location?: Json
          name?: string
          rating?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      thread_messages: {
        Row: {
          attachments: Json
          created_at: string
          edited_at: string | null
          id: string
          is_edited: boolean
          message: string
          thread_id: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          created_at?: string
          edited_at?: string | null
          id?: string
          is_edited?: boolean
          message: string
          thread_id: string
          user_id: string
        }
        Update: {
          attachments?: Json
          created_at?: string
          edited_at?: string | null
          id?: string
          is_edited?: boolean
          message?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "trip_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      trip_activities: {
        Row: {
          content: string
          created_at: string
          id: string
          is_resolved: boolean
          location_context: string | null
          metadata: Json
          parent_id: string | null
          trip_id: string
          type: Database["public"]["Enums"]["activity_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          location_context?: string | null
          metadata?: Json
          parent_id?: string | null
          trip_id: string
          type: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          location_context?: string | null
          metadata?: Json
          parent_id?: string | null
          trip_id?: string
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_activities_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "trip_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_activities_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      trip_chat_messages: {
        Row: {
          attachments: Json
          created_at: string
          edited_at: string | null
          id: string
          is_edited: boolean
          message: string
          trip_id: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          created_at?: string
          edited_at?: string | null
          id?: string
          is_edited?: boolean
          message: string
          trip_id: string
          user_id: string
        }
        Update: {
          attachments?: Json
          created_at?: string
          edited_at?: string | null
          id?: string
          is_edited?: boolean
          message?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_chat_messages_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      trip_threads: {
        Row: {
          created_at: string
          description: string | null
          id: string
          priority: string
          status: string
          tags: string[]
          title: string
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          status?: string
          tags?: string[]
          title: string
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          status?: string
          tags?: string[]
          title?: string
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_threads_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_threads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_unread_counts: {
        Args: {
          p_trip_id: string
        }
        Returns: {
          total_unread: number
          unread_comments: number
          unread_suggestions: number
          unread_changes: number
          unread_chat: number
          unread_threads: number
        }[]
      }
    }
    Enums: {
      activity_type: "comment" | "suggestion" | "change"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_notifications: {
        Row: {
          activity_id: string | null
          chat_message_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          read_at: string | null
          thread_id: string | null
          thread_message_id: string | null
          trip_id: string
          user_id: string
        }
        Insert: {
          activity_id?: string | null
          chat_message_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          read_at?: string | null
          thread_id?: string | null
          thread_message_id?: string | null
          trip_id: string
          user_id: string
        }
        Update: {
          activity_id?: string | null
          chat_message_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
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
        ]
      }
      activity_reactions: {
        Row: {
          activity_id: string | null
          chat_message_id: string | null
          created_at: string | null
          emoji: string
          id: string
          thread_message_id: string | null
          user_id: string
        }
        Insert: {
          activity_id?: string | null
          chat_message_id?: string | null
          created_at?: string | null
          emoji: string
          id?: string
          thread_message_id?: string | null
          user_id: string
        }
        Update: {
          activity_id?: string | null
          chat_message_id?: string | null
          created_at?: string | null
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
        ]
      }
      collaboration_sessions: {
        Row: {
          created_at: string | null
          cursor_position: Json | null
          id: string
          is_active: boolean | null
          itinerary_id: string
          last_seen: string | null
          selection: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          cursor_position?: Json | null
          id?: string
          is_active?: boolean | null
          itinerary_id: string
          last_seen?: string | null
          selection?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          cursor_position?: Json | null
          id?: string
          is_active?: boolean | null
          itinerary_id?: string
          last_seen?: string | null
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
        ]
      }
      itineraries: {
        Row: {
          collaborators: string[] | null
          created_at: string | null
          created_by: string
          description: string | null
          document: Json
          id: string
          is_public: boolean | null
          title: string
          updated_at: string | null
        }
        Insert: {
          collaborators?: string[] | null
          created_at?: string | null
          created_by: string
          description?: string | null
          document: Json
          id?: string
          is_public?: boolean | null
          title: string
          updated_at?: string | null
        }
        Update: {
          collaborators?: string[] | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          document?: Json
          id?: string
          is_public?: boolean | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      itinerary_places: {
        Row: {
          arrival_time: string | null
          created_at: string | null
          departure_time: string | null
          id: string
          itinerary_id: string
          notes: string | null
          order_index: number
          place_id: string
        }
        Insert: {
          arrival_time?: string | null
          created_at?: string | null
          departure_time?: string | null
          id?: string
          itinerary_id: string
          notes?: string | null
          order_index: number
          place_id: string
        }
        Update: {
          arrival_time?: string | null
          created_at?: string | null
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
          },
        ]
      }
      map_tiles: {
        Row: {
          bounds: Json
          created_at: string | null
          file_size: number | null
          id: string
          name: string
          region: string
          storage_path: string
          updated_at: string | null
          zoom_levels: Json
        }
        Insert: {
          bounds: Json
          created_at?: string | null
          file_size?: number | null
          id?: string
          name: string
          region: string
          storage_path: string
          updated_at?: string | null
          zoom_levels: Json
        }
        Update: {
          bounds?: Json
          created_at?: string | null
          file_size?: number | null
          id?: string
          name?: string
          region?: string
          storage_path?: string
          updated_at?: string | null
          zoom_levels?: Json
        }
        Relationships: []
      }
      places: {
        Row: {
          address: string | null
          category: string | null
          created_at: string | null
          description: string | null
          google_place_id: string | null
          id: string
          images: string[] | null
          location: Json
          name: string
          rating: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          google_place_id?: string | null
          id?: string
          images?: string[] | null
          location: Json
          name: string
          rating?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          google_place_id?: string | null
          id?: string
          images?: string[] | null
          location?: Json
          name?: string
          rating?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      thread_messages: {
        Row: {
          attachments: Json | null
          created_at: string | null
          edited_at: string | null
          id: string
          is_edited: boolean | null
          message: string
          thread_id: string
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          created_at?: string | null
          edited_at?: string | null
          id?: string
          is_edited?: boolean | null
          message: string
          thread_id: string
          user_id: string
        }
        Update: {
          attachments?: Json | null
          created_at?: string | null
          edited_at?: string | null
          id?: string
          is_edited?: boolean | null
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
        ]
      }
      trip_activities: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_resolved: boolean | null
          location_context: string | null
          metadata: Json | null
          parent_id: string | null
          trip_id: string
          type: Database["public"]["Enums"]["activity_type"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_resolved?: boolean | null
          location_context?: string | null
          metadata?: Json | null
          parent_id?: string | null
          trip_id: string
          type: Database["public"]["Enums"]["activity_type"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_resolved?: boolean | null
          location_context?: string | null
          metadata?: Json | null
          parent_id?: string | null
          trip_id?: string
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string | null
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
        ]
      }
      trip_chat_messages: {
        Row: {
          attachments: Json | null
          created_at: string | null
          edited_at: string | null
          id: string
          is_edited: boolean | null
          message: string
          trip_id: string
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          created_at?: string | null
          edited_at?: string | null
          id?: string
          is_edited?: boolean | null
          message: string
          trip_id: string
          user_id: string
        }
        Update: {
          attachments?: Json | null
          created_at?: string | null
          edited_at?: string | null
          id?: string
          is_edited?: boolean | null
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
        ]
      }
      trip_threads: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          priority: string | null
          status: string | null
          tags: string[] | null
          title: string
          trip_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          tags?: string[] | null
          title: string
          trip_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          tags?: string[] | null
          title?: string
          trip_id?: string
          updated_at?: string | null
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_unread_counts: {
        Args: { p_trip_id: string }
        Returns: {
          total_unread: number
          unread_changes: number
          unread_chat: number
          unread_comments: number
          unread_suggestions: number
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_type: ["comment", "suggestion", "change"],
    },
  },
} as const


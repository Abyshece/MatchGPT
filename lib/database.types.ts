// Generated from the live Supabase schema (project fmrbzzdjtarsaqvfukum).
// Regenerate after every migration, e.g.:
//   npx supabase gen types typescript --project-id fmrbzzdjtarsaqvfukum > lib/database.types.ts
// and keep the ProfileRow alias at the bottom.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit: {
        Row: {
          action: string
          admin_email: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          target_report_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_email: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_report_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_email?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_report_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_emails: {
        Row: {
          added_at: string
          added_by: string | null
          email: string
          notes: string | null
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          email: string
          notes?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string | null
          email?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_emails_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_emails_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_emails_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_emails_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
          reason: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          consented: boolean
          cookie_categories: Json | null
          created_at: string
          document_version: string | null
          email: string | null
          email_hash: string | null
          event_type: string
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          consented: boolean
          cookie_categories?: Json | null
          created_at?: string
          document_version?: string | null
          email?: string | null
          email_hash?: string | null
          event_type: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          consented?: boolean
          cookie_categories?: Json | null
          created_at?: string
          document_version?: string | null
          email?: string | null
          email_hash?: string | null
          event_type?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_export_log: {
        Row: {
          exported_at: string
          id: string
          user_id: string
        }
        Insert: {
          exported_at?: string
          id?: string
          user_id: string
        }
        Update: {
          exported_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_export_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_export_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_export_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_export_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_audit: {
        Row: {
          completed_at: string | null
          deleted_email: string | null
          deleted_user_id: string
          error_message: string | null
          id: string
          ip_address: unknown
          reason: string | null
          requested_at: string
          success: boolean | null
          user_agent: string | null
        }
        Insert: {
          completed_at?: string | null
          deleted_email?: string | null
          deleted_user_id: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          reason?: string | null
          requested_at?: string
          success?: boolean | null
          user_agent?: string | null
        }
        Update: {
          completed_at?: string | null
          deleted_email?: string | null
          deleted_user_id?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          reason?: string | null
          requested_at?: string
          success?: boolean | null
          user_agent?: string | null
        }
        Relationships: []
      }
      likes: {
        Row: {
          created_at: string
          id: string
          is_super_like: boolean | null
          liked_id: string
          liker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_super_like?: boolean | null
          liked_id: string
          liker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_super_like?: boolean | null
          liked_id?: string
          liker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_liked_id_fkey"
            columns: ["liked_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_liked_id_fkey"
            columns: ["liked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_liked_id_fkey"
            columns: ["liked_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_liked_id_fkey"
            columns: ["liked_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_liker_id_fkey"
            columns: ["liker_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_liker_id_fkey"
            columns: ["liker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_liker_id_fkey"
            columns: ["liker_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_liker_id_fkey"
            columns: ["liker_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          id: string
          unmatched_at: string | null
          unmatched_by: string | null
          user_a_id: string
          user_b_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          unmatched_at?: string | null
          unmatched_by?: string | null
          user_a_id: string
          user_b_id: string
        }
        Update: {
          created_at?: string
          id?: string
          unmatched_at?: string | null
          unmatched_by?: string | null
          user_a_id?: string
          user_b_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_unmatched_by_fkey"
            columns: ["unmatched_by"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_unmatched_by_fkey"
            columns: ["unmatched_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_unmatched_by_fkey"
            columns: ["unmatched_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_unmatched_by_fkey"
            columns: ["unmatched_by"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_a_id_fkey"
            columns: ["user_a_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_a_id_fkey"
            columns: ["user_a_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_a_id_fkey"
            columns: ["user_a_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_a_id_fkey"
            columns: ["user_a_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_b_id_fkey"
            columns: ["user_b_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_b_id_fkey"
            columns: ["user_b_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_b_id_fkey"
            columns: ["user_b_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_b_id_fkey"
            columns: ["user_b_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          match_id: string
          message_type: string | null
          read_at: string | null
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          match_id: string
          message_type?: string | null
          read_at?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          match_id?: string
          message_type?: string | null
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_created: string
          age: number | null
          age_changed_once: boolean | null
          attachment_style: string | null
          baking_interest: string | null
          ban_reason: string | null
          banned_at: string | null
          body_hair: string | null
          body_type: string | null
          can_cook: string | null
          childhood_description: string | null
          children: string | null
          clothing_style: string | null
          conflict_resolution: string | null
          cookie_preferences: Json | null
          covid_vaccine: string | null
          criminal_record: string | null
          daily_like_count: number | null
          daily_search_count: number | null
          daily_super_like_count: number | null
          dating_intention: string | null
          description: string | null
          dietary_preferences: string | null
          dream_house_type: string | null
          dresses_well: string | null
          drinking: string | null
          drives_car: string | null
          drugs: string | null
          education_level: string | null
          email: string | null
          email_verified: boolean | null
          ethnicity: string | null
          eye_color: string | null
          facebook: string | null
          facial_hair: string | null
          family_closeness: string | null
          family_health_history: string | null
          family_plans: string | null
          favorite_drink: string | null
          financial_approach: string | null
          financial_splitting: string | null
          future_plans: string | null
          gender: string | null
          gym_routine: string | null
          hair_color: string | null
          hair_type: string | null
          has_drivers_license: string | null
          has_tattoos: string | null
          height: string | null
          hidden_fields: string[] | null
          hobbies: string | null
          hometown: string | null
          hygiene: string | null
          id: string
          instagram: string | null
          interested_in: string | null
          interracial_marriage: string | null
          is_banned: boolean
          is_organised: string | null
          is_paused: boolean
          is_verified: boolean | null
          job_title: string | null
          languages: string | null
          last_active_at: string | null
          last_like_date: string | null
          last_search_date: string | null
          last_super_like_date: string | null
          linkedin: string | null
          living_preference: string | null
          location: string | null
          love_language: string | null
          loves_travel: string | null
          makeup_routine: string | null
          marijuana: string | null
          marketing_consent: boolean | null
          marriage_timeline: string | null
          music_genre: string | null
          name: string | null
          nationality_count: number | null
          next_travel_destination: string | null
          onboarding_complete: boolean | null
          paused_at: string | null
          pets: string | null
          phone_number: string | null
          phone_type: string | null
          phone_verified: boolean | null
          photo_urls: string[] | null
          politics: string | null
          privacy_accepted_at: string | null
          pronouns: string | null
          race: string | null
          reading_interest: string | null
          relationship_type: string | null
          religion: string | null
          settings_email_notifs: boolean | null
          settings_incognito: boolean | null
          settings_push_notifs: boolean | null
          settings_read_receipts: boolean | null
          settings_show_online: boolean | null
          settings_theme: string | null
          sex_style: string | null
          sexuality: string | null
          shopping_preference: string | null
          siblings: string | null
          sleep_schedule: string | null
          smoking: string | null
          snoring: string | null
          social_battery: string | null
          sports_interest: string | null
          subscription_renews_at: string | null
          subscription_tier: string | null
          terms_accepted_at: string | null
          therapy_history: string | null
          travel_style: string | null
          twitter: string | null
          university: string | null
          updated_at: string
          verification_status: string | null
          wears_glasses: string | null
          wears_jewelry: string | null
          wears_lenses: string | null
          work: string | null
          work_style: string | null
          zodiac: string | null
        }
        Insert: {
          account_created?: string
          age?: number | null
          age_changed_once?: boolean | null
          attachment_style?: string | null
          baking_interest?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          body_hair?: string | null
          body_type?: string | null
          can_cook?: string | null
          childhood_description?: string | null
          children?: string | null
          clothing_style?: string | null
          conflict_resolution?: string | null
          cookie_preferences?: Json | null
          covid_vaccine?: string | null
          criminal_record?: string | null
          daily_like_count?: number | null
          daily_search_count?: number | null
          daily_super_like_count?: number | null
          dating_intention?: string | null
          description?: string | null
          dietary_preferences?: string | null
          dream_house_type?: string | null
          dresses_well?: string | null
          drinking?: string | null
          drives_car?: string | null
          drugs?: string | null
          education_level?: string | null
          email?: string | null
          email_verified?: boolean | null
          ethnicity?: string | null
          eye_color?: string | null
          facebook?: string | null
          facial_hair?: string | null
          family_closeness?: string | null
          family_health_history?: string | null
          family_plans?: string | null
          favorite_drink?: string | null
          financial_approach?: string | null
          financial_splitting?: string | null
          future_plans?: string | null
          gender?: string | null
          gym_routine?: string | null
          hair_color?: string | null
          hair_type?: string | null
          has_drivers_license?: string | null
          has_tattoos?: string | null
          height?: string | null
          hidden_fields?: string[] | null
          hobbies?: string | null
          hometown?: string | null
          hygiene?: string | null
          id: string
          instagram?: string | null
          interested_in?: string | null
          interracial_marriage?: string | null
          is_banned?: boolean
          is_organised?: string | null
          is_paused?: boolean
          is_verified?: boolean | null
          job_title?: string | null
          languages?: string | null
          last_active_at?: string | null
          last_like_date?: string | null
          last_search_date?: string | null
          last_super_like_date?: string | null
          linkedin?: string | null
          living_preference?: string | null
          location?: string | null
          love_language?: string | null
          loves_travel?: string | null
          makeup_routine?: string | null
          marijuana?: string | null
          marketing_consent?: boolean | null
          marriage_timeline?: string | null
          music_genre?: string | null
          name?: string | null
          nationality_count?: number | null
          next_travel_destination?: string | null
          onboarding_complete?: boolean | null
          paused_at?: string | null
          pets?: string | null
          phone_number?: string | null
          phone_type?: string | null
          phone_verified?: boolean | null
          photo_urls?: string[] | null
          politics?: string | null
          privacy_accepted_at?: string | null
          pronouns?: string | null
          race?: string | null
          reading_interest?: string | null
          relationship_type?: string | null
          religion?: string | null
          settings_email_notifs?: boolean | null
          settings_incognito?: boolean | null
          settings_push_notifs?: boolean | null
          settings_read_receipts?: boolean | null
          settings_show_online?: boolean | null
          settings_theme?: string | null
          sex_style?: string | null
          sexuality?: string | null
          shopping_preference?: string | null
          siblings?: string | null
          sleep_schedule?: string | null
          smoking?: string | null
          snoring?: string | null
          social_battery?: string | null
          sports_interest?: string | null
          subscription_renews_at?: string | null
          subscription_tier?: string | null
          terms_accepted_at?: string | null
          therapy_history?: string | null
          travel_style?: string | null
          twitter?: string | null
          university?: string | null
          updated_at?: string
          verification_status?: string | null
          wears_glasses?: string | null
          wears_jewelry?: string | null
          wears_lenses?: string | null
          work?: string | null
          work_style?: string | null
          zodiac?: string | null
        }
        Update: {
          account_created?: string
          age?: number | null
          age_changed_once?: boolean | null
          attachment_style?: string | null
          baking_interest?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          body_hair?: string | null
          body_type?: string | null
          can_cook?: string | null
          childhood_description?: string | null
          children?: string | null
          clothing_style?: string | null
          conflict_resolution?: string | null
          cookie_preferences?: Json | null
          covid_vaccine?: string | null
          criminal_record?: string | null
          daily_like_count?: number | null
          daily_search_count?: number | null
          daily_super_like_count?: number | null
          dating_intention?: string | null
          description?: string | null
          dietary_preferences?: string | null
          dream_house_type?: string | null
          dresses_well?: string | null
          drinking?: string | null
          drives_car?: string | null
          drugs?: string | null
          education_level?: string | null
          email?: string | null
          email_verified?: boolean | null
          ethnicity?: string | null
          eye_color?: string | null
          facebook?: string | null
          facial_hair?: string | null
          family_closeness?: string | null
          family_health_history?: string | null
          family_plans?: string | null
          favorite_drink?: string | null
          financial_approach?: string | null
          financial_splitting?: string | null
          future_plans?: string | null
          gender?: string | null
          gym_routine?: string | null
          hair_color?: string | null
          hair_type?: string | null
          has_drivers_license?: string | null
          has_tattoos?: string | null
          height?: string | null
          hidden_fields?: string[] | null
          hobbies?: string | null
          hometown?: string | null
          hygiene?: string | null
          id?: string
          instagram?: string | null
          interested_in?: string | null
          interracial_marriage?: string | null
          is_banned?: boolean
          is_organised?: string | null
          is_paused?: boolean
          is_verified?: boolean | null
          job_title?: string | null
          languages?: string | null
          last_active_at?: string | null
          last_like_date?: string | null
          last_search_date?: string | null
          last_super_like_date?: string | null
          linkedin?: string | null
          living_preference?: string | null
          location?: string | null
          love_language?: string | null
          loves_travel?: string | null
          makeup_routine?: string | null
          marijuana?: string | null
          marketing_consent?: boolean | null
          marriage_timeline?: string | null
          music_genre?: string | null
          name?: string | null
          nationality_count?: number | null
          next_travel_destination?: string | null
          onboarding_complete?: boolean | null
          paused_at?: string | null
          pets?: string | null
          phone_number?: string | null
          phone_type?: string | null
          phone_verified?: boolean | null
          photo_urls?: string[] | null
          politics?: string | null
          privacy_accepted_at?: string | null
          pronouns?: string | null
          race?: string | null
          reading_interest?: string | null
          relationship_type?: string | null
          religion?: string | null
          settings_email_notifs?: boolean | null
          settings_incognito?: boolean | null
          settings_push_notifs?: boolean | null
          settings_read_receipts?: boolean | null
          settings_show_online?: boolean | null
          settings_theme?: string | null
          sex_style?: string | null
          sexuality?: string | null
          shopping_preference?: string | null
          siblings?: string | null
          sleep_schedule?: string | null
          smoking?: string | null
          snoring?: string | null
          social_battery?: string | null
          sports_interest?: string | null
          subscription_renews_at?: string | null
          subscription_tier?: string | null
          terms_accepted_at?: string | null
          therapy_history?: string | null
          travel_style?: string | null
          twitter?: string | null
          university?: string | null
          updated_at?: string
          verification_status?: string | null
          wears_glasses?: string | null
          wears_jewelry?: string | null
          wears_lenses?: string | null
          work?: string | null
          work_style?: string | null
          zodiac?: string | null
        }
        Relationships: []
      }
      push_queue: {
        Row: {
          body: string
          created_at: string
          data: Json | null
          event_type: string
          failed_count: number
          id: string
          scheduled_at: string
          sent_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json | null
          event_type: string
          failed_count?: number
          id?: string
          scheduled_at?: string
          sent_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json | null
          event_type?: string
          failed_count?: number
          id?: string
          scheduled_at?: string
          sent_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_active_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_active_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_active_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          admin_notes: string | null
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_id: string
          reporter_id: string
          resolved_at: string | null
          status: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reported_id: string
          reporter_id: string
          resolved_at?: string | null
          status?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_id?: string
          reporter_id?: string
          resolved_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_history: {
        Row: {
          created_at: string
          filters: Json
          id: string
          pool_size: number
          prompt: string
          result_ids: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          pool_size?: number
          prompt?: string
          result_ids?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          pool_size?: number
          prompt?: string
          result_ids?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      standouts: {
        Row: {
          candidate_id: string
          created_at: string
          for_date: string
          id: string
          rank: number
          user_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          for_date?: string
          id?: string
          rank: number
          user_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          for_date?: string
          id?: string
          rank?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "standouts_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standouts_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standouts_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standouts_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          facebook_url: string | null
          id: string
          instagram_url: string | null
          linkedin_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          twitter_url: string | null
          user_id: string
          user_notes: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          linkedin_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          twitter_url?: string | null
          user_id: string
          user_notes?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          linkedin_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          twitter_url?: string | null
          user_id?: string
          user_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      eligible_profiles: {
        Row: {
          age: number | null
          attachment_style: string | null
          body_type: string | null
          children: string | null
          conflict_resolution: string | null
          dating_intention: string | null
          description: string | null
          drinking: string | null
          drugs: string | null
          education_level: string | null
          ethnicity: string | null
          eye_color: string | null
          facebook: string | null
          family_plans: string | null
          financial_approach: string | null
          gender: string | null
          hair_color: string | null
          height: string | null
          hidden_fields: string[] | null
          hobbies: string | null
          hometown: string | null
          id: string | null
          instagram: string | null
          interested_in: string | null
          is_verified: boolean | null
          job_title: string | null
          languages: string | null
          last_active_at: string | null
          linkedin: string | null
          location: string | null
          love_language: string | null
          marijuana: string | null
          marriage_timeline: string | null
          music_genre: string | null
          name: string | null
          onboarding_complete: boolean | null
          pets: string | null
          photo_urls: string[] | null
          politics: string | null
          pronouns: string | null
          race: string | null
          reading_interest: string | null
          relationship_type: string | null
          religion: string | null
          settings_incognito: boolean | null
          settings_show_online: boolean | null
          sexuality: string | null
          smoking: string | null
          social_battery: string | null
          sports_interest: string | null
          subscription_tier: string | null
          travel_style: string | null
          twitter: string | null
          university: string | null
          work: string | null
          work_style: string | null
          zodiac: string | null
        }
        Insert: {
          age?: number | null
          attachment_style?: string | null
          body_type?: string | null
          children?: string | null
          conflict_resolution?: string | null
          dating_intention?: string | null
          description?: string | null
          drinking?: string | null
          drugs?: string | null
          education_level?: string | null
          ethnicity?: string | null
          eye_color?: string | null
          facebook?: string | null
          family_plans?: string | null
          financial_approach?: string | null
          gender?: string | null
          hair_color?: string | null
          height?: string | null
          hidden_fields?: string[] | null
          hobbies?: string | null
          hometown?: string | null
          id?: string | null
          instagram?: string | null
          interested_in?: string | null
          is_verified?: boolean | null
          job_title?: string | null
          languages?: string | null
          last_active_at?: never
          linkedin?: string | null
          location?: string | null
          love_language?: string | null
          marijuana?: string | null
          marriage_timeline?: string | null
          music_genre?: string | null
          name?: string | null
          onboarding_complete?: boolean | null
          pets?: string | null
          photo_urls?: string[] | null
          politics?: string | null
          pronouns?: string | null
          race?: string | null
          reading_interest?: string | null
          relationship_type?: string | null
          religion?: string | null
          settings_incognito?: boolean | null
          settings_show_online?: boolean | null
          sexuality?: string | null
          smoking?: string | null
          social_battery?: string | null
          sports_interest?: string | null
          subscription_tier?: string | null
          travel_style?: string | null
          twitter?: string | null
          university?: string | null
          work?: string | null
          work_style?: string | null
          zodiac?: string | null
        }
        Update: {
          age?: number | null
          attachment_style?: string | null
          body_type?: string | null
          children?: string | null
          conflict_resolution?: string | null
          dating_intention?: string | null
          description?: string | null
          drinking?: string | null
          drugs?: string | null
          education_level?: string | null
          ethnicity?: string | null
          eye_color?: string | null
          facebook?: string | null
          family_plans?: string | null
          financial_approach?: string | null
          gender?: string | null
          hair_color?: string | null
          height?: string | null
          hidden_fields?: string[] | null
          hobbies?: string | null
          hometown?: string | null
          id?: string | null
          instagram?: string | null
          interested_in?: string | null
          is_verified?: boolean | null
          job_title?: string | null
          languages?: string | null
          last_active_at?: never
          linkedin?: string | null
          location?: string | null
          love_language?: string | null
          marijuana?: string | null
          marriage_timeline?: string | null
          music_genre?: string | null
          name?: string | null
          onboarding_complete?: boolean | null
          pets?: string | null
          photo_urls?: string[] | null
          politics?: string | null
          pronouns?: string | null
          race?: string | null
          reading_interest?: string | null
          relationship_type?: string | null
          religion?: string | null
          settings_incognito?: boolean | null
          settings_show_online?: boolean | null
          sexuality?: string | null
          smoking?: string | null
          social_battery?: string | null
          sports_interest?: string | null
          subscription_tier?: string | null
          travel_style?: string | null
          twitter?: string | null
          university?: string | null
          work?: string | null
          work_style?: string | null
          zodiac?: string | null
        }
        Relationships: []
      }
      my_blocked_ids: {
        Row: {
          other_id: string | null
        }
        Relationships: []
      }
      pending_pushes: {
        Row: {
          auth: string | null
          body: string | null
          data: Json | null
          endpoint: string | null
          event_type: string | null
          failure_count: number | null
          p256dh: string | null
          queue_id: string | null
          subscription_id: string | null
          title: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "visible_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_profiles: {
        Row: {
          age: number | null
          body_type: string | null
          children: string | null
          dating_intention: string | null
          description: string | null
          drinking: string | null
          education_level: string | null
          ethnicity: string | null
          facebook: string | null
          family_plans: string | null
          gender: string | null
          height: string | null
          hidden_fields: string[] | null
          hobbies: string | null
          hometown: string | null
          id: string | null
          instagram: string | null
          is_banned: boolean | null
          is_paused: boolean | null
          is_verified: boolean | null
          job_title: string | null
          languages: string | null
          last_active_at: string | null
          linkedin: string | null
          location: string | null
          marriage_timeline: string | null
          name: string | null
          photo_urls: string[] | null
          pronouns: string | null
          relationship_type: string | null
          religion: string | null
          smoking: string | null
          subscription_tier: string | null
          twitter: string | null
          work: string | null
        }
        Insert: {
          age?: number | null
          body_type?: string | null
          children?: string | null
          dating_intention?: string | null
          description?: string | null
          drinking?: string | null
          education_level?: string | null
          ethnicity?: string | null
          facebook?: string | null
          family_plans?: string | null
          gender?: string | null
          height?: string | null
          hidden_fields?: string[] | null
          hobbies?: string | null
          hometown?: string | null
          id?: string | null
          instagram?: string | null
          is_banned?: boolean | null
          is_paused?: boolean | null
          is_verified?: boolean | null
          job_title?: string | null
          languages?: string | null
          last_active_at?: never
          linkedin?: string | null
          location?: string | null
          marriage_timeline?: string | null
          name?: string | null
          photo_urls?: string[] | null
          pronouns?: string | null
          relationship_type?: string | null
          religion?: string | null
          smoking?: string | null
          subscription_tier?: string | null
          twitter?: string | null
          work?: string | null
        }
        Update: {
          age?: number | null
          body_type?: string | null
          children?: string | null
          dating_intention?: string | null
          description?: string | null
          drinking?: string | null
          education_level?: string | null
          ethnicity?: string | null
          facebook?: string | null
          family_plans?: string | null
          gender?: string | null
          height?: string | null
          hidden_fields?: string[] | null
          hobbies?: string | null
          hometown?: string | null
          id?: string | null
          instagram?: string | null
          is_banned?: boolean | null
          is_paused?: boolean | null
          is_verified?: boolean | null
          job_title?: string | null
          languages?: string | null
          last_active_at?: never
          linkedin?: string | null
          location?: string | null
          marriage_timeline?: string | null
          name?: string | null
          photo_urls?: string[] | null
          pronouns?: string | null
          relationship_type?: string | null
          religion?: string | null
          smoking?: string | null
          subscription_tier?: string | null
          twitter?: string | null
          work?: string | null
        }
        Relationships: []
      }
      visible_profiles: {
        Row: {
          account_created: string | null
          age: number | null
          age_changed_once: boolean | null
          attachment_style: string | null
          baking_interest: string | null
          ban_reason: string | null
          banned_at: string | null
          body_hair: string | null
          body_type: string | null
          can_cook: string | null
          childhood_description: string | null
          children: string | null
          clothing_style: string | null
          conflict_resolution: string | null
          cookie_preferences: Json | null
          covid_vaccine: string | null
          criminal_record: string | null
          daily_like_count: number | null
          daily_search_count: number | null
          daily_super_like_count: number | null
          dating_intention: string | null
          description: string | null
          dietary_preferences: string | null
          dream_house_type: string | null
          dresses_well: string | null
          drinking: string | null
          drives_car: string | null
          drugs: string | null
          education_level: string | null
          email: string | null
          email_verified: boolean | null
          ethnicity: string | null
          eye_color: string | null
          facebook: string | null
          facial_hair: string | null
          family_closeness: string | null
          family_health_history: string | null
          family_plans: string | null
          favorite_drink: string | null
          financial_approach: string | null
          financial_splitting: string | null
          future_plans: string | null
          gender: string | null
          gym_routine: string | null
          hair_color: string | null
          hair_type: string | null
          has_drivers_license: string | null
          has_tattoos: string | null
          height: string | null
          hidden_fields: string[] | null
          hobbies: string | null
          hometown: string | null
          hygiene: string | null
          id: string | null
          instagram: string | null
          interested_in: string | null
          interracial_marriage: string | null
          is_banned: boolean | null
          is_organised: string | null
          is_verified: boolean | null
          job_title: string | null
          languages: string | null
          last_active_at: string | null
          last_like_date: string | null
          last_search_date: string | null
          last_super_like_date: string | null
          linkedin: string | null
          living_preference: string | null
          location: string | null
          love_language: string | null
          loves_travel: string | null
          makeup_routine: string | null
          marijuana: string | null
          marketing_consent: boolean | null
          marriage_timeline: string | null
          music_genre: string | null
          name: string | null
          nationality_count: number | null
          next_travel_destination: string | null
          onboarding_complete: boolean | null
          pets: string | null
          phone_number: string | null
          phone_type: string | null
          phone_verified: boolean | null
          photo_urls: string[] | null
          politics: string | null
          privacy_accepted_at: string | null
          pronouns: string | null
          race: string | null
          reading_interest: string | null
          relationship_type: string | null
          religion: string | null
          settings_email_notifs: boolean | null
          settings_incognito: boolean | null
          settings_push_notifs: boolean | null
          settings_read_receipts: boolean | null
          settings_show_online: boolean | null
          settings_theme: string | null
          sex_style: string | null
          sexuality: string | null
          shopping_preference: string | null
          siblings: string | null
          sleep_schedule: string | null
          smoking: string | null
          snoring: string | null
          social_battery: string | null
          sports_interest: string | null
          subscription_renews_at: string | null
          subscription_tier: string | null
          terms_accepted_at: string | null
          therapy_history: string | null
          travel_style: string | null
          twitter: string | null
          university: string | null
          updated_at: string | null
          verification_status: string | null
          wears_glasses: string | null
          wears_jewelry: string | null
          wears_lenses: string | null
          work: string | null
          work_style: string | null
          zodiac: string | null
        }
        Insert: {
          account_created?: string | null
          age?: number | null
          age_changed_once?: boolean | null
          attachment_style?: string | null
          baking_interest?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          body_hair?: string | null
          body_type?: string | null
          can_cook?: string | null
          childhood_description?: string | null
          children?: string | null
          clothing_style?: string | null
          conflict_resolution?: string | null
          cookie_preferences?: Json | null
          covid_vaccine?: string | null
          criminal_record?: string | null
          daily_like_count?: number | null
          daily_search_count?: number | null
          daily_super_like_count?: number | null
          dating_intention?: string | null
          description?: string | null
          dietary_preferences?: string | null
          dream_house_type?: string | null
          dresses_well?: string | null
          drinking?: string | null
          drives_car?: string | null
          drugs?: string | null
          education_level?: string | null
          email?: string | null
          email_verified?: boolean | null
          ethnicity?: string | null
          eye_color?: string | null
          facebook?: string | null
          facial_hair?: string | null
          family_closeness?: string | null
          family_health_history?: string | null
          family_plans?: string | null
          favorite_drink?: string | null
          financial_approach?: string | null
          financial_splitting?: string | null
          future_plans?: string | null
          gender?: string | null
          gym_routine?: string | null
          hair_color?: string | null
          hair_type?: string | null
          has_drivers_license?: string | null
          has_tattoos?: string | null
          height?: string | null
          hidden_fields?: string[] | null
          hobbies?: string | null
          hometown?: string | null
          hygiene?: string | null
          id?: string | null
          instagram?: string | null
          interested_in?: string | null
          interracial_marriage?: string | null
          is_banned?: boolean | null
          is_organised?: string | null
          is_verified?: boolean | null
          job_title?: string | null
          languages?: string | null
          last_active_at?: string | null
          last_like_date?: string | null
          last_search_date?: string | null
          last_super_like_date?: string | null
          linkedin?: string | null
          living_preference?: string | null
          location?: string | null
          love_language?: string | null
          loves_travel?: string | null
          makeup_routine?: string | null
          marijuana?: string | null
          marketing_consent?: boolean | null
          marriage_timeline?: string | null
          music_genre?: string | null
          name?: string | null
          nationality_count?: number | null
          next_travel_destination?: string | null
          onboarding_complete?: boolean | null
          pets?: string | null
          phone_number?: string | null
          phone_type?: string | null
          phone_verified?: boolean | null
          photo_urls?: string[] | null
          politics?: string | null
          privacy_accepted_at?: string | null
          pronouns?: string | null
          race?: string | null
          reading_interest?: string | null
          relationship_type?: string | null
          religion?: string | null
          settings_email_notifs?: boolean | null
          settings_incognito?: boolean | null
          settings_push_notifs?: boolean | null
          settings_read_receipts?: boolean | null
          settings_show_online?: boolean | null
          settings_theme?: string | null
          sex_style?: string | null
          sexuality?: string | null
          shopping_preference?: string | null
          siblings?: string | null
          sleep_schedule?: string | null
          smoking?: string | null
          snoring?: string | null
          social_battery?: string | null
          sports_interest?: string | null
          subscription_renews_at?: string | null
          subscription_tier?: string | null
          terms_accepted_at?: string | null
          therapy_history?: string | null
          travel_style?: string | null
          twitter?: string | null
          university?: string | null
          updated_at?: string | null
          verification_status?: string | null
          wears_glasses?: string | null
          wears_jewelry?: string | null
          wears_lenses?: string | null
          work?: string | null
          work_style?: string | null
          zodiac?: string | null
        }
        Update: {
          account_created?: string | null
          age?: number | null
          age_changed_once?: boolean | null
          attachment_style?: string | null
          baking_interest?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          body_hair?: string | null
          body_type?: string | null
          can_cook?: string | null
          childhood_description?: string | null
          children?: string | null
          clothing_style?: string | null
          conflict_resolution?: string | null
          cookie_preferences?: Json | null
          covid_vaccine?: string | null
          criminal_record?: string | null
          daily_like_count?: number | null
          daily_search_count?: number | null
          daily_super_like_count?: number | null
          dating_intention?: string | null
          description?: string | null
          dietary_preferences?: string | null
          dream_house_type?: string | null
          dresses_well?: string | null
          drinking?: string | null
          drives_car?: string | null
          drugs?: string | null
          education_level?: string | null
          email?: string | null
          email_verified?: boolean | null
          ethnicity?: string | null
          eye_color?: string | null
          facebook?: string | null
          facial_hair?: string | null
          family_closeness?: string | null
          family_health_history?: string | null
          family_plans?: string | null
          favorite_drink?: string | null
          financial_approach?: string | null
          financial_splitting?: string | null
          future_plans?: string | null
          gender?: string | null
          gym_routine?: string | null
          hair_color?: string | null
          hair_type?: string | null
          has_drivers_license?: string | null
          has_tattoos?: string | null
          height?: string | null
          hidden_fields?: string[] | null
          hobbies?: string | null
          hometown?: string | null
          hygiene?: string | null
          id?: string | null
          instagram?: string | null
          interested_in?: string | null
          interracial_marriage?: string | null
          is_banned?: boolean | null
          is_organised?: string | null
          is_verified?: boolean | null
          job_title?: string | null
          languages?: string | null
          last_active_at?: string | null
          last_like_date?: string | null
          last_search_date?: string | null
          last_super_like_date?: string | null
          linkedin?: string | null
          living_preference?: string | null
          location?: string | null
          love_language?: string | null
          loves_travel?: string | null
          makeup_routine?: string | null
          marijuana?: string | null
          marketing_consent?: boolean | null
          marriage_timeline?: string | null
          music_genre?: string | null
          name?: string | null
          nationality_count?: number | null
          next_travel_destination?: string | null
          onboarding_complete?: boolean | null
          pets?: string | null
          phone_number?: string | null
          phone_type?: string | null
          phone_verified?: boolean | null
          photo_urls?: string[] | null
          politics?: string | null
          privacy_accepted_at?: string | null
          pronouns?: string | null
          race?: string | null
          reading_interest?: string | null
          relationship_type?: string | null
          religion?: string | null
          settings_email_notifs?: boolean | null
          settings_incognito?: boolean | null
          settings_push_notifs?: boolean | null
          settings_read_receipts?: boolean | null
          settings_show_online?: boolean | null
          settings_theme?: string | null
          sex_style?: string | null
          sexuality?: string | null
          shopping_preference?: string | null
          siblings?: string | null
          sleep_schedule?: string | null
          smoking?: string | null
          snoring?: string | null
          social_battery?: string | null
          sports_interest?: string | null
          subscription_renews_at?: string | null
          subscription_tier?: string | null
          terms_accepted_at?: string | null
          therapy_history?: string | null
          travel_style?: string | null
          twitter?: string | null
          university?: string | null
          updated_at?: string | null
          verification_status?: string | null
          wears_glasses?: string | null
          wears_jewelry?: string | null
          wears_lenses?: string | null
          work?: string | null
          work_style?: string | null
          zodiac?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_ban_user: {
        Args: { reason: string; target_id: string }
        Returns: undefined
      }
      admin_list_reports: {
        Args: { p_pending_only?: boolean }
        Returns: {
          admin_notes: string
          created_at: string
          details: string
          id: string
          reason: string
          reported_email: string
          reported_id: string
          reported_name: string
          reporter_email: string
          reporter_id: string
          reporter_name: string
          resolved_at: string
          status: string
        }[]
      }
      admin_pending_verifications: {
        Args: never
        Returns: {
          facebook_url: string
          instagram_url: string
          linkedin_url: string
          request_id: string
          requested_at: string
          twitter_url: string
          user_email: string
          user_id: string
          user_name: string
          user_notes: string
          user_photo_urls: string[]
        }[]
      }
      admin_platform_stats: { Args: never; Returns: Json }
      admin_review_verification: {
        Args: { decision: string; notes: string; request_id: string }
        Returns: undefined
      }
      admin_search_users: {
        Args: { p_limit?: number; p_query?: string }
        Returns: {
          account_created: string
          age: number
          ban_reason: string
          banned_at: string
          daily_like_count: number
          daily_search_count: number
          email: string
          id: string
          is_banned: boolean
          is_verified: boolean
          location: string
          name: string
          subscription_tier: string
        }[]
      }
      admin_unban_user: { Args: { target_id: string }; Returns: undefined }
      admin_update_report: {
        Args: { new_status: string; notes: string; report_id: string }
        Returns: undefined
      }
      admin_verify_user: { Args: { target_id: string }; Returns: undefined }
      export_my_data: { Args: never; Returns: Json }
      get_likes_received: {
        Args: { p_user_id: string }
        Returns: {
          is_super_like: boolean
          like_id: string
          liked_at: string
          liker_age: number
          liker_description: string
          liker_hidden_fields: string[]
          liker_id: string
          liker_is_verified: boolean
          liker_location: string
          liker_name: string
          liker_photos: string[]
          liker_subscription_tier: string
        }[]
      }
      get_matches_with_profile: {
        Args: { p_user_id: string }
        Returns: {
          last_message_at: string
          last_message_content: string
          last_message_sender_id: string
          match_id: string
          matched_at: string
          other_age: number
          other_hidden_fields: string[]
          other_is_verified: boolean
          other_location: string
          other_name: string
          other_photos: string[]
          other_subscription_tier: string
          other_user_id: string
          unread_count: number
        }[]
      }
      increment_push_failure: { Args: { sub_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      mark_messages_read: { Args: { p_match_id: string }; Returns: number }
      save_vapid_keys: {
        Args: { p_private_key: string; p_public_key: string }
        Returns: {
          vapid_private_key: string
          vapid_public_key: string
        }[]
      }
      send_push_config: {
        Args: never
        Returns: {
          cron_secret: string
          vapid_private_key: string
          vapid_public_key: string
        }[]
      }
      submit_verification_request: {
        Args: {
          p_facebook_url: string
          p_instagram_url: string
          p_linkedin_url: string
          p_twitter_url: string
          p_user_notes: string
        }
        Returns: string
      }
      unmatch: { Args: { p_match_id: string }; Returns: undefined }
      vapid_public_key: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// ---- App alias (not generated) ----

export type ProfileRow = Tables<'profiles'>;

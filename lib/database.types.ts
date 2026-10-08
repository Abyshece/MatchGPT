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
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          id: boolean
          pro_for_all: boolean
          updated_at: string
        }
        Insert: {
          id?: boolean
          pro_for_all?: boolean
          updated_at?: string
        }
        Update: {
          id?: boolean
          pro_for_all?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      apple_sign_in_tokens: {
        Row: {
          created_at: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "apple_sign_in_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          event: string
          id: string
          received_at: string
        }
        Insert: {
          event: string
          id: string
          received_at?: string
        }
        Update: {
          event?: string
          id?: string
          received_at?: string
        }
        Relationships: []
      }
      billing_plans: {
        Row: {
          amount: number
          apple_product_id: string | null
          currency: string
          google_base_plan_id: string | null
          google_product_id: string | null
          id: string
          is_active: boolean
          name: string
          period: string
          updated_at: string
        }
        Insert: {
          amount: number
          apple_product_id?: string | null
          currency?: string
          google_base_plan_id?: string | null
          google_product_id?: string | null
          id: string
          is_active?: boolean
          name: string
          period: string
          updated_at?: string
        }
        Update: {
          amount?: number
          apple_product_id?: string | null
          currency?: string
          google_base_plan_id?: string | null
          google_product_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          period?: string
          updated_at?: string
        }
        Relationships: []
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          ai_assisted: boolean
          author_name: string
          content: string
          cover_alt: string
          cover_url: string | null
          created_at: string
          created_by: string | null
          excerpt: string
          focus_keyword: string
          id: string
          noindex: boolean
          published_at: string | null
          seo_description: string
          seo_title: string
          slug: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          updated_by: string | null
          word_count: number
        }
        Insert: {
          ai_assisted?: boolean
          author_name?: string
          content?: string
          cover_alt?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string
          focus_keyword?: string
          id?: string
          noindex?: boolean
          published_at?: string | null
          seo_description?: string
          seo_title?: string
          slug: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_assisted?: boolean
          author_name?: string
          content?: string
          cover_alt?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string
          focus_keyword?: string
          id?: string
          noindex?: boolean
          published_at?: string | null
          seo_description?: string
          seo_title?: string
          slug?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      blog_views: {
        Row: {
          post_id: string
          views: number
        }
        Insert: {
          post_id: string
          views?: number
        }
        Update: {
          post_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "blog_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "blog_posts"
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
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
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
      error_reports: {
        Row: {
          app_version: string | null
          day: string
          first_seen_at: string
          fingerprint: string
          fixed_at: string | null
          id: number
          last_seen_at: string
          message: string
          platform: string
          screen: string | null
          stack: string | null
          times: number
          user_agent: string | null
        }
        Insert: {
          app_version?: string | null
          day?: string
          first_seen_at?: string
          fingerprint: string
          fixed_at?: string | null
          id?: never
          last_seen_at?: string
          message: string
          platform: string
          screen?: string | null
          stack?: string | null
          times?: number
          user_agent?: string | null
        }
        Update: {
          app_version?: string | null
          day?: string
          first_seen_at?: string
          fingerprint?: string
          fixed_at?: string | null
          id?: never
          last_seen_at?: string
          message?: string
          platform?: string
          screen?: string | null
          stack?: string | null
          times?: number
          user_agent?: string | null
        }
        Relationships: []
      }
      grievances: {
        Row: {
          about: string | null
          acknowledged_at: string
          category: string
          created_at: string
          details: string
          due_at: string
          email: string
          handled_by: string | null
          id: string
          ip_address: unknown
          name: string
          on_behalf: boolean
          phone: string | null
          resolution: string | null
          resolved_at: string | null
          status: string
          ticket: string
          user_id: string | null
        }
        Insert: {
          about?: string | null
          acknowledged_at?: string
          category: string
          created_at?: string
          details: string
          due_at: string
          email: string
          handled_by?: string | null
          id?: string
          ip_address?: unknown
          name: string
          on_behalf?: boolean
          phone?: string | null
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          ticket?: string
          user_id?: string | null
        }
        Update: {
          about?: string | null
          acknowledged_at?: string
          category?: string
          created_at?: string
          details?: string
          due_at?: string
          email?: string
          handled_by?: string | null
          id?: string
          ip_address?: unknown
          name?: string
          on_behalf?: boolean
          phone?: string | null
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          ticket?: string
          user_id?: string | null
        }
        Relationships: []
      }
      legal_holds: {
        Row: {
          created_at: string
          data: Json
          id: string
          kind: string
          purge_after: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          kind: string
          purge_after: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          purge_after?: string
          user_id?: string
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_liker_id_fkey"
            columns: ["liker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
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
            foreignKeyName: "matches_user_b_id_fkey"
            columns: ["user_b_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          active: boolean
          banner_text: string
          code: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          starts_at: string
          stores: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          banner_text: string
          code: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          starts_at?: string
          stores?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          banner_text?: string
          code?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          starts_at?: string
          stores?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          fee_amount: number | null
          fee_estimated: boolean
          id: string
          method: string | null
          paid_at: string
          provider: string
          refunded_amount: number
          refunded_at: string | null
          status: string
          store_order_id: string
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          fee_amount?: number | null
          fee_estimated?: boolean
          id?: string
          method?: string | null
          paid_at?: string
          provider: string
          refunded_amount?: number
          refunded_at?: string | null
          status: string
          store_order_id: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          fee_amount?: number | null
          fee_estimated?: boolean
          id?: string
          method?: string | null
          paid_at?: string
          provider?: string
          refunded_amount?: number
          refunded_at?: string | null
          status?: string
          store_order_id?: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          about_family: string | null
          account_created: string
          age: number | null
          age_changed_once: boolean | null
          annual_income: string | null
          attachment_style: string | null
          baking_interest: string | null
          ban_reason: string | null
          banned_at: string | null
          birth_place: string | null
          birth_time: string | null
          body_hair: string | null
          body_type: string | null
          brothers: string | null
          brothers_married: string | null
          can_cook: string | null
          caste: string | null
          childhood_description: string | null
          children: string | null
          children_count: string | null
          city: string | null
          clothing_style: string | null
          conflict_resolution: string | null
          cookie_preferences: Json | null
          country: string | null
          covid_vaccine: string | null
          criminal_record: string | null
          daily_like_count: number | null
          daily_search_count: number | null
          daily_super_like_count: number | null
          date_of_birth: string | null
          dating_intention: string | null
          degree: string | null
          description: string | null
          dietary_preferences: string | null
          disability: string | null
          dream_house_type: string | null
          dresses_well: string | null
          drinking: string | null
          drives_car: string | null
          drugs: string | null
          education_level: string | null
          email: string | null
          email_verified: boolean | null
          employed_in: string | null
          ethnicity: string | null
          eye_color: string | null
          facebook: string | null
          facial_hair: string | null
          family_closeness: string | null
          family_health_history: string | null
          family_location: string | null
          family_plans: string | null
          family_status: string | null
          family_type: string | null
          family_values: string | null
          father_occupation: string | null
          favorite_drink: string | null
          financial_approach: string | null
          financial_splitting: string | null
          future_plans: string | null
          gender: string | null
          gotra: string | null
          gym_routine: string | null
          hair_color: string | null
          hair_type: string | null
          has_drivers_license: string | null
          has_tattoos: string | null
          height: string | null
          height_cm: number | null
          hidden_fields: string[] | null
          hobbies: string | null
          hometown: string | null
          horoscope_match: string | null
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
          living_with_family: string | null
          location: string | null
          love_language: string | null
          loves_travel: string | null
          makeup_routine: string | null
          manglik: string | null
          marijuana: string | null
          marital_status: string | null
          marketing_consent: boolean | null
          marriage_timeline: string | null
          mother_occupation: string | null
          mother_tongue: string | null
          music_genre: string | null
          nakshatra: string | null
          name: string | null
          nationality_count: number | null
          next_travel_destination: string | null
          occupation: string | null
          onboarding_complete: boolean | null
          open_to_other_communities: string | null
          paused_at: string | null
          pets: string | null
          phone_number: string | null
          phone_type: string | null
          phone_verified: boolean | null
          photo_urls: string[] | null
          politics: string | null
          privacy_accepted_at: string | null
          privacy_version: string | null
          profile_created_for: string | null
          profile_nudged_at: string | null
          pronouns: string | null
          race: string | null
          rashi: string | null
          rules_reminded_at: string | null
          reading_interest: string | null
          relationship_type: string | null
          religion: string | null
          residential_status: string | null
          search_bonus: number
          sect: string | null
          settings_email_notifs: boolean | null
          settings_incognito: boolean | null
          settings_push_notifs: boolean | null
          settings_read_receipts: boolean | null
          settings_show_online: boolean | null
          settings_theme: string | null
          settling_abroad: string | null
          sex_style: string | null
          sexuality: string | null
          shopping_preference: string | null
          siblings: string | null
          sisters: string | null
          sisters_married: string | null
          sleep_schedule: string | null
          smoking: string | null
          snoring: string | null
          social_battery: string | null
          sports_interest: string | null
          state: string | null
          sub_caste: string | null
          subscription_renews_at: string | null
          subscription_tier: string | null
          terms_accepted_at: string | null
          terms_version: string | null
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
          about_family?: string | null
          account_created?: string
          age?: number | null
          age_changed_once?: boolean | null
          annual_income?: string | null
          attachment_style?: string | null
          baking_interest?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          birth_place?: string | null
          birth_time?: string | null
          body_hair?: string | null
          body_type?: string | null
          brothers?: string | null
          brothers_married?: string | null
          can_cook?: string | null
          caste?: string | null
          childhood_description?: string | null
          children?: string | null
          children_count?: string | null
          city?: string | null
          clothing_style?: string | null
          conflict_resolution?: string | null
          cookie_preferences?: Json | null
          country?: string | null
          covid_vaccine?: string | null
          criminal_record?: string | null
          daily_like_count?: number | null
          daily_search_count?: number | null
          daily_super_like_count?: number | null
          date_of_birth?: string | null
          dating_intention?: string | null
          degree?: string | null
          description?: string | null
          dietary_preferences?: string | null
          disability?: string | null
          dream_house_type?: string | null
          dresses_well?: string | null
          drinking?: string | null
          drives_car?: string | null
          drugs?: string | null
          education_level?: string | null
          email?: string | null
          email_verified?: boolean | null
          employed_in?: string | null
          ethnicity?: string | null
          eye_color?: string | null
          facebook?: string | null
          facial_hair?: string | null
          family_closeness?: string | null
          family_health_history?: string | null
          family_location?: string | null
          family_plans?: string | null
          family_status?: string | null
          family_type?: string | null
          family_values?: string | null
          father_occupation?: string | null
          favorite_drink?: string | null
          financial_approach?: string | null
          financial_splitting?: string | null
          future_plans?: string | null
          gender?: string | null
          gotra?: string | null
          gym_routine?: string | null
          hair_color?: string | null
          hair_type?: string | null
          has_drivers_license?: string | null
          has_tattoos?: string | null
          height?: string | null
          height_cm?: number | null
          hidden_fields?: string[] | null
          hobbies?: string | null
          hometown?: string | null
          horoscope_match?: string | null
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
          living_with_family?: string | null
          location?: string | null
          love_language?: string | null
          loves_travel?: string | null
          makeup_routine?: string | null
          manglik?: string | null
          marijuana?: string | null
          marital_status?: string | null
          marketing_consent?: boolean | null
          marriage_timeline?: string | null
          mother_occupation?: string | null
          mother_tongue?: string | null
          music_genre?: string | null
          nakshatra?: string | null
          name?: string | null
          nationality_count?: number | null
          next_travel_destination?: string | null
          occupation?: string | null
          onboarding_complete?: boolean | null
          open_to_other_communities?: string | null
          paused_at?: string | null
          pets?: string | null
          phone_number?: string | null
          phone_type?: string | null
          phone_verified?: boolean | null
          photo_urls?: string[] | null
          politics?: string | null
          privacy_accepted_at?: string | null
          privacy_version?: string | null
          profile_created_for?: string | null
          profile_nudged_at?: string | null
          pronouns?: string | null
          race?: string | null
          rashi?: string | null
          rules_reminded_at?: string | null
          reading_interest?: string | null
          relationship_type?: string | null
          religion?: string | null
          residential_status?: string | null
          search_bonus?: number
          sect?: string | null
          settings_email_notifs?: boolean | null
          settings_incognito?: boolean | null
          settings_push_notifs?: boolean | null
          settings_read_receipts?: boolean | null
          settings_show_online?: boolean | null
          settings_theme?: string | null
          settling_abroad?: string | null
          sex_style?: string | null
          sexuality?: string | null
          shopping_preference?: string | null
          siblings?: string | null
          sisters?: string | null
          sisters_married?: string | null
          sleep_schedule?: string | null
          smoking?: string | null
          snoring?: string | null
          social_battery?: string | null
          sports_interest?: string | null
          state?: string | null
          sub_caste?: string | null
          subscription_renews_at?: string | null
          subscription_tier?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
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
          about_family?: string | null
          account_created?: string
          age?: number | null
          age_changed_once?: boolean | null
          annual_income?: string | null
          attachment_style?: string | null
          baking_interest?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          birth_place?: string | null
          birth_time?: string | null
          body_hair?: string | null
          body_type?: string | null
          brothers?: string | null
          brothers_married?: string | null
          can_cook?: string | null
          caste?: string | null
          childhood_description?: string | null
          children?: string | null
          children_count?: string | null
          city?: string | null
          clothing_style?: string | null
          conflict_resolution?: string | null
          cookie_preferences?: Json | null
          country?: string | null
          covid_vaccine?: string | null
          criminal_record?: string | null
          daily_like_count?: number | null
          daily_search_count?: number | null
          daily_super_like_count?: number | null
          date_of_birth?: string | null
          dating_intention?: string | null
          degree?: string | null
          description?: string | null
          dietary_preferences?: string | null
          disability?: string | null
          dream_house_type?: string | null
          dresses_well?: string | null
          drinking?: string | null
          drives_car?: string | null
          drugs?: string | null
          education_level?: string | null
          email?: string | null
          email_verified?: boolean | null
          employed_in?: string | null
          ethnicity?: string | null
          eye_color?: string | null
          facebook?: string | null
          facial_hair?: string | null
          family_closeness?: string | null
          family_health_history?: string | null
          family_location?: string | null
          family_plans?: string | null
          family_status?: string | null
          family_type?: string | null
          family_values?: string | null
          father_occupation?: string | null
          favorite_drink?: string | null
          financial_approach?: string | null
          financial_splitting?: string | null
          future_plans?: string | null
          gender?: string | null
          gotra?: string | null
          gym_routine?: string | null
          hair_color?: string | null
          hair_type?: string | null
          has_drivers_license?: string | null
          has_tattoos?: string | null
          height?: string | null
          height_cm?: number | null
          hidden_fields?: string[] | null
          hobbies?: string | null
          hometown?: string | null
          horoscope_match?: string | null
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
          living_with_family?: string | null
          location?: string | null
          love_language?: string | null
          loves_travel?: string | null
          makeup_routine?: string | null
          manglik?: string | null
          marijuana?: string | null
          marital_status?: string | null
          marketing_consent?: boolean | null
          marriage_timeline?: string | null
          mother_occupation?: string | null
          mother_tongue?: string | null
          music_genre?: string | null
          nakshatra?: string | null
          name?: string | null
          nationality_count?: number | null
          next_travel_destination?: string | null
          occupation?: string | null
          onboarding_complete?: boolean | null
          open_to_other_communities?: string | null
          paused_at?: string | null
          pets?: string | null
          phone_number?: string | null
          phone_type?: string | null
          phone_verified?: boolean | null
          photo_urls?: string[] | null
          politics?: string | null
          privacy_accepted_at?: string | null
          privacy_version?: string | null
          profile_created_for?: string | null
          profile_nudged_at?: string | null
          pronouns?: string | null
          race?: string | null
          rashi?: string | null
          rules_reminded_at?: string | null
          reading_interest?: string | null
          relationship_type?: string | null
          religion?: string | null
          residential_status?: string | null
          search_bonus?: number
          sect?: string | null
          settings_email_notifs?: boolean | null
          settings_incognito?: boolean | null
          settings_push_notifs?: boolean | null
          settings_read_receipts?: boolean | null
          settings_show_online?: boolean | null
          settings_theme?: string | null
          settling_abroad?: string | null
          sex_style?: string | null
          sexuality?: string | null
          shopping_preference?: string | null
          siblings?: string | null
          sisters?: string | null
          sisters_married?: string | null
          sleep_schedule?: string | null
          smoking?: string | null
          snoring?: string | null
          social_battery?: string | null
          sports_interest?: string | null
          state?: string | null
          sub_caste?: string | null
          subscription_renews_at?: string | null
          subscription_tier?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
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
      push_devices: {
        Row: {
          app_version: string | null
          created_at: string
          failure_count: number
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          failure_count?: number
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          failure_count?: number
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_prompt_cache: {
        Row: {
          created_at: string
          key: string
          plan: Json
        }
        Insert: {
          created_at?: string
          key: string
          plan: Json
        }
        Update: {
          created_at?: string
          key?: string
          plan?: Json
        }
        Relationships: []
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          auto_renew: boolean | null
          cancel_at_period_end: boolean
          created_at: string
          current_end: string | null
          current_start: string | null
          ended_at: string | null
          id: string
          mode: string
          plan_id: string
          provider: string
          status: string
          store_product_id: string | null
          store_subscription_id: string
          store_updated_at: string | null
          trial_ends_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          auto_renew?: boolean | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_end?: string | null
          current_start?: string | null
          ended_at?: string | null
          id?: string
          mode: string
          plan_id: string
          provider: string
          status?: string
          store_product_id?: string | null
          store_subscription_id: string
          store_updated_at?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          auto_renew?: boolean | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_end?: string | null
          current_start?: string | null
          ended_at?: string | null
          id?: string
          mode?: string
          plan_id?: string
          provider?: string
          status?: string
          store_product_id?: string | null
          store_subscription_id?: string
          store_updated_at?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      pending_pushes: {
        Row: {
          auth: string | null
          body: string | null
          channel: string | null
          data: Json | null
          device_token: string | null
          endpoint: string | null
          event_type: string | null
          failure_count: number | null
          p256dh: string | null
          queue_id: string | null
          subscription_id: string | null
          title: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      grievance_due: {
        Args: { p_at: string; p_category: string }
        Returns: string
      }
      grievance_label: { Args: { p_category: string }; Returns: string }
      keep_registration_record: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      request_ip: { Args: never; Returns: unknown }
      run_legal_retention: { Args: never; Returns: Json }
      admin_grievances: {
        Args: { p_open_only?: boolean }
        Returns: Database['public']['Tables']['grievances']['Row'][]
      }
      admin_update_grievance: {
        Args: { p_id: string; p_resolution?: string; p_status: string }
        Returns: undefined
      }
      admin_ban_user: {
        Args: { reason: string; target_id: string }
        Returns: undefined
      }
      admin_customers: {
        Args: { p_filter?: string; p_limit?: number; p_offset?: number; p_query?: string; p_sort?: string }
        Returns: Json
      }
      admin_enquiries: { Args: { p_status?: string }; Returns: Json }
      admin_list_messages: { Args: never; Returns: Json }
      admin_message_audience: { Args: { p_audience: Json }; Returns: number }
      admin_profile_stats: { Args: never; Returns: Json }
      admin_send_message: {
        Args: {
          p_audience: Json
          p_audience_label: string
          p_body: string
          p_cta_label: string
          p_cta_target: string
          p_push?: boolean
          p_title: string
        }
        Returns: Json
      }
      admin_update_enquiry: { Args: { p_id: string; p_notes?: string; p_status: string }; Returns: undefined }
      mark_my_message: { Args: { p_action: string; p_id: string }; Returns: undefined }
      my_messages: { Args: never; Returns: Json }
      blog_view: {
        Args: { p_slug: string }
        Returns: undefined
      }
      submit_enquiry: {
        Args: { p_email: string; p_message: string; p_name: string; p_source?: string; p_topic: string }
        Returns: Json
      }
      admin_finance_summary: {
        Args: { p_mode?: string; p_months?: number }
        Returns: Json
      }
      admin_list_errors: {
        Args: { p_include_fixed?: boolean; p_limit?: number }
        Returns: {
          app_version: string
          days: number
          first_seen_at: string
          fixed_at: string
          id: number
          last_seen_at: string
          message: string
          platform: string
          screen: string
          stack: string
          times: number
          user_agent: string
        }[]
      }
      admin_list_payments: {
        Args: {
          p_from?: string
          p_limit?: number
          p_mode?: string
          p_offset?: number
          p_provider?: string
          p_to?: string
        }
        Returns: {
          amount: number
          currency: string
          fee_amount: number
          fee_estimated: boolean
          id: string
          method: string
          mode: string
          net_amount: number
          order_id: string
          paid_at: string
          plan_id: string
          provider: string
          refunded_amount: number
          refunded_at: string
          status: string
          user_email: string
          user_id: string
          user_name: string
        }[]
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
      admin_mark_error_fixed: { Args: { p_id: number }; Returns: undefined }
      admin_platform_stats: { Args: never; Returns: Json }
      admin_verification_signals: { Args: never; Returns: Json }
      admin_review_verification: {
        Args: { decision: string; notes: string; request_id: string }
        Returns: undefined
      }
      admin_correct_date_of_birth: {
        Args: { new_date_of_birth: string; note: string; target_id: string }
        Returns: undefined
      }
      admin_find_users: {
        Args: { p_limit?: number; p_query?: string }
        Returns: {
          account_created: string
          age: number
          ban_reason: string
          banned_at: string
          daily_like_count: number
          daily_search_count: number
          date_of_birth: string
          email: string
          gender: string
          id: string
          is_banned: boolean
          is_paused: boolean
          is_verified: boolean
          location: string
          name: string
          subscription_tier: string
        }[]
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
      admin_set_pro_for_all: { Args: { p_on: boolean }; Returns: undefined }
      admin_unban_user: { Args: { target_id: string }; Returns: undefined }
      admin_update_report: {
        Args: { new_status: string; notes: string; report_id: string }
        Returns: undefined
      }
      admin_verify_user: { Args: { target_id: string }; Returns: undefined }
      age_on_today: { Args: { p_date_of_birth: string }; Returns: number }
      consume_search: { Args: { p_user_id: string }; Returns: Json }
      expire_pro_subscriptions: { Args: never; Returns: number }
      export_my_data: { Args: never; Returns: Json }
      gender_preference_fits: {
        Args: { p_preference: string; p_target: string }
        Returns: boolean
      }
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
      get_profile_cards: {
        Args: { p_ids: string[] }
        Returns: {
          age: number
          description: string
          hidden_fields: string[]
          id: string
          is_verified: boolean
          location: string
          name: string
          photo_urls: string[]
          subscription_tier: string
        }[]
      }
      height_label: { Args: { p_cm: number }; Returns: string }
      height_to_cm: { Args: { p_height: string }; Returns: number }
      increment_push_failure: { Args: { sub_id: string }; Returns: undefined }
      has_pro: { Args: { p_user: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      mark_messages_read: { Args: { p_match_id: string }; Returns: number }
      my_profile_sections: { Args: never; Returns: Json }
      payment_net: {
        Args: { p: Database["public"]["Tables"]["payments"]["Row"] }
        Returns: number
      }
      record_push_device_failures: {
        Args: { p_device_ids: string[] }
        Returns: undefined
      }
      pro_for_all: { Args: never; Returns: boolean }
      register_push_device: {
        Args: { p_app_version?: string; p_platform: string; p_token: string }
        Returns: undefined
      }
      report_error: {
        Args: {
          p_app_version?: string
          p_message: string
          p_platform: string
          p_screen?: string
          p_stack?: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      submit_grievance: {
        Args: {
          p_about?: string
          p_category: string
          p_details: string
          p_email: string
          p_name: string
          p_on_behalf?: boolean
          p_phone?: string
        }
        Returns: Json
      }
      save_vapid_keys: {
        Args: { p_private_key: string; p_public_key: string }
        Returns: {
          vapid_private_key: string
          vapid_public_key: string
        }[]
      }
      search_candidates: {
        Args: {
          p_exclude_liked?: boolean
          p_ids?: string[]
          p_limit?: number
          p_user_id: string
        }
        Returns: Json
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
      sync_pro_status: { Args: { p_user_id: string }; Returns: undefined }
      unmatch: { Args: { p_match_id: string }; Returns: undefined }
      unregister_push_device: { Args: { p_token: string }; Returns: undefined }
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

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
      a_level_combination_subjects: {
        Row: {
          combination_id: string
          created_at: string
          display_order: number
          id: string
          principal_position: number | null
          school_subject_offering_id: string
          subject_role: Database["public"]["Enums"]["a_level_subject_role"]
        }
        Insert: {
          combination_id: string
          created_at?: string
          display_order: number
          id?: string
          principal_position?: number | null
          school_subject_offering_id: string
          subject_role: Database["public"]["Enums"]["a_level_subject_role"]
        }
        Update: {
          combination_id?: string
          created_at?: string
          display_order?: number
          id?: string
          principal_position?: number | null
          school_subject_offering_id?: string
          subject_role?: Database["public"]["Enums"]["a_level_subject_role"]
        }
        Relationships: [
          {
            foreignKeyName: "a_level_combination_subjects_combination_id_fkey"
            columns: ["combination_id"]
            isOneToOne: false
            referencedRelation: "a_level_combinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "a_level_combination_subjects_school_subject_offering_id_fkey"
            columns: ["school_subject_offering_id"]
            isOneToOne: false
            referencedRelation: "school_subject_offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      a_level_combinations: {
        Row: {
          academic_year_id: string
          code: string
          created_at: string
          created_by: string
          effective_from: string | null
          effective_to: string | null
          id: string
          level: string
          name: string
          school_id: string
          status: Database["public"]["Enums"]["offering_status"]
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          code: string
          created_at?: string
          created_by: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          level?: string
          name: string
          school_id: string
          status?: Database["public"]["Enums"]["offering_status"]
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          code?: string
          created_at?: string
          created_by?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          level?: string
          name?: string
          school_id?: string
          status?: Database["public"]["Enums"]["offering_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "a_level_combinations_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "a_level_combinations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      a_level_learner_assignments: {
        Row: {
          assigned_by: string
          class_id: string
          combination_id: string
          created_at: string
          ends_on: string | null
          id: string
          learner_id: string
          school_id: string
          starts_on: string
          status: Database["public"]["Enums"]["a_level_assignment_status"]
        }
        Insert: {
          assigned_by: string
          class_id: string
          combination_id: string
          created_at?: string
          ends_on?: string | null
          id?: string
          learner_id: string
          school_id: string
          starts_on: string
          status?: Database["public"]["Enums"]["a_level_assignment_status"]
        }
        Update: {
          assigned_by?: string
          class_id?: string
          combination_id?: string
          created_at?: string
          ends_on?: string | null
          id?: string
          learner_id?: string
          school_id?: string
          starts_on?: string
          status?: Database["public"]["Enums"]["a_level_assignment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "a_level_learner_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "academic_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "a_level_learner_assignments_combination_id_fkey"
            columns: ["combination_id"]
            isOneToOne: false
            referencedRelation: "a_level_combinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "a_level_learner_assignments_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "learners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "a_level_learner_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      a_level_paper_marks: {
        Row: {
          academic_term_id: string
          grading_scheme_version: string | null
          id: string
          learner_assignment_id: string
          mark: number | null
          mark_state: Database["public"]["Enums"]["mark_state"]
          recorded_at: string | null
          recorded_by: string | null
          school_id: string
          school_subject_offering_id: string
          system_subject_paper_id: string
          updated_at: string
        }
        Insert: {
          academic_term_id: string
          grading_scheme_version?: string | null
          id?: string
          learner_assignment_id: string
          mark?: number | null
          mark_state?: Database["public"]["Enums"]["mark_state"]
          recorded_at?: string | null
          recorded_by?: string | null
          school_id: string
          school_subject_offering_id: string
          system_subject_paper_id: string
          updated_at?: string
        }
        Update: {
          academic_term_id?: string
          grading_scheme_version?: string | null
          id?: string
          learner_assignment_id?: string
          mark?: number | null
          mark_state?: Database["public"]["Enums"]["mark_state"]
          recorded_at?: string | null
          recorded_by?: string | null
          school_id?: string
          school_subject_offering_id?: string
          system_subject_paper_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "a_level_paper_marks_academic_term_id_fkey"
            columns: ["academic_term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "a_level_paper_marks_learner_assignment_id_fkey"
            columns: ["learner_assignment_id"]
            isOneToOne: false
            referencedRelation: "a_level_learner_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "a_level_paper_marks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "a_level_paper_marks_school_subject_offering_id_fkey"
            columns: ["school_subject_offering_id"]
            isOneToOne: false
            referencedRelation: "school_subject_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "a_level_paper_marks_system_subject_paper_id_fkey"
            columns: ["system_subject_paper_id"]
            isOneToOne: false
            referencedRelation: "system_subject_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_assessments: {
        Row: {
          academic_year_id: string
          created_at: string
          created_by: string
          id: string
          locked_at: string | null
          name: string
          programme: Database["public"]["Enums"]["subject_programme"]
          school_id: string
          status: Database["public"]["Enums"]["offering_status"]
          term_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          created_by: string
          id?: string
          locked_at?: string | null
          name: string
          programme: Database["public"]["Enums"]["subject_programme"]
          school_id: string
          status?: Database["public"]["Enums"]["offering_status"]
          term_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          created_by?: string
          id?: string
          locked_at?: string | null
          name?: string
          programme?: Database["public"]["Enums"]["subject_programme"]
          school_id?: string
          status?: Database["public"]["Enums"]["offering_status"]
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_assessments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_assessments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_assessments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_classes: {
        Row: {
          academic_year_id: string
          class_name: string
          created_at: string
          id: string
          level: number
          programme: Database["public"]["Enums"]["subject_programme"]
          school_id: string
          status: Database["public"]["Enums"]["offering_status"]
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          class_name: string
          created_at?: string
          id?: string
          level: number
          programme: Database["public"]["Enums"]["subject_programme"]
          school_id: string
          status?: Database["public"]["Enums"]["offering_status"]
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          class_name?: string
          created_at?: string
          id?: string
          level?: number
          programme?: Database["public"]["Enums"]["subject_programme"]
          school_id?: string
          status?: Database["public"]["Enums"]["offering_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_classes_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_terms: {
        Row: {
          academic_year: number
          created_at: string | null
          created_by: string | null
          end_date: string | null
          grades_locked: boolean | null
          id: string
          name: string
          start_date: string | null
          term_number: number
          term_status: Database["public"]["Enums"]["term_status"] | null
          updated_at: string | null
        }
        Insert: {
          academic_year?: number
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          grades_locked?: boolean | null
          id?: string
          name: string
          start_date?: string | null
          term_number: number
          term_status?: Database["public"]["Enums"]["term_status"] | null
          updated_at?: string | null
        }
        Update: {
          academic_year?: number
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          grades_locked?: boolean | null
          id?: string
          name?: string
          start_date?: string | null
          term_number?: number
          term_status?: Database["public"]["Enums"]["term_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_terms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_years: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          name: string
          school_id: string
          starts_on: string
          status: Database["public"]["Enums"]["academic_year_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          name: string
          school_id: string
          starts_on: string
          status?: Database["public"]["Enums"]["academic_year_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          name?: string
          school_id?: string
          starts_on?: string
          status?: Database["public"]["Enums"]["academic_year_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_subject_papers: {
        Row: {
          assessment_id: string
          display_order: number
          id: string
          is_required: boolean
          school_id: string
          school_subject_offering_id: string
          selected_at: string
          selected_by: string
          system_subject_paper_id: string
        }
        Insert: {
          assessment_id: string
          display_order: number
          id?: string
          is_required?: boolean
          school_id: string
          school_subject_offering_id: string
          selected_at?: string
          selected_by: string
          system_subject_paper_id: string
        }
        Update: {
          assessment_id?: string
          display_order?: number
          id?: string
          is_required?: boolean
          school_id?: string
          school_subject_offering_id?: string
          selected_at?: string
          selected_by?: string
          system_subject_paper_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_paper_assessment_fk"
            columns: ["assessment_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_assessments"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "assessment_paper_offering_fk"
            columns: ["school_subject_offering_id", "school_id"]
            isOneToOne: false
            referencedRelation: "school_subject_offerings"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "assessment_subject_papers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_subject_papers_system_subject_paper_id_fkey"
            columns: ["system_subject_paper_id"]
            isOneToOne: false
            referencedRelation: "system_subject_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          class_id: string | null
          created_at: string | null
          date: string
          id: string
          present: boolean | null
          recorded_by: string | null
          student_id: string | null
        }
        Insert: {
          class_id?: string | null
          created_at?: string | null
          date?: string
          id?: string
          present?: boolean | null
          recorded_by?: string | null
          student_id?: string | null
        }
        Update: {
          class_id?: string | null
          created_at?: string | null
          date?: string
          id?: string
          present?: boolean | null
          recorded_by?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
          user_name: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_notifications: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"] | null
          created_at: string | null
          failed_count: number | null
          id: string
          message: string
          sent_at: string | null
          sent_by: string | null
          sent_count: number | null
          target_roles: string[] | null
          title: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["notification_channel"] | null
          created_at?: string | null
          failed_count?: number | null
          id?: string
          message: string
          sent_at?: string | null
          sent_by?: string | null
          sent_count?: number | null
          target_roles?: string[] | null
          title: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"] | null
          created_at?: string | null
          failed_count?: number | null
          id?: string
          message?: string
          sent_at?: string | null
          sent_by?: string | null
          sent_count?: number | null
          target_roles?: string[] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_notifications_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bursaries: {
        Row: {
          created_at: string | null
          created_by: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          reason: string | null
          student_id: string | null
          term_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          reason?: string | null
          student_id?: string | null
          term_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          reason?: string | null
          student_id?: string | null
          term_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bursaries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bursaries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bursaries_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      class_streams: {
        Row: {
          class_id: string
          created_at: string
          id: string
          school_id: string
          status: Database["public"]["Enums"]["offering_status"]
          stream_name: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          school_id: string
          status?: Database["public"]["Enums"]["offering_status"]
          stream_name: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          school_id?: string
          status?: Database["public"]["Enums"]["offering_status"]
          stream_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_streams_class_school_fk"
            columns: ["class_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_classes"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "class_streams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      class_subject_offerings: {
        Row: {
          academic_year_id: string
          class_id: string
          created_at: string
          id: string
          is_compulsory: boolean
          school_id: string
          school_subject_offering_id: string
          status: Database["public"]["Enums"]["offering_status"]
          stream_id: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          class_id: string
          created_at?: string
          id?: string
          is_compulsory?: boolean
          school_id: string
          school_subject_offering_id: string
          status?: Database["public"]["Enums"]["offering_status"]
          stream_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          created_at?: string
          id?: string
          is_compulsory?: boolean
          school_id?: string
          school_subject_offering_id?: string
          status?: Database["public"]["Enums"]["offering_status"]
          stream_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_subject_class_fk"
            columns: ["class_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_classes"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "class_subject_offerings_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subject_offerings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subject_school_subject_fk"
            columns: ["school_subject_offering_id", "school_id"]
            isOneToOne: false
            referencedRelation: "school_subject_offerings"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "class_subject_stream_fk"
            columns: ["stream_id", "school_id"]
            isOneToOne: false
            referencedRelation: "class_streams"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string | null
          id: string
          name: string
          short: string
        }
        Insert: {
          created_at?: string | null
          id: string
          name: string
          short: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          short?: string
        }
        Relationships: []
      }
      combination_subjects: {
        Row: {
          combination_id: string
          display_order: number
          id: string
          school_id: string
          school_subject_offering_id: string
          subject_level: Database["public"]["Enums"]["subject_level"]
        }
        Insert: {
          combination_id: string
          display_order: number
          id?: string
          school_id: string
          school_subject_offering_id: string
          subject_level: Database["public"]["Enums"]["subject_level"]
        }
        Update: {
          combination_id?: string
          display_order?: number
          id?: string
          school_id?: string
          school_subject_offering_id?: string
          subject_level?: Database["public"]["Enums"]["subject_level"]
        }
        Relationships: [
          {
            foreignKeyName: "combination_subject_combination_fk"
            columns: ["combination_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subject_combinations"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "combination_subject_offering_fk"
            columns: ["school_subject_offering_id", "school_id"]
            isOneToOne: false
            referencedRelation: "school_subject_offerings"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "combination_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_generation_jobs: {
        Row: {
          academic_year_id: string
          completed_at: string | null
          created_at: string
          error_count: number
          id: string
          processed_count: number
          requested_by: string | null
          role_type: Database["public"]["Enums"]["report_comment_role"] | null
          school_id: string
          scope: Json
          started_at: string | null
          status: string
          term_id: string
          total_count: number
        }
        Insert: {
          academic_year_id: string
          completed_at?: string | null
          created_at?: string
          error_count?: number
          id?: string
          processed_count?: number
          requested_by?: string | null
          role_type?: Database["public"]["Enums"]["report_comment_role"] | null
          school_id: string
          scope?: Json
          started_at?: string | null
          status?: string
          term_id: string
          total_count?: number
        }
        Update: {
          academic_year_id?: string
          completed_at?: string | null
          created_at?: string
          error_count?: number
          id?: string
          processed_count?: number
          requested_by?: string | null
          role_type?: Database["public"]["Enums"]["report_comment_role"] | null
          school_id?: string
          scope?: Json
          started_at?: string | null
          status?: string
          term_id?: string
          total_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "comment_generation_jobs_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_generation_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_generation_jobs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_generation_jobs_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_rules: {
        Row: {
          created_at: string
          created_by: string | null
          evidence_condition: Json
          id: string
          is_active: boolean
          name: string
          output_guidance: Json
          priority: number
          role_type: Database["public"]["Enums"]["report_comment_role"]
          school_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          evidence_condition?: Json
          id?: string
          is_active?: boolean
          name: string
          output_guidance?: Json
          priority?: number
          role_type: Database["public"]["Enums"]["report_comment_role"]
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          evidence_condition?: Json
          id?: string
          is_active?: boolean
          name?: string
          output_guidance?: Json
          priority?: number
          role_type?: Database["public"]["Enums"]["report_comment_role"]
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_rules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_templates: {
        Row: {
          body_template: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          language_code: string
          name: string
          role_type: Database["public"]["Enums"]["report_comment_role"]
          school_id: string | null
          updated_at: string
          version: string
        }
        Insert: {
          body_template: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          language_code?: string
          name: string
          role_type: Database["public"]["Enums"]["report_comment_role"]
          school_id?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          body_template?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          language_code?: string
          name?: string
          role_type?: Database["public"]["Enums"]["report_comment_role"]
          school_id?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_templates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      data_exchange_approvals: {
        Row: {
          id: string
          import_job_id: string | null
          requested_at: string
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string
          status: string
        }
        Insert: {
          id?: string
          import_job_id?: string | null
          requested_at?: string
          requested_by: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: string
          status?: string
        }
        Update: {
          id?: string
          import_job_id?: string | null
          requested_at?: string
          requested_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_exchange_approvals_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: true
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_exchange_approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_exchange_approvals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_exchange_approvals_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      device_health: {
        Row: {
          app_version: string | null
          created_at: string | null
          device_name: string | null
          id: string
          is_online: boolean | null
          last_sync_at: string | null
          pending_records: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          created_at?: string | null
          device_name?: string | null
          id?: string
          is_online?: boolean | null
          last_sync_at?: string | null
          pending_records?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          created_at?: string | null
          device_name?: string | null
          id?: string
          is_online?: boolean | null
          last_sync_at?: string | null
          pending_records?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_health_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_receipts: {
        Row: {
          financial_snapshot: Json
          generated_at: string
          id: string
          payment_id: string
          pdf_sha256: string
          pdf_storage_key: string
          receipt_number: string
          school_id: string
          status: string
        }
        Insert: {
          financial_snapshot: Json
          generated_at?: string
          id?: string
          payment_id: string
          pdf_sha256: string
          pdf_storage_key: string
          receipt_number: string
          school_id: string
          status: string
        }
        Update: {
          financial_snapshot?: Json
          generated_at?: string
          id?: string
          payment_id?: string
          pdf_sha256?: string
          pdf_storage_key?: string
          receipt_number?: string
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "verified_payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_receipts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      elective_subjects: {
        Row: {
          applicable_classes: string[] | null
          created_at: string | null
          id: string
          is_active: boolean | null
          subject_code: string
          subject_name: string
        }
        Insert: {
          applicable_classes?: string[] | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          subject_code: string
          subject_name: string
        }
        Update: {
          applicable_classes?: string[] | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          subject_code?: string
          subject_name?: string
        }
        Relationships: []
      }
      examination_catalogues: {
        Row: {
          code: string
          created_at: string
          examination_level: Database["public"]["Enums"]["subject_programme"]
          id: string
          is_active: boolean
          is_official: boolean
          name: string
          official_source: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          examination_level: Database["public"]["Enums"]["subject_programme"]
          id?: string
          is_active?: boolean
          is_official?: boolean
          name: string
          official_source: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          examination_level?: Database["public"]["Enums"]["subject_programme"]
          id?: string
          is_active?: boolean
          is_official?: boolean
          name?: string
          official_source?: string
          updated_at?: string
        }
        Relationships: []
      }
      export_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          expires_at: string | null
          export_type: string
          file_asset_id: string | null
          filters_json: Json
          format: string
          id: string
          policy_snapshot_json: Json
          record_count: number
          requested_by: string
          school_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          export_type: string
          file_asset_id?: string | null
          filters_json?: Json
          format: string
          id?: string
          policy_snapshot_json?: Json
          record_count?: number
          requested_by: string
          school_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          export_type?: string
          file_asset_id?: string | null
          filters_json?: Json
          format?: string
          id?: string
          policy_snapshot_json?: Json
          record_count?: number
          requested_by?: string
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_jobs_file_asset_fk"
            columns: ["file_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_jobs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          global_enabled: boolean
          key: string
          label: string
          school_override_permitted: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          global_enabled?: boolean
          key: string
          label: string
          school_override_permitted?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          global_enabled?: boolean
          key?: string
          label?: string
          school_override_permitted?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      fee_payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          notes: string | null
          payment_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          phone_number: string | null
          recorded_by: string | null
          student_id: string | null
          term_id: string | null
          transaction_ref: string | null
        }
        Insert: {
          amount?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          phone_number?: string | null
          recorded_by?: string | null
          student_id?: string | null
          term_id?: string | null
          transaction_ref?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          phone_number?: string | null
          recorded_by?: string | null
          student_id?: string | null
          term_id?: string | null
          transaction_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_payments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_structures: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          fee_type: string
          id: string
          is_active: boolean | null
          term_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string | null
          description?: string | null
          fee_type: string
          id?: string
          is_active?: boolean | null
          term_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          fee_type?: string
          id?: string
          is_active?: boolean | null
          term_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_structures_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_approval_rules: {
        Row: {
          action_type: string
          id: string
          is_active: boolean
          required_approvals: number
          school_id: string
          threshold_minor: number
          updated_at: string
        }
        Insert: {
          action_type: string
          id?: string
          is_active?: boolean
          required_approvals?: number
          school_id: string
          threshold_minor?: number
          updated_at?: string
        }
        Update: {
          action_type?: string
          id?: string
          is_active?: boolean
          required_approvals?: number
          school_id?: string
          threshold_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_approval_rules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_audit_events: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_value: Json | null
          previous_value: Json | null
          reason: string
          school_id: string
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
          reason: string
          school_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
          reason?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_audit_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_conversion_configurations: {
        Row: {
          aggregation_rule: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          display_decimal_places: number
          effective_from: string
          effective_to: string | null
          id: string
          is_approved: boolean
          method: string
          name: string
          programme: string
          school_id: string
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          aggregation_rule: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          display_decimal_places?: number
          effective_from: string
          effective_to?: string | null
          id?: string
          is_approved?: boolean
          method: string
          name: string
          programme: string
          school_id: string
          status?: string
          updated_at?: string
          version: string
        }
        Update: {
          aggregation_rule?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          display_decimal_places?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_approved?: boolean
          method?: string
          name?: string
          programme?: string
          school_id?: string
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "grading_conversion_configurations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grading_conversion_configurations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_conversion_points: {
        Row: {
          configuration_id: string
          display_order: number
          id: string
          percentage_score: number
          three_point_score: number
        }
        Insert: {
          configuration_id: string
          display_order: number
          id?: string
          percentage_score: number
          three_point_score: number
        }
        Update: {
          configuration_id?: string
          display_order?: number
          id?: string
          percentage_score?: number
          three_point_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "grading_conversion_points_configuration_id_fkey"
            columns: ["configuration_id"]
            isOneToOne: false
            referencedRelation: "grading_conversion_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_scales: {
        Row: {
          created_at: string | null
          description: string | null
          formative_weight: number | null
          grade_letter: string
          id: string
          max_score: number
          min_score: number
          proficiency_band: string
          summative_weight: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          formative_weight?: number | null
          grade_letter: string
          id?: string
          max_score: number
          min_score: number
          proficiency_band: string
          summative_weight?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          formative_weight?: number | null
          grade_letter?: string
          id?: string
          max_score?: number
          min_score?: number
          proficiency_band?: string
          summative_weight?: number | null
        }
        Relationships: []
      }
      import_export_audit_events: {
        Row: {
          actor_role: string
          actor_user_id: string
          affected_record_count: number
          context_json: Json
          created_at: string
          event_type: string
          export_job_id: string | null
          id: string
          import_job_id: string | null
          result_status: string
          school_id: string
        }
        Insert: {
          actor_role: string
          actor_user_id: string
          affected_record_count?: number
          context_json?: Json
          created_at?: string
          event_type: string
          export_job_id?: string | null
          id?: string
          import_job_id?: string | null
          result_status: string
          school_id: string
        }
        Update: {
          actor_role?: string
          actor_user_id?: string
          affected_record_count?: number
          context_json?: Json
          created_at?: string
          event_type?: string
          export_job_id?: string | null
          id?: string
          import_job_id?: string | null
          result_status?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_export_audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_export_audit_events_export_job_id_fkey"
            columns: ["export_job_id"]
            isOneToOne: false
            referencedRelation: "export_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_export_audit_events_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_export_audit_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          academic_context_json: Json
          approval_status: string | null
          completed_at: string | null
          created_at: string
          created_rows: number
          error_rows: number
          id: string
          import_type: string
          original_filename: string
          policy_snapshot_json: Json
          school_id: string
          source_delete_after: string | null
          source_fingerprint: string | null
          started_at: string | null
          status: string
          storage_asset_id: string | null
          template_id: string | null
          template_instance_id: string | null
          template_version: number
          total_rows: number
          unchanged_rows: number
          updated_rows: number
          uploaded_by: string
          valid_rows: number
          warning_rows: number
        }
        Insert: {
          academic_context_json?: Json
          approval_status?: string | null
          completed_at?: string | null
          created_at?: string
          created_rows?: number
          error_rows?: number
          id?: string
          import_type: string
          original_filename: string
          policy_snapshot_json?: Json
          school_id: string
          source_delete_after?: string | null
          source_fingerprint?: string | null
          started_at?: string | null
          status?: string
          storage_asset_id?: string | null
          template_id?: string | null
          template_instance_id?: string | null
          template_version: number
          total_rows?: number
          unchanged_rows?: number
          updated_rows?: number
          uploaded_by: string
          valid_rows?: number
          warning_rows?: number
        }
        Update: {
          academic_context_json?: Json
          approval_status?: string | null
          completed_at?: string | null
          created_at?: string
          created_rows?: number
          error_rows?: number
          id?: string
          import_type?: string
          original_filename?: string
          policy_snapshot_json?: Json
          school_id?: string
          source_delete_after?: string | null
          source_fingerprint?: string | null
          started_at?: string | null
          status?: string
          storage_asset_id?: string | null
          template_id?: string | null
          template_instance_id?: string | null
          template_version?: number
          total_rows?: number
          unchanged_rows?: number
          updated_rows?: number
          uploaded_by?: string
          valid_rows?: number
          warning_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_storage_asset_fk"
            columns: ["storage_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "import_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          base_record_version: string | null
          created_at: string
          current_record_version: string | null
          entity_reference: string | null
          error_json: Json
          id: string
          import_job_id: string
          operation: string
          proposed_values_json: Json
          row_number: number
          validation_status: string
          warning_json: Json
        }
        Insert: {
          base_record_version?: string | null
          created_at?: string
          current_record_version?: string | null
          entity_reference?: string | null
          error_json?: Json
          id?: string
          import_job_id: string
          operation: string
          proposed_values_json?: Json
          row_number: number
          validation_status: string
          warning_json?: Json
        }
        Update: {
          base_record_version?: string | null
          created_at?: string
          current_record_version?: string | null
          entity_reference?: string | null
          error_json?: Json
          id?: string
          import_job_id?: string
          operation?: string
          proposed_values_json?: Json
          row_number?: number
          validation_status?: string
          warning_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_templates: {
        Row: {
          created_at: string
          effective_from: string
          id: string
          programme: string | null
          schema_json: Json
          status: string
          template_type: string
          version: number
        }
        Insert: {
          created_at?: string
          effective_from?: string
          id?: string
          programme?: string | null
          schema_json?: Json
          status?: string
          template_type: string
          version: number
        }
        Update: {
          created_at?: string
          effective_from?: string
          id?: string
          programme?: string | null
          schema_json?: Json
          status?: string
          template_type?: string
          version?: number
        }
        Relationships: []
      }
      learner_census_snapshots: {
        Row: {
          academic_term: string | null
          academic_year: number
          active_learner_count: number
          census_date: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          locked_at: string | null
          plan_id: string
          projected_amount_minor: number
          school_id: string
        }
        Insert: {
          academic_term?: string | null
          academic_year: number
          active_learner_count: number
          census_date: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          locked_at?: string | null
          plan_id: string
          projected_amount_minor: number
          school_id: string
        }
        Update: {
          academic_term?: string | null
          academic_year?: number
          active_learner_count?: number
          census_date?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          locked_at?: string | null
          plan_id?: string
          projected_amount_minor?: number
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learner_census_snapshots_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_census_snapshots_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_census_snapshots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      learner_class_enrolments: {
        Row: {
          academic_year_id: string
          class_id: string
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          learner_id: string
          school_id: string
          status: string
          stream_id: string | null
        }
        Insert: {
          academic_year_id: string
          class_id: string
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          learner_id: string
          school_id: string
          status?: string
          stream_id?: string | null
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          learner_id?: string
          school_id?: string
          status?: string
          stream_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learner_class_class_fk"
            columns: ["class_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_classes"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "learner_class_enrolments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_class_enrolments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_class_learner_fk"
            columns: ["learner_id", "school_id"]
            isOneToOne: false
            referencedRelation: "learners"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "learner_class_stream_fk"
            columns: ["stream_id", "school_id"]
            isOneToOne: false
            referencedRelation: "class_streams"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      learner_combination_enrolments: {
        Row: {
          combination_id: string
          created_at: string
          effective_from: string
          effective_to: string | null
          enrolment_id: string
          id: string
          school_id: string
          status: string
        }
        Insert: {
          combination_id: string
          created_at?: string
          effective_from: string
          effective_to?: string | null
          enrolment_id: string
          id?: string
          school_id: string
          status?: string
        }
        Update: {
          combination_id?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          enrolment_id?: string
          id?: string
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "learner_combination_enrolments_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "learner_class_enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_combination_enrolments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_combination_fk"
            columns: ["combination_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subject_combinations"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      learner_fee_invoices: {
        Row: {
          amount_paid_minor: number
          credit_minor: number
          currency: string
          discount_minor: number
          due_on: string
          fee_structure_id: string | null
          gross_amount_minor: number
          id: string
          invoice_number: string
          issued_at: string
          learner_id: string
          payment_reference: string
          provider_charge_minor: number
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_paid_minor?: number
          credit_minor?: number
          currency?: string
          discount_minor?: number
          due_on: string
          fee_structure_id?: string | null
          gross_amount_minor: number
          id?: string
          invoice_number: string
          issued_at?: string
          learner_id: string
          payment_reference: string
          provider_charge_minor?: number
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_paid_minor?: number
          credit_minor?: number
          currency?: string
          discount_minor?: number
          due_on?: string
          fee_structure_id?: string | null
          gross_amount_minor?: number
          id?: string
          invoice_number?: string
          issued_at?: string
          learner_id?: string
          payment_reference?: string
          provider_charge_minor?: number
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learner_fee_invoices_fee_structure_id_fkey"
            columns: ["fee_structure_id"]
            isOneToOne: false
            referencedRelation: "school_fee_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_fee_invoices_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "learners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_fee_invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      learner_subject_enrolments: {
        Row: {
          class_subject_offering_id: string
          created_at: string
          effective_from: string
          effective_to: string | null
          enrolment_id: string
          id: string
          learner_id: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          class_subject_offering_id: string
          created_at?: string
          effective_from: string
          effective_to?: string | null
          enrolment_id: string
          id?: string
          learner_id: string
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          class_subject_offering_id?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          enrolment_id?: string
          id?: string
          learner_id?: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learner_subject_enrolments_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "learner_class_enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_subject_enrolments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_subject_learner_fk"
            columns: ["learner_id", "school_id"]
            isOneToOne: false
            referencedRelation: "learners"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "learner_subject_offering_fk"
            columns: ["class_subject_offering_id", "school_id"]
            isOneToOne: false
            referencedRelation: "class_subject_offerings"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      learners: {
        Row: {
          admission_number: string
          created_at: string
          first_name: string
          id: string
          last_name: string
          other_name: string | null
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          admission_number: string
          created_at?: string
          first_name: string
          id?: string
          last_name: string
          other_name?: string | null
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          admission_number?: string
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string
          other_name?: string | null
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learners_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      mark_entries: {
        Row: {
          a1: number | null
          a2: number | null
          ca20: number | null
          cbc_score: number | null
          class_id: string | null
          comment: string | null
          created_at: string | null
          entered_at: string | null
          entered_by: string
          eot: number | null
          eot80: number | null
          grade: string | null
          id: string
          student_id: string | null
          student_name: string
          subject_code: string
          term: number
          total100: number | null
          updated_at: string | null
          year: number
        }
        Insert: {
          a1?: number | null
          a2?: number | null
          ca20?: number | null
          cbc_score?: number | null
          class_id?: string | null
          comment?: string | null
          created_at?: string | null
          entered_at?: string | null
          entered_by?: string
          eot?: number | null
          eot80?: number | null
          grade?: string | null
          id: string
          student_id?: string | null
          student_name: string
          subject_code: string
          term?: number
          total100?: number | null
          updated_at?: string | null
          year?: number
        }
        Update: {
          a1?: number | null
          a2?: number | null
          ca20?: number | null
          cbc_score?: number | null
          class_id?: string | null
          comment?: string | null
          created_at?: string | null
          entered_at?: string | null
          entered_by?: string
          eot?: number | null
          eot80?: number | null
          grade?: string | null
          id?: string
          student_id?: string | null
          student_name?: string
          subject_code?: string
          term?: number
          total100?: number | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "mark_entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mark_entries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          asset_type: string
          byte_size: number
          checksum: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          mime_type: string
          school_id: string
          status: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          asset_type: string
          byte_size: number
          checksum: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          mime_type: string
          school_id: string
          status?: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          asset_type?: string
          byte_size?: number
          checksum?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          mime_type?: string
          school_id?: string
          status?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_payment_claims: {
        Row: {
          amount_claimed: number
          created_at: string
          currency: string
          id: string
          invoice_id: string
          payer_number_masked: string | null
          payment_date: string
          provider: Database["public"]["Enums"]["payment_provider_code"]
          provider_transaction_reference: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string
          status: Database["public"]["Enums"]["payment_processing_status"]
          submitted_by: string
        }
        Insert: {
          amount_claimed: number
          created_at?: string
          currency?: string
          id?: string
          invoice_id: string
          payer_number_masked?: string | null
          payment_date: string
          provider: Database["public"]["Enums"]["payment_provider_code"]
          provider_transaction_reference: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["payment_processing_status"]
          submitted_by: string
        }
        Update: {
          amount_claimed?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string
          payer_number_masked?: string | null
          payment_date?: string
          provider?: Database["public"]["Enums"]["payment_provider_code"]
          provider_transaction_reference?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["payment_processing_status"]
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_payment_claims_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_payment_claims_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_payment_claims_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempt_count: number
          created_at: string
          failure_category: string | null
          id: string
          invitation_id: string | null
          message_type: string
          provider_message_reference: string | null
          recipient: string
          school_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          failure_category?: string | null
          id?: string
          invitation_id?: string | null
          message_type: string
          provider_message_reference?: string | null
          recipient: string
          school_id?: string | null
          sent_at?: string | null
          status: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          failure_category?: string | null
          id?: string
          invitation_id?: string | null
          message_type?: string
          provider_message_reference?: string | null
          recipient?: string
          school_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "school_admin_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_fee_bands: {
        Row: {
          created_at: string
          currency: string
          effective_from: string
          effective_to: string | null
          fee_minor: number
          id: string
          is_from_price: boolean
          maximum_learners: number | null
          minimum_learners: number
          status: string
        }
        Insert: {
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          fee_minor: number
          id?: string
          is_from_price?: boolean
          maximum_learners?: number | null
          minimum_learners: number
          status?: string
        }
        Update: {
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          fee_minor?: number
          id?: string
          is_from_price?: boolean
          maximum_learners?: number | null
          minimum_learners?: number
          status?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string
          id: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          id?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
        }
        Relationships: []
      }
      platform_action_rate_limits: {
        Row: {
          action_key: string
          actor_key: string
          attempt_count: number
          blocked_until: string | null
          id: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          action_key: string
          actor_key: string
          attempt_count?: number
          blocked_until?: string | null
          id?: string
          updated_at?: string
          window_started_at: string
        }
        Update: {
          action_key?: string
          actor_key?: string
          attempt_count?: number
          blocked_until?: string | null
          id?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          auth_user_id: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          mfa_required: boolean
          telephone: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_active?: boolean
          mfa_required?: boolean
          telephone?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          mfa_required?: boolean
          telephone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          new_state: Json | null
          platform_admin_id: string
          previous_state: Json | null
          reason: string | null
          school_id: string | null
          session_metadata: Json
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_state?: Json | null
          platform_admin_id: string
          previous_state?: Json | null
          reason?: string | null
          school_id?: string | null
          session_metadata?: Json
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_state?: Json | null
          platform_admin_id?: string
          previous_state?: Json | null
          reason?: string | null
          school_id?: string | null
          session_metadata?: Json
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_logs_platform_admin_id_fkey"
            columns: ["platform_admin_id"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_data_exchange_policies: {
        Row: {
          allowed_formats: string[]
          created_at: string
          created_by: string | null
          direction: Database["public"]["Enums"]["data_exchange_direction"]
          effective_from: string
          effective_to: string | null
          id: string
          maximum_bytes: number | null
          maximum_rows: number | null
          operation_code: string
          sensitive_field_policy: Json
          state: Database["public"]["Enums"]["data_exchange_policy_state"]
          version: number
        }
        Insert: {
          allowed_formats?: string[]
          created_at?: string
          created_by?: string | null
          direction: Database["public"]["Enums"]["data_exchange_direction"]
          effective_from?: string
          effective_to?: string | null
          id?: string
          maximum_bytes?: number | null
          maximum_rows?: number | null
          operation_code: string
          sensitive_field_policy?: Json
          state?: Database["public"]["Enums"]["data_exchange_policy_state"]
          version?: number
        }
        Update: {
          allowed_formats?: string[]
          created_at?: string
          created_by?: string | null
          direction?: Database["public"]["Enums"]["data_exchange_direction"]
          effective_from?: string
          effective_to?: string | null
          id?: string
          maximum_bytes?: number | null
          maximum_rows?: number | null
          operation_code?: string
          sensitive_field_policy?: Json
          state?: Database["public"]["Enums"]["data_exchange_policy_state"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_data_exchange_policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_payment_provider_configs: {
        Row: {
          configured_by: string
          created_at: string
          credential_reference: string | null
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          instructions: string | null
          integration_mode: string
          integration_status: string
          merchant_code: string | null
          merchant_name: string | null
          provider: Database["public"]["Enums"]["payment_provider_code"]
          status: Database["public"]["Enums"]["offering_status"]
          version: number
          webhook_status: string | null
        }
        Insert: {
          configured_by: string
          created_at?: string
          credential_reference?: string | null
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          instructions?: string | null
          integration_mode: string
          integration_status: string
          merchant_code?: string | null
          merchant_name?: string | null
          provider: Database["public"]["Enums"]["payment_provider_code"]
          status?: Database["public"]["Enums"]["offering_status"]
          version?: number
          webhook_status?: string | null
        }
        Update: {
          configured_by?: string
          created_at?: string
          credential_reference?: string | null
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          instructions?: string | null
          integration_mode?: string
          integration_status?: string
          merchant_code?: string | null
          merchant_name?: string | null
          provider?: Database["public"]["Enums"]["payment_provider_code"]
          status?: Database["public"]["Enums"]["offering_status"]
          version?: number
          webhook_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_payment_provider_configs_configured_by_fkey"
            columns: ["configured_by"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
        ]
      }
      published_report_header_snapshots: {
        Row: {
          id: string
          published_at: string
          published_by: string | null
          report_snapshot_id: string
          report_template_key: string | null
          resolved_header: Json
          school_id: string
        }
        Insert: {
          id?: string
          published_at?: string
          published_by?: string | null
          report_snapshot_id: string
          report_template_key?: string | null
          resolved_header: Json
          school_id: string
        }
        Update: {
          id?: string
          published_at?: string
          published_by?: string | null
          report_snapshot_id?: string
          report_template_key?: string | null
          resolved_header?: Json
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "published_report_header_snapshots_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_report_header_snapshots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_email_deliveries: {
        Row: {
          attempt_count: number
          created_at: string
          failure_category: string | null
          id: string
          idempotency_key: string
          provider_reference: string | null
          receipt_id: string
          recipient_snapshot: string
          school_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["delivery_lifecycle_status"]
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          failure_category?: string | null
          id?: string
          idempotency_key: string
          provider_reference?: string | null
          receipt_id: string
          recipient_snapshot: string
          school_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_lifecycle_status"]
        }
        Update: {
          attempt_count?: number
          created_at?: string
          failure_category?: string | null
          id?: string
          idempotency_key?: string
          provider_reference?: string | null
          receipt_id?: string
          recipient_snapshot?: string
          school_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_lifecycle_status"]
        }
        Relationships: [
          {
            foreignKeyName: "receipt_email_deliveries_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "digital_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_email_deliveries_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      report_audit_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_data: Json
          event_type: string
          id: string
          learner_id: string | null
          report_snapshot_id: string | null
          school_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_data?: Json
          event_type: string
          id?: string
          learner_id?: string | null
          report_snapshot_id?: string | null
          school_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_data?: Json
          event_type?: string
          id?: string
          learner_id?: string | null
          report_snapshot_id?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_audit_events_report_snapshot_id_fkey"
            columns: ["report_snapshot_id"]
            isOneToOne: false
            referencedRelation: "report_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_audit_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      report_card_approvals: {
        Row: {
          approval_status: string | null
          created_at: string | null
          id: string
          published_at: string | null
          review_notes: string | null
          reviewed_by: string | null
          student_id: string | null
          term_id: string | null
          updated_at: string | null
        }
        Insert: {
          approval_status?: string | null
          created_at?: string | null
          id?: string
          published_at?: string | null
          review_notes?: string | null
          reviewed_by?: string | null
          student_id?: string | null
          term_id?: string | null
          updated_at?: string | null
        }
        Update: {
          approval_status?: string | null
          created_at?: string | null
          id?: string
          published_at?: string | null
          review_notes?: string | null
          reviewed_by?: string | null
          student_id?: string | null
          term_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_card_approvals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_card_approvals_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_card_approvals_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      report_comment_configurations: {
        Row: {
          created_at: string
          created_by: string | null
          custom_role_name: string | null
          id: string
          is_enabled: boolean
          minimum_evidence_state: Database["public"]["Enums"]["report_comment_confidence"]
          requires_manual_review: boolean
          role_type: Database["public"]["Enums"]["report_comment_role"]
          school_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custom_role_name?: string | null
          id?: string
          is_enabled?: boolean
          minimum_evidence_state?: Database["public"]["Enums"]["report_comment_confidence"]
          requires_manual_review?: boolean
          role_type: Database["public"]["Enums"]["report_comment_role"]
          school_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custom_role_name?: string | null
          id?: string
          is_enabled?: boolean
          minimum_evidence_state?: Database["public"]["Enums"]["report_comment_confidence"]
          requires_manual_review?: boolean
          role_type?: Database["public"]["Enums"]["report_comment_role"]
          school_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_comment_configurations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comment_configurations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comment_configurations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      report_comment_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_data: Json
          event_type: string
          id: string
          new_status:
            | Database["public"]["Enums"]["report_comment_status"]
            | null
          previous_status:
            | Database["public"]["Enums"]["report_comment_status"]
            | null
          reason: string | null
          report_comment_id: string
          school_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_data?: Json
          event_type: string
          id?: string
          new_status?:
            | Database["public"]["Enums"]["report_comment_status"]
            | null
          previous_status?:
            | Database["public"]["Enums"]["report_comment_status"]
            | null
          reason?: string | null
          report_comment_id: string
          school_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_data?: Json
          event_type?: string
          id?: string
          new_status?:
            | Database["public"]["Enums"]["report_comment_status"]
            | null
          previous_status?:
            | Database["public"]["Enums"]["report_comment_status"]
            | null
          reason?: string | null
          report_comment_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_comment_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comment_events_report_comment_id_fkey"
            columns: ["report_comment_id"]
            isOneToOne: false
            referencedRelation: "report_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comment_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      report_comments: {
        Row: {
          academic_year_id: string
          approved_at: string | null
          confidence_state: Database["public"]["Enums"]["report_comment_confidence"]
          created_at: string
          custom_role_name: string | null
          edited_comment: string | null
          evidence_used: Json
          final_comment: string | null
          generated_at: string | null
          generated_comment: string | null
          generation_method: string
          id: string
          learner_id: string
          published_at: string | null
          report_snapshot_id: string | null
          responsible_user_id: string | null
          reviewed_at: string | null
          role_type: Database["public"]["Enums"]["report_comment_role"]
          school_id: string
          status: Database["public"]["Enums"]["report_comment_status"]
          subject_offering_id: string | null
          template_id: string | null
          template_version: string | null
          term_id: string
          updated_at: string
          warnings: Json
        }
        Insert: {
          academic_year_id: string
          approved_at?: string | null
          confidence_state?: Database["public"]["Enums"]["report_comment_confidence"]
          created_at?: string
          custom_role_name?: string | null
          edited_comment?: string | null
          evidence_used?: Json
          final_comment?: string | null
          generated_at?: string | null
          generated_comment?: string | null
          generation_method?: string
          id?: string
          learner_id: string
          published_at?: string | null
          report_snapshot_id?: string | null
          responsible_user_id?: string | null
          reviewed_at?: string | null
          role_type: Database["public"]["Enums"]["report_comment_role"]
          school_id: string
          status?: Database["public"]["Enums"]["report_comment_status"]
          subject_offering_id?: string | null
          template_id?: string | null
          template_version?: string | null
          term_id: string
          updated_at?: string
          warnings?: Json
        }
        Update: {
          academic_year_id?: string
          approved_at?: string | null
          confidence_state?: Database["public"]["Enums"]["report_comment_confidence"]
          created_at?: string
          custom_role_name?: string | null
          edited_comment?: string | null
          evidence_used?: Json
          final_comment?: string | null
          generated_at?: string | null
          generated_comment?: string | null
          generation_method?: string
          id?: string
          learner_id?: string
          published_at?: string | null
          report_snapshot_id?: string | null
          responsible_user_id?: string | null
          reviewed_at?: string | null
          role_type?: Database["public"]["Enums"]["report_comment_role"]
          school_id?: string
          status?: Database["public"]["Enums"]["report_comment_status"]
          subject_offering_id?: string | null
          template_id?: string | null
          template_version?: string | null
          term_id?: string
          updated_at?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "report_comments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comments_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "comment_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      report_generation_jobs: {
        Row: {
          academic_year_id: string
          completed_at: string | null
          completed_count: number
          created_at: string
          error_summary: string | null
          id: string
          learner_ids: string[]
          output_asset_id: string | null
          requested_by: string
          school_id: string
          started_at: string | null
          status: string
          term_id: string
          total_count: number
        }
        Insert: {
          academic_year_id: string
          completed_at?: string | null
          completed_count?: number
          created_at?: string
          error_summary?: string | null
          id?: string
          learner_ids: string[]
          output_asset_id?: string | null
          requested_by: string
          school_id: string
          started_at?: string | null
          status?: string
          term_id: string
          total_count: number
        }
        Update: {
          academic_year_id?: string
          completed_at?: string | null
          completed_count?: number
          created_at?: string
          error_summary?: string | null
          id?: string
          learner_ids?: string[]
          output_asset_id?: string | null
          requested_by?: string
          school_id?: string
          started_at?: string | null
          status?: string
          term_id?: string
          total_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_generation_jobs_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_generation_jobs_output_asset_id_fkey"
            columns: ["output_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_generation_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_generation_jobs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_generation_jobs_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      report_header_settings: {
        Row: {
          display_order: number
          field_key: string
          id: string
          is_visible: boolean
          report_template_key: string | null
          school_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          display_order?: number
          field_key: string
          id?: string
          is_visible?: boolean
          report_template_key?: string | null
          school_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          display_order?: number
          field_key?: string
          id?: string
          is_visible?: boolean
          report_template_key?: string | null
          school_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_header_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_header_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      report_layout_validations: {
        Row: {
          id: string
          issues: Json
          learner_id: string
          measured_height_mm: number | null
          overflow_fields: Json
          page_count: number | null
          report_snapshot_id: string | null
          school_id: string
          status: string
          subject_count: number
          validated_at: string
          validated_by: string | null
        }
        Insert: {
          id?: string
          issues?: Json
          learner_id: string
          measured_height_mm?: number | null
          overflow_fields?: Json
          page_count?: number | null
          report_snapshot_id?: string | null
          school_id: string
          status: string
          subject_count: number
          validated_at?: string
          validated_by?: string | null
        }
        Update: {
          id?: string
          issues?: Json
          learner_id?: string
          measured_height_mm?: number | null
          overflow_fields?: Json
          page_count?: number | null
          report_snapshot_id?: string | null
          school_id?: string
          status?: string
          subject_count?: number
          validated_at?: string
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_layout_validations_report_snapshot_id_fkey"
            columns: ["report_snapshot_id"]
            isOneToOne: false
            referencedRelation: "report_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_layout_validations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_layout_validations_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      report_signatories: {
        Row: {
          display_name: string
          final_comment: string
          id: string
          report_snapshot_id: string
          role_type: Database["public"]["Enums"]["report_comment_role"]
          signature_status: string
          signature_url: string | null
          signed_at: string | null
          user_id: string
        }
        Insert: {
          display_name: string
          final_comment: string
          id?: string
          report_snapshot_id: string
          role_type: Database["public"]["Enums"]["report_comment_role"]
          signature_status: string
          signature_url?: string | null
          signed_at?: string | null
          user_id: string
        }
        Update: {
          display_name?: string
          final_comment?: string
          id?: string
          report_snapshot_id?: string
          role_type?: Database["public"]["Enums"]["report_comment_role"]
          signature_status?: string
          signature_url?: string | null
          signed_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_signatories_report_snapshot_id_fkey"
            columns: ["report_snapshot_id"]
            isOneToOne: false
            referencedRelation: "report_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_signatories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      report_snapshots: {
        Row: {
          academic_year_id: string
          assessment_configuration_snapshot: Json
          attendance_snapshot: Json | null
          class_id: string
          conversion_configuration_version: string
          grading_configuration_version: string
          id: string
          learner_id: string
          learner_photo_media_id: string | null
          next_term_start_date: string | null
          prepared_at: string
          prepared_by: string | null
          published_at: string | null
          published_by: string | null
          report_reference: string | null
          report_settings_version: string
          report_template_key: string
          school_id: string
          school_logo_media_id: string | null
          snapshot_data: Json
          status: string
          stream_id: string | null
          term_id: string
          verification_reference: string | null
          version: number
        }
        Insert: {
          academic_year_id: string
          assessment_configuration_snapshot?: Json
          attendance_snapshot?: Json | null
          class_id: string
          conversion_configuration_version: string
          grading_configuration_version: string
          id?: string
          learner_id: string
          learner_photo_media_id?: string | null
          next_term_start_date?: string | null
          prepared_at?: string
          prepared_by?: string | null
          published_at?: string | null
          published_by?: string | null
          report_reference?: string | null
          report_settings_version?: string
          report_template_key: string
          school_id: string
          school_logo_media_id?: string | null
          snapshot_data: Json
          status?: string
          stream_id?: string | null
          term_id: string
          verification_reference?: string | null
          version?: number
        }
        Update: {
          academic_year_id?: string
          assessment_configuration_snapshot?: Json
          attendance_snapshot?: Json | null
          class_id?: string
          conversion_configuration_version?: string
          grading_configuration_version?: string
          id?: string
          learner_id?: string
          learner_photo_media_id?: string | null
          next_term_start_date?: string | null
          prepared_at?: string
          prepared_by?: string | null
          published_at?: string | null
          published_by?: string | null
          report_reference?: string | null
          report_settings_version?: string
          report_template_key?: string
          school_id?: string
          school_logo_media_id?: string | null
          snapshot_data?: Json
          status?: string
          stream_id?: string | null
          term_id?: string
          verification_reference?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_snapshots_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_snapshots_learner_photo_media_id_fkey"
            columns: ["learner_photo_media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_snapshots_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_snapshots_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_snapshots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_snapshots_school_logo_media_id_fkey"
            columns: ["school_logo_media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_snapshots_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      report_subject_results: {
        Row: {
          competency_id: string | null
          competency_text: string
          display_order: number
          grading_band_id: string | null
          grading_descriptor: string
          id: string
          percentage_score: number
          report_snapshot_id: string
          subject_code: string | null
          subject_id: string
          subject_name: string
          teacher_allocation_ids: string[]
          teacher_initials: string
          teacher_user_ids: string[]
          three_point_score_displayed: number
          three_point_score_exact: number
        }
        Insert: {
          competency_id?: string | null
          competency_text: string
          display_order: number
          grading_band_id?: string | null
          grading_descriptor: string
          id?: string
          percentage_score: number
          report_snapshot_id: string
          subject_code?: string | null
          subject_id: string
          subject_name: string
          teacher_allocation_ids: string[]
          teacher_initials: string
          teacher_user_ids: string[]
          three_point_score_displayed: number
          three_point_score_exact: number
        }
        Update: {
          competency_id?: string | null
          competency_text?: string
          display_order?: number
          grading_band_id?: string | null
          grading_descriptor?: string
          id?: string
          percentage_score?: number
          report_snapshot_id?: string
          subject_code?: string | null
          subject_id?: string
          subject_name?: string
          teacher_allocation_ids?: string[]
          teacher_initials?: string
          teacher_user_ids?: string[]
          three_point_score_displayed?: number
          three_point_score_exact?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_subject_results_report_snapshot_id_fkey"
            columns: ["report_snapshot_id"]
            isOneToOne: false
            referencedRelation: "report_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_system_role: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      school_addresses: {
        Row: {
          address_line: string | null
          address_type: string
          country: string | null
          created_at: string
          district: string | null
          id: string
          parish: string | null
          postal_address: string | null
          region: string | null
          school_id: string
          subcounty: string | null
          updated_at: string
          village: string | null
        }
        Insert: {
          address_line?: string | null
          address_type: string
          country?: string | null
          created_at?: string
          district?: string | null
          id?: string
          parish?: string | null
          postal_address?: string | null
          region?: string | null
          school_id: string
          subcounty?: string | null
          updated_at?: string
          village?: string | null
        }
        Update: {
          address_line?: string | null
          address_type?: string
          country?: string | null
          created_at?: string
          district?: string | null
          id?: string
          parish?: string | null
          postal_address?: string | null
          region?: string | null
          school_id?: string
          subcounty?: string | null
          updated_at?: string
          village?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_addresses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_admin_invitations: {
        Row: {
          accepted_at: string | null
          attempt_count: number
          created_at: string
          created_by: string
          delivered_at: string | null
          email: string
          expires_at: string
          failure_category: string | null
          full_name: string
          id: string
          invited_user_id: string | null
          replaced_by: string | null
          requires_mfa: boolean
          requires_password_change: boolean
          revoked_at: string | null
          role: string
          school_id: string
          sent_at: string | null
          status: string
          telephone: string | null
          temporary_credential_expires_at: string | null
          token_hash: string
          updated_at: string
          used_at: string | null
          username: string | null
        }
        Insert: {
          accepted_at?: string | null
          attempt_count?: number
          created_at?: string
          created_by: string
          delivered_at?: string | null
          email: string
          expires_at: string
          failure_category?: string | null
          full_name: string
          id?: string
          invited_user_id?: string | null
          replaced_by?: string | null
          requires_mfa?: boolean
          requires_password_change?: boolean
          revoked_at?: string | null
          role?: string
          school_id: string
          sent_at?: string | null
          status?: string
          telephone?: string | null
          temporary_credential_expires_at?: string | null
          token_hash: string
          updated_at?: string
          used_at?: string | null
          username?: string | null
        }
        Update: {
          accepted_at?: string | null
          attempt_count?: number
          created_at?: string
          created_by?: string
          delivered_at?: string | null
          email?: string
          expires_at?: string
          failure_category?: string | null
          full_name?: string
          id?: string
          invited_user_id?: string | null
          replaced_by?: string | null
          requires_mfa?: boolean
          requires_password_change?: boolean
          revoked_at?: string | null
          role?: string
          school_id?: string
          sent_at?: string | null
          status?: string
          telephone?: string | null
          temporary_credential_expires_at?: string | null
          token_hash?: string
          updated_at?: string
          used_at?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_admin_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_admin_invitations_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "school_admin_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_admin_invitations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_admin_policy_acceptances: {
        Row: {
          accepted_at: string
          id: string
          privacy_version: string
          school_id: string
          terms_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          privacy_version: string
          school_id: string
          terms_version: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          id?: string
          privacy_version?: string
          school_id?: string
          terms_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_admin_policy_acceptances_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_admin_policy_acceptances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      school_administration_assignments: {
        Row: {
          created_at: string
          fallback_name: string | null
          id: string
          is_active: boolean
          role_key: string
          school_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          fallback_name?: string | null
          id?: string
          is_active?: boolean
          role_key: string
          school_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          fallback_name?: string | null
          id?: string
          is_active?: boolean
          role_key?: string
          school_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_administration_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_administration_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      school_billing_profiles: {
        Row: {
          census_deadline_days: number
          configured_by: string | null
          late_learner_treatment: string
          onboarding_fee_minor: number
          plan_id: string
          school_id: string
          updated_at: string
          volume_cap_minor: number | null
        }
        Insert: {
          census_deadline_days?: number
          configured_by?: string | null
          late_learner_treatment?: string
          onboarding_fee_minor?: number
          plan_id: string
          school_id: string
          updated_at?: string
          volume_cap_minor?: number | null
        }
        Update: {
          census_deadline_days?: number
          configured_by?: string | null
          late_learner_treatment?: string
          onboarding_fee_minor?: number
          plan_id?: string
          school_id?: string
          updated_at?: string
          volume_cap_minor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "school_billing_profiles_configured_by_fkey"
            columns: ["configured_by"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_billing_profiles_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_billing_profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_contacts: {
        Row: {
          contact_type: string
          created_at: string
          display_order: number
          id: string
          is_primary: boolean
          label: string
          school_id: string
          updated_at: string
          value: string
        }
        Insert: {
          contact_type: string
          created_at?: string
          display_order?: number
          id?: string
          is_primary?: boolean
          label: string
          school_id: string
          updated_at?: string
          value: string
        }
        Update: {
          contact_type?: string
          created_at?: string
          display_order?: number
          id?: string
          is_primary?: boolean
          label?: string
          school_id?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_contacts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_data_exchange_policies: {
        Row: {
          allowed_roles: string[]
          approval_required: boolean
          enabled: boolean
          id: string
          maximum_bytes: number | null
          maximum_rows: number | null
          maximum_scope: Database["public"]["Enums"]["data_exchange_scope"]
          permitted_fields: string[]
          platform_policy_id: string
          school_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          allowed_roles?: string[]
          approval_required?: boolean
          enabled?: boolean
          id?: string
          maximum_bytes?: number | null
          maximum_rows?: number | null
          maximum_scope?: Database["public"]["Enums"]["data_exchange_scope"]
          permitted_fields?: string[]
          platform_policy_id: string
          school_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          allowed_roles?: string[]
          approval_required?: boolean
          enabled?: boolean
          id?: string
          maximum_bytes?: number | null
          maximum_rows?: number | null
          maximum_scope?: Database["public"]["Enums"]["data_exchange_scope"]
          permitted_fields?: string[]
          platform_policy_id?: string
          school_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "school_data_exchange_policies_platform_policy_id_fkey"
            columns: ["platform_policy_id"]
            isOneToOne: false
            referencedRelation: "platform_data_exchange_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_data_exchange_policies_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_data_exchange_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      school_feature_overrides: {
        Row: {
          changed_at: string
          changed_by: string
          feature_key: string
          override_state: string
          reason: string
          school_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          feature_key: string
          override_state: string
          reason: string
          school_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          feature_key?: string
          override_state?: string
          reason?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_feature_overrides_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_feature_overrides_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "school_feature_overrides_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_fee_items: {
        Row: {
          amount_minor: number
          display_order: number
          due_on: string | null
          fee_structure_id: string
          id: string
          is_optional: boolean
          item_name: string
        }
        Insert: {
          amount_minor: number
          display_order?: number
          due_on?: string | null
          fee_structure_id: string
          id?: string
          is_optional?: boolean
          item_name: string
        }
        Update: {
          amount_minor?: number
          display_order?: number
          due_on?: string | null
          fee_structure_id?: string
          id?: string
          is_optional?: boolean
          item_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_fee_items_fee_structure_id_fkey"
            columns: ["fee_structure_id"]
            isOneToOne: false
            referencedRelation: "school_fee_structures"
            referencedColumns: ["id"]
          },
        ]
      }
      school_fee_payments: {
        Row: {
          amount_minor: number
          confirmed_at: string | null
          correction_of: string | null
          created_at: string
          currency: string
          id: string
          learner_invoice_id: string
          payment_reference: string
          provider_charge_minor: number
          provider_transaction_reference: string | null
          received_at: string | null
          recorded_by: string | null
          school_id: string
          status: string
        }
        Insert: {
          amount_minor: number
          confirmed_at?: string | null
          correction_of?: string | null
          created_at?: string
          currency?: string
          id?: string
          learner_invoice_id: string
          payment_reference: string
          provider_charge_minor?: number
          provider_transaction_reference?: string | null
          received_at?: string | null
          recorded_by?: string | null
          school_id: string
          status?: string
        }
        Update: {
          amount_minor?: number
          confirmed_at?: string | null
          correction_of?: string | null
          created_at?: string
          currency?: string
          id?: string
          learner_invoice_id?: string
          payment_reference?: string
          provider_charge_minor?: number
          provider_transaction_reference?: string | null
          received_at?: string | null
          recorded_by?: string | null
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_fee_payments_correction_of_fkey"
            columns: ["correction_of"]
            isOneToOne: false
            referencedRelation: "school_fee_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_fee_payments_learner_invoice_id_fkey"
            columns: ["learner_invoice_id"]
            isOneToOne: false
            referencedRelation: "learner_fee_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_fee_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_fee_payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_fee_structures: {
        Row: {
          academic_term: string
          academic_year: number
          class_id: string | null
          created_at: string
          created_by: string
          id: string
          learner_type: string | null
          name: string
          residence_type: string | null
          school_id: string
          status: string
          stream_id: string | null
          updated_at: string
        }
        Insert: {
          academic_term: string
          academic_year: number
          class_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          learner_type?: string | null
          name: string
          residence_type?: string | null
          school_id: string
          status?: string
          stream_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_term?: string
          academic_year?: number
          class_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          learner_type?: string | null
          name?: string
          residence_type?: string | null
          school_id?: string
          status?: string
          stream_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_fee_structures_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "academic_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_fee_structures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_fee_structures_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_fee_structures_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "class_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      school_invitation_events: {
        Row: {
          actor_platform_admin_id: string | null
          event_type: string
          id: string
          invitation_id: string
          occurred_at: string
          safe_metadata: Json
          school_id: string
        }
        Insert: {
          actor_platform_admin_id?: string | null
          event_type: string
          id?: string
          invitation_id: string
          occurred_at?: string
          safe_metadata?: Json
          school_id: string
        }
        Update: {
          actor_platform_admin_id?: string | null
          event_type?: string
          id?: string
          invitation_id?: string
          occurred_at?: string
          safe_metadata?: Json
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_invitation_events_actor_platform_admin_id_fkey"
            columns: ["actor_platform_admin_id"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_invitation_events_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "school_admin_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_invitation_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_memberships: {
        Row: {
          created_at: string
          id: string
          role_id: string
          school_id: string
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_id: string
          school_id: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string
          school_id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_memberships_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_memberships_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      school_onboarding_states: {
        Row: {
          milestones: Json
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          milestones?: Json
          school_id: string
          status: string
          updated_at?: string
        }
        Update: {
          milestones?: Json
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_onboarding_states_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_payment_channels: {
        Row: {
          channel_type: string
          charge_policy: string
          credential_reference: string | null
          id: string
          is_enabled: boolean
          provider_name: string
          school_id: string
          school_share_percentage: number
          updated_at: string
        }
        Insert: {
          channel_type: string
          charge_policy?: string
          credential_reference?: string | null
          id?: string
          is_enabled?: boolean
          provider_name: string
          school_id: string
          school_share_percentage?: number
          updated_at?: string
        }
        Update: {
          channel_type?: string
          charge_policy?: string
          credential_reference?: string | null
          id?: string
          is_enabled?: boolean
          provider_name?: string
          school_id?: string
          school_share_percentage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_payment_channels_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_profile_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          field_key: string | null
          id: string
          new_value: Json | null
          previous_value: Json | null
          school_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          field_key?: string | null
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
          school_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          field_key?: string | null
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_profile_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_profile_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_setup_checklist_items: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          display_order: number
          id: string
          is_complete: boolean
          is_required: boolean
          item_code: string
          label: string
          overridden_at: string | null
          overridden_by: string | null
          override_reason: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          display_order: number
          id?: string
          is_complete?: boolean
          is_required?: boolean
          item_code: string
          label: string
          overridden_at?: string | null
          overridden_by?: string | null
          override_reason?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_complete?: boolean
          is_required?: boolean
          item_code?: string
          label?: string
          overridden_at?: string | null
          overridden_by?: string | null
          override_reason?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_setup_checklist_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_setup_checklist_items_overridden_by_fkey"
            columns: ["overridden_by"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_setup_checklist_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_subject_offerings: {
        Row: {
          academic_year_id: string
          created_at: string
          curriculum_version_id: string | null
          department_id: string | null
          display_name_override: string | null
          id: string
          programme: Database["public"]["Enums"]["subject_programme"]
          retired_at: string | null
          school_id: string
          school_subject_code: string | null
          status: Database["public"]["Enums"]["offering_status"]
          subject_level: Database["public"]["Enums"]["subject_level"] | null
          subject_source: string
          system_subject_id: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          curriculum_version_id?: string | null
          department_id?: string | null
          display_name_override?: string | null
          id?: string
          programme: Database["public"]["Enums"]["subject_programme"]
          retired_at?: string | null
          school_id: string
          school_subject_code?: string | null
          status?: Database["public"]["Enums"]["offering_status"]
          subject_level?: Database["public"]["Enums"]["subject_level"] | null
          subject_source?: string
          system_subject_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          curriculum_version_id?: string | null
          department_id?: string | null
          display_name_override?: string | null
          id?: string
          programme?: Database["public"]["Enums"]["subject_programme"]
          retired_at?: string | null
          school_id?: string
          school_subject_code?: string | null
          status?: Database["public"]["Enums"]["offering_status"]
          subject_level?: Database["public"]["Enums"]["subject_level"] | null
          subject_source?: string
          system_subject_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_subject_offerings_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_subject_offerings_curriculum_version_id_fkey"
            columns: ["curriculum_version_id"]
            isOneToOne: false
            referencedRelation: "subject_curriculum_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_subject_offerings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_subject_offerings_system_subject_id_fkey"
            columns: ["system_subject_id"]
            isOneToOne: false
            referencedRelation: "system_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      school_subject_papers: {
        Row: {
          created_at: string
          created_by: string
          id: string
          paper_code: string | null
          paper_name: string
          paper_type: string
          school_id: string
          school_subject_offering_id: string
          status: Database["public"]["Enums"]["offering_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          paper_code?: string | null
          paper_name: string
          paper_type: string
          school_id: string
          school_subject_offering_id: string
          status?: Database["public"]["Enums"]["offering_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          paper_code?: string | null
          paper_name?: string
          paper_type?: string
          school_id?: string
          school_subject_offering_id?: string
          status?: Database["public"]["Enums"]["offering_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_subject_papers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_subject_papers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_subject_papers_school_subject_offering_id_school_id_fkey"
            columns: ["school_subject_offering_id", "school_id"]
            isOneToOne: false
            referencedRelation: "school_subject_offerings"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      school_subscriptions: {
        Row: {
          created_at: string
          expires_on: string
          grace_period_days: number
          id: string
          plan_id: string
          renewal_status: string
          school_id: string
          starts_on: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_on: string
          grace_period_days?: number
          id?: string
          plan_id: string
          renewal_status?: string
          school_id: string
          starts_on: string
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_on?: string
          grace_period_days?: number
          id?: string
          plan_id?: string
          renewal_status?: string
          school_id?: string
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_subscriptions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          additional_information: Json
          address: string | null
          country: string | null
          created_at: string
          district: string | null
          email: string | null
          emis_number: string | null
          gender_category: string | null
          id: string
          internal_platform_notes: string | null
          is_active: boolean
          lifecycle_status: string
          logo_url: string | null
          motto: string | null
          official_name: string
          ownership: string | null
          primary_colour: string
          registration_number: string | null
          report_header_style: string
          school_code: string
          school_level: string | null
          school_type: string | null
          seal_url: string | null
          secondary_colour: string
          secondary_logo_url: string | null
          setup_approved_at: string | null
          setup_approved_by: string | null
          setup_submitted_at: string | null
          short_name: string | null
          slogan: string | null
          telephone: string | null
          uneb_centre_number: string | null
          updated_at: string
          year_established: number | null
        }
        Insert: {
          additional_information?: Json
          address?: string | null
          country?: string | null
          created_at?: string
          district?: string | null
          email?: string | null
          emis_number?: string | null
          gender_category?: string | null
          id?: string
          internal_platform_notes?: string | null
          is_active?: boolean
          lifecycle_status?: string
          logo_url?: string | null
          motto?: string | null
          official_name: string
          ownership?: string | null
          primary_colour?: string
          registration_number?: string | null
          report_header_style?: string
          school_code: string
          school_level?: string | null
          school_type?: string | null
          seal_url?: string | null
          secondary_colour?: string
          secondary_logo_url?: string | null
          setup_approved_at?: string | null
          setup_approved_by?: string | null
          setup_submitted_at?: string | null
          short_name?: string | null
          slogan?: string | null
          telephone?: string | null
          uneb_centre_number?: string | null
          updated_at?: string
          year_established?: number | null
        }
        Update: {
          additional_information?: Json
          address?: string | null
          country?: string | null
          created_at?: string
          district?: string | null
          email?: string | null
          emis_number?: string | null
          gender_category?: string | null
          id?: string
          internal_platform_notes?: string | null
          is_active?: boolean
          lifecycle_status?: string
          logo_url?: string | null
          motto?: string | null
          official_name?: string
          ownership?: string | null
          primary_colour?: string
          registration_number?: string | null
          report_header_style?: string
          school_code?: string
          school_level?: string | null
          school_type?: string | null
          seal_url?: string | null
          secondary_colour?: string
          secondary_logo_url?: string | null
          setup_approved_at?: string | null
          setup_approved_by?: string | null
          setup_submitted_at?: string | null
          short_name?: string | null
          slogan?: string | null
          telephone?: string | null
          uneb_centre_number?: string | null
          updated_at?: string
          year_established?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "schools_setup_approved_by_fkey"
            columns: ["setup_approved_by"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          school_id: string | null
          severity: string
          summary: string
        }
        Insert: {
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          school_id?: string | null
          severity: string
          summary: string
        }
        Update: {
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          school_id?: string | null
          severity?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          age: number
          cbc_score: number | null
          class_id: string | null
          class_name: string
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          roll_no: string
          stream: string | null
          updated_at: string | null
        }
        Insert: {
          age?: number
          cbc_score?: number | null
          class_id?: string | null
          class_name?: string
          created_at?: string | null
          created_by?: string | null
          id: string
          name: string
          roll_no: string
          stream?: string | null
          updated_at?: string | null
        }
        Update: {
          age?: number
          cbc_score?: number | null
          class_id?: string | null
          class_name?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          roll_no?: string
          stream?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_catalogue_audit_findings: {
        Row: {
          audited_at: string
          detail: string
          finding: string
          id: string
          matched_subject_id: string | null
          normalized_name: string
          programme: Database["public"]["Enums"]["subject_programme"]
          requested_name: string
        }
        Insert: {
          audited_at?: string
          detail: string
          finding: string
          id?: string
          matched_subject_id?: string | null
          normalized_name: string
          programme: Database["public"]["Enums"]["subject_programme"]
          requested_name: string
        }
        Update: {
          audited_at?: string
          detail?: string
          finding?: string
          id?: string
          matched_subject_id?: string | null
          normalized_name?: string
          programme?: Database["public"]["Enums"]["subject_programme"]
          requested_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_catalogue_audit_findings_matched_subject_id_fkey"
            columns: ["matched_subject_id"]
            isOneToOne: false
            referencedRelation: "system_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_combinations: {
        Row: {
          academic_year_id: string
          code: string
          created_at: string
          id: string
          name: string
          school_id: string
          status: Database["public"]["Enums"]["offering_status"]
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          code: string
          created_at?: string
          id?: string
          name: string
          school_id: string
          status?: Database["public"]["Enums"]["offering_status"]
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          code?: string
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          status?: Database["public"]["Enums"]["offering_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_combinations_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_combinations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_competencies: {
        Row: {
          academic_year_id: string
          competency_code: string
          competency_text: string
          created_at: string
          curriculum_outcome_reference: string | null
          id: string
          is_reportable: boolean
          school_id: string
          subject_id: string
          term_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          competency_code: string
          competency_text: string
          created_at?: string
          curriculum_outcome_reference?: string | null
          id?: string
          is_reportable?: boolean
          school_id: string
          subject_id: string
          term_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          competency_code?: string
          competency_text?: string
          created_at?: string
          curriculum_outcome_reference?: string | null
          id?: string
          is_reportable?: boolean
          school_id?: string
          subject_id?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_competencies_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_competencies_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_competencies_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_curriculum_versions: {
        Row: {
          created_at: string
          effective_from: string | null
          effective_to: string | null
          id: string
          programme: Database["public"]["Enums"]["subject_programme"]
          source_authority: string | null
          source_document: string | null
          status: Database["public"]["Enums"]["offering_status"]
          system_subject_id: string
          verification_status: Database["public"]["Enums"]["reference_verification_status"]
          version_code: string
        }
        Insert: {
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          programme: Database["public"]["Enums"]["subject_programme"]
          source_authority?: string | null
          source_document?: string | null
          status?: Database["public"]["Enums"]["offering_status"]
          system_subject_id: string
          verification_status?: Database["public"]["Enums"]["reference_verification_status"]
          version_code: string
        }
        Update: {
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          programme?: Database["public"]["Enums"]["subject_programme"]
          source_authority?: string | null
          source_document?: string | null
          status?: Database["public"]["Enums"]["offering_status"]
          system_subject_id?: string
          verification_status?: Database["public"]["Enums"]["reference_verification_status"]
          version_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_curriculum_versions_system_subject_id_fkey"
            columns: ["system_subject_id"]
            isOneToOne: false
            referencedRelation: "system_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_teacher_allocations: {
        Row: {
          academic_year_id: string
          allocation_role: string
          class_id: string
          created_at: string
          id: string
          is_active: boolean
          report_display_order: number
          school_id: string
          stream_id: string | null
          subject_offering_id: string
          teacher_user_id: string
          term_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          allocation_role?: string
          class_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          report_display_order?: number
          school_id: string
          stream_id?: string | null
          subject_offering_id: string
          teacher_user_id: string
          term_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          allocation_role?: string
          class_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          report_display_order?: number
          school_id?: string
          stream_id?: string | null
          subject_offering_id?: string
          teacher_user_id?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_teacher_allocations_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_teacher_allocations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_teacher_allocations_teacher_user_id_fkey"
            columns: ["teacher_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_teacher_allocations_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_compulsory: boolean | null
          name: string
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_compulsory?: boolean | null
          name: string
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_compulsory?: boolean | null
          name?: string
        }
        Relationships: []
      }
      subscription_invoice_adjustments: {
        Row: {
          adjustment_type: string
          amount_minor: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          invoice_id: string
          reason: string
          requested_by: string
          school_id: string
          status: string
        }
        Insert: {
          adjustment_type: string
          amount_minor: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          invoice_id: string
          reason: string
          requested_by: string
          school_id: string
          status?: string
        }
        Update: {
          adjustment_type?: string
          amount_minor?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          invoice_id?: string
          reason?: string
          requested_by?: string
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoice_adjustments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoice_adjustments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoice_adjustments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoices: {
        Row: {
          academic_term: string
          academic_year: number
          active_learner_count: number | null
          amount_due: number
          balance_minor: number | null
          billing_cadence: string | null
          created_at: string
          currency: string
          discount_minor: number
          due_at: string
          gross_amount_minor: number | null
          id: string
          invoice_number: string
          issued_at: string
          minimum_charge_minor: number | null
          onboarding_amount_minor: number
          paid_at: string | null
          payment_reference: string
          plan_code: string
          provider_config_snapshot: Json
          school_id: string
          status: Database["public"]["Enums"]["invoice_lifecycle_status"]
          subscription_period_id: string
          unit_price_minor: number | null
          updated_at: string
        }
        Insert: {
          academic_term: string
          academic_year: number
          active_learner_count?: number | null
          amount_due: number
          balance_minor?: number | null
          billing_cadence?: string | null
          created_at?: string
          currency: string
          discount_minor?: number
          due_at: string
          gross_amount_minor?: number | null
          id?: string
          invoice_number: string
          issued_at?: string
          minimum_charge_minor?: number | null
          onboarding_amount_minor?: number
          paid_at?: string | null
          payment_reference: string
          plan_code: string
          provider_config_snapshot?: Json
          school_id: string
          status?: Database["public"]["Enums"]["invoice_lifecycle_status"]
          subscription_period_id: string
          unit_price_minor?: number | null
          updated_at?: string
        }
        Update: {
          academic_term?: string
          academic_year?: number
          active_learner_count?: number | null
          amount_due?: number
          balance_minor?: number | null
          billing_cadence?: string | null
          created_at?: string
          currency?: string
          discount_minor?: number
          due_at?: string
          gross_amount_minor?: number | null
          id?: string
          invoice_number?: string
          issued_at?: string
          minimum_charge_minor?: number | null
          onboarding_amount_minor?: number
          paid_at?: string | null
          payment_reference?: string
          plan_code?: string
          provider_config_snapshot?: Json
          school_id?: string
          status?: Database["public"]["Enums"]["invoice_lifecycle_status"]
          subscription_period_id?: string
          unit_price_minor?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_subscription_period_id_fkey"
            columns: ["subscription_period_id"]
            isOneToOne: false
            referencedRelation: "subscription_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          academic_term: string | null
          academic_year: number | null
          amount_minor: number
          confirmed_at: string | null
          confirmed_by: string | null
          correction_of: string | null
          created_at: string
          currency: string
          expected_amount_snapshot: number | null
          id: string
          metadata: Json
          method: string
          paid_at: string | null
          reference: string
          school_id: string
          status: string
          subscription_id: string | null
          subscription_period_id: string | null
          transaction_reference: string | null
        }
        Insert: {
          academic_term?: string | null
          academic_year?: number | null
          amount_minor: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          correction_of?: string | null
          created_at?: string
          currency?: string
          expected_amount_snapshot?: number | null
          id?: string
          metadata?: Json
          method: string
          paid_at?: string | null
          reference: string
          school_id: string
          status?: string
          subscription_id?: string | null
          subscription_period_id?: string | null
          transaction_reference?: string | null
        }
        Update: {
          academic_term?: string | null
          academic_year?: number | null
          amount_minor?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          correction_of?: string | null
          created_at?: string
          currency?: string
          expected_amount_snapshot?: number | null
          id?: string
          metadata?: Json
          method?: string
          paid_at?: string | null
          reference?: string
          school_id?: string
          status?: string
          subscription_id?: string | null
          subscription_period_id?: string | null
          transaction_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_correction_of_fkey"
            columns: ["correction_of"]
            isOneToOne: false
            referencedRelation: "subscription_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "school_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_subscription_period_id_fkey"
            columns: ["subscription_period_id"]
            isOneToOne: false
            referencedRelation: "subscription_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_periods: {
        Row: {
          academic_term: string
          academic_year: number
          amount_snapshot: number
          billing_period: string
          created_at: string
          currency: string
          due_on: string
          ends_on: string
          id: string
          plan_id: string
          school_id: string
          starts_on: string
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          academic_term: string
          academic_year: number
          amount_snapshot: number
          billing_period?: string
          created_at?: string
          currency?: string
          due_on: string
          ends_on: string
          id?: string
          plan_id: string
          school_id: string
          starts_on: string
          status: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          academic_term?: string
          academic_year?: number
          amount_snapshot?: number
          billing_period?: string
          created_at?: string
          currency?: string
          due_on?: string
          ends_on?: string
          id?: string
          plan_id?: string
          school_id?: string
          starts_on?: string
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_periods_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_periods_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_periods_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "school_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          billing_cadence: string
          billing_period: string | null
          billing_period_months: number
          census_deadline_days: number
          code: string
          created_at: string
          currency: string
          entitlements: Json
          id: string
          learner_limit: number | null
          minimum_charge_minor: number
          name: string
          price_minor: number
          pricing_model: string
          status: string
          storage_limit_bytes: number
          unit_price_minor: number
          updated_at: string
          user_limit: number | null
          volume_cap_minor: number | null
        }
        Insert: {
          billing_cadence?: string
          billing_period?: string | null
          billing_period_months?: number
          census_deadline_days?: number
          code: string
          created_at?: string
          currency?: string
          entitlements?: Json
          id?: string
          learner_limit?: number | null
          minimum_charge_minor?: number
          name: string
          price_minor: number
          pricing_model?: string
          status?: string
          storage_limit_bytes: number
          unit_price_minor?: number
          updated_at?: string
          user_limit?: number | null
          volume_cap_minor?: number | null
        }
        Update: {
          billing_cadence?: string
          billing_period?: string | null
          billing_period_months?: number
          census_deadline_days?: number
          code?: string
          created_at?: string
          currency?: string
          entitlements?: Json
          id?: string
          learner_limit?: number | null
          minimum_charge_minor?: number
          name?: string
          price_minor?: number
          pricing_model?: string
          status?: string
          storage_limit_bytes?: number
          unit_price_minor?: number
          updated_at?: string
          user_limit?: number | null
          volume_cap_minor?: number | null
        }
        Relationships: []
      }
      support_concessions: {
        Row: {
          amount_minor: number | null
          approved_at: string | null
          approved_by: string | null
          concession_type: string
          created_at: string
          expires_on: string
          id: string
          percentage: number | null
          reason: string
          school_id: string
          sponsor_name: string | null
          starts_on: string
          status: string
        }
        Insert: {
          amount_minor?: number | null
          approved_at?: string | null
          approved_by?: string | null
          concession_type: string
          created_at?: string
          expires_on: string
          id?: string
          percentage?: number | null
          reason: string
          school_id: string
          sponsor_name?: string | null
          starts_on: string
          status?: string
        }
        Update: {
          amount_minor?: number | null
          approved_at?: string | null
          approved_by?: string | null
          concession_type?: string
          created_at?: string
          expires_on?: string
          id?: string
          percentage?: number | null
          reason?: string
          school_id?: string
          sponsor_name?: string | null
          starts_on?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_concessions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_concessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_conflicts: {
        Row: {
          conflict_status:
            | Database["public"]["Enums"]["sync_conflict_status"]
            | null
          created_at: string | null
          device_a_data: Json | null
          device_a_user_id: string | null
          device_b_data: Json | null
          device_b_user_id: string | null
          id: string
          record_id: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          table_name: string
        }
        Insert: {
          conflict_status?:
            | Database["public"]["Enums"]["sync_conflict_status"]
            | null
          created_at?: string | null
          device_a_data?: Json | null
          device_a_user_id?: string | null
          device_b_data?: Json | null
          device_b_user_id?: string | null
          id?: string
          record_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          table_name: string
        }
        Update: {
          conflict_status?:
            | Database["public"]["Enums"]["sync_conflict_status"]
            | null
          created_at?: string | null
          device_a_data?: Json | null
          device_a_user_id?: string | null
          device_b_data?: Json | null
          device_b_user_id?: string | null
          id?: string
          record_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_conflicts_device_a_user_id_fkey"
            columns: ["device_a_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_conflicts_device_b_user_id_fkey"
            columns: ["device_b_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_queue: {
        Row: {
          created_at: string | null
          id: string
          payload: Json
          retry_count: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          payload?: Json
          retry_count?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          payload?: Json
          retry_count?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          error_summary: string | null
          id: string
          is_idempotent: boolean
          job_type: string
          school_id: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_summary?: string | null
          id?: string
          is_idempotent?: boolean
          job_type: string
          school_id?: string | null
          started_at?: string | null
          status: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_summary?: string | null
          id?: string
          is_idempotent?: boolean
          job_type?: string
          school_id?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_jobs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      system_notifications: {
        Row: {
          category: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          idempotency_key: string
          message: string
          read_at: string | null
          recipient_user_id: string
          school_id: string | null
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          idempotency_key: string
          message: string
          read_at?: string | null
          recipient_user_id: string
          school_id?: string | null
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          message?: string
          read_at?: string | null
          recipient_user_id?: string
          school_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      system_subject_papers: {
        Row: {
          component_type: Database["public"]["Enums"]["subject_component_type"]
          curriculum_version: string | null
          curriculum_version_id: string | null
          display_order: number
          duration_minutes: number | null
          effective_from: string | null
          effective_to: string | null
          examination_year: number | null
          id: string
          is_active: boolean
          is_official: boolean
          is_required: boolean
          maximum_mark: number | null
          official_component_type: string | null
          official_source: string | null
          paper_code: string | null
          paper_name: string
          paper_number: string | null
          source_reference: string | null
          system_subject_id: string
          verification_status: Database["public"]["Enums"]["reference_verification_status"]
        }
        Insert: {
          component_type: Database["public"]["Enums"]["subject_component_type"]
          curriculum_version?: string | null
          curriculum_version_id?: string | null
          display_order?: number
          duration_minutes?: number | null
          effective_from?: string | null
          effective_to?: string | null
          examination_year?: number | null
          id?: string
          is_active?: boolean
          is_official?: boolean
          is_required?: boolean
          maximum_mark?: number | null
          official_component_type?: string | null
          official_source?: string | null
          paper_code?: string | null
          paper_name: string
          paper_number?: string | null
          source_reference?: string | null
          system_subject_id: string
          verification_status?: Database["public"]["Enums"]["reference_verification_status"]
        }
        Update: {
          component_type?: Database["public"]["Enums"]["subject_component_type"]
          curriculum_version?: string | null
          curriculum_version_id?: string | null
          display_order?: number
          duration_minutes?: number | null
          effective_from?: string | null
          effective_to?: string | null
          examination_year?: number | null
          id?: string
          is_active?: boolean
          is_official?: boolean
          is_required?: boolean
          maximum_mark?: number | null
          official_component_type?: string | null
          official_source?: string | null
          paper_code?: string | null
          paper_name?: string
          paper_number?: string | null
          source_reference?: string | null
          system_subject_id?: string
          verification_status?: Database["public"]["Enums"]["reference_verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "system_subject_papers_curriculum_version_id_fkey"
            columns: ["curriculum_version_id"]
            isOneToOne: false
            referencedRelation: "subject_curriculum_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_subject_papers_system_subject_id_fkey"
            columns: ["system_subject_id"]
            isOneToOne: false
            referencedRelation: "system_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      system_subjects: {
        Row: {
          catalogue_owner: string
          catalogue_version: string
          created_at: string
          curriculum_version: string | null
          default_activation: boolean
          department_category: string
          effective_from: string | null
          effective_to: string | null
          exam_body: string | null
          examination_catalogue_id: string | null
          id: string
          is_active: boolean
          is_compulsory: boolean
          is_examinable: boolean
          is_official: boolean
          official_source: string | null
          programme: Database["public"]["Enums"]["subject_programme"]
          school_selectable: boolean
          short_name: string
          subject_category: string | null
          subject_code: string | null
          subject_level: Database["public"]["Enums"]["subject_level"] | null
          subject_name: string
          updated_at: string
          verification_status: Database["public"]["Enums"]["reference_verification_status"]
        }
        Insert: {
          catalogue_owner?: string
          catalogue_version?: string
          created_at?: string
          curriculum_version?: string | null
          default_activation?: boolean
          department_category: string
          effective_from?: string | null
          effective_to?: string | null
          exam_body?: string | null
          examination_catalogue_id?: string | null
          id?: string
          is_active?: boolean
          is_compulsory?: boolean
          is_examinable?: boolean
          is_official?: boolean
          official_source?: string | null
          programme: Database["public"]["Enums"]["subject_programme"]
          school_selectable?: boolean
          short_name: string
          subject_category?: string | null
          subject_code?: string | null
          subject_level?: Database["public"]["Enums"]["subject_level"] | null
          subject_name: string
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["reference_verification_status"]
        }
        Update: {
          catalogue_owner?: string
          catalogue_version?: string
          created_at?: string
          curriculum_version?: string | null
          default_activation?: boolean
          department_category?: string
          effective_from?: string | null
          effective_to?: string | null
          exam_body?: string | null
          examination_catalogue_id?: string | null
          id?: string
          is_active?: boolean
          is_compulsory?: boolean
          is_examinable?: boolean
          is_official?: boolean
          official_source?: string | null
          programme?: Database["public"]["Enums"]["subject_programme"]
          school_selectable?: boolean
          short_name?: string
          subject_category?: string | null
          subject_code?: string | null
          subject_level?: Database["public"]["Enums"]["subject_level"] | null
          subject_name?: string
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["reference_verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "system_subjects_examination_catalogue_id_fkey"
            columns: ["examination_catalogue_id"]
            isOneToOne: false
            referencedRelation: "examination_catalogues"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_allocations: {
        Row: {
          academic_year_id: string
          class_subject_offering_id: string
          created_at: string
          id: string
          school_id: string
          status: Database["public"]["Enums"]["offering_status"]
          stream_id: string | null
          teacher_id: string
          term_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          class_subject_offering_id: string
          created_at?: string
          id?: string
          school_id: string
          status?: Database["public"]["Enums"]["offering_status"]
          stream_id?: string | null
          teacher_id: string
          term_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          class_subject_offering_id?: string
          created_at?: string
          id?: string
          school_id?: string
          status?: Database["public"]["Enums"]["offering_status"]
          stream_id?: string | null
          teacher_id?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_allocation_offering_fk"
            columns: ["class_subject_offering_id", "school_id"]
            isOneToOne: false
            referencedRelation: "class_subject_offerings"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "teacher_allocation_stream_fk"
            columns: ["stream_id", "school_id"]
            isOneToOne: false
            referencedRelation: "class_streams"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "teacher_allocations_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_allocations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_allocations_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_allocations_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          academic_year_id: string
          created_at: string
          ends_on: string
          id: string
          lifecycle_status: Database["public"]["Enums"]["term_lifecycle_status"]
          name: string
          school_id: string
          starts_on: string
          term_number: number
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          ends_on: string
          id?: string
          lifecycle_status?: Database["public"]["Enums"]["term_lifecycle_status"]
          name: string
          school_id: string
          starts_on: string
          term_number: number
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          ends_on?: string
          id?: string
          lifecycle_status?: Database["public"]["Enums"]["term_lifecycle_status"]
          name?: string
          school_id?: string
          starts_on?: string
          term_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          class_ids: string[] | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          school_code: string | null
          subject_codes: string[] | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          class_ids?: string[] | null
          created_at?: string | null
          email: string
          full_name?: string
          id: string
          is_active?: boolean | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          school_code?: string | null
          subject_codes?: string[] | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          class_ids?: string[] | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          school_code?: string | null
          subject_codes?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          auth_user_id: string | null
          created_at: string
          department: string | null
          email: string
          first_name: string | null
          full_name: string
          id: string
          is_active: boolean
          last_name: string | null
          middle_name: string | null
          signature_url: string | null
          staff_number: string | null
          teacher_initials: string | null
          telephone: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          department?: string | null
          email: string
          first_name?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          last_name?: string | null
          middle_name?: string | null
          signature_url?: string | null
          staff_number?: string | null
          teacher_initials?: string | null
          telephone?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          department?: string | null
          email?: string
          first_name?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          last_name?: string | null
          middle_name?: string | null
          signature_url?: string | null
          staff_number?: string | null
          teacher_initials?: string | null
          telephone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      verified_payment_transactions: {
        Row: {
          amount: number
          claim_id: string | null
          created_at: string
          currency: string
          id: string
          idempotency_key: string
          invoice_id: string
          provider: Database["public"]["Enums"]["payment_provider_code"]
          provider_transaction_reference: string
          provider_verified_at: string | null
          reversal_of: string | null
          school_id: string
          status: Database["public"]["Enums"]["payment_processing_status"]
          verified_at: string
          verified_by: string | null
        }
        Insert: {
          amount: number
          claim_id?: string | null
          created_at?: string
          currency: string
          id?: string
          idempotency_key: string
          invoice_id: string
          provider: Database["public"]["Enums"]["payment_provider_code"]
          provider_transaction_reference: string
          provider_verified_at?: string | null
          reversal_of?: string | null
          school_id: string
          status: Database["public"]["Enums"]["payment_processing_status"]
          verified_at: string
          verified_by?: string | null
        }
        Update: {
          amount?: number
          claim_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string
          invoice_id?: string
          provider?: Database["public"]["Enums"]["payment_provider_code"]
          provider_transaction_reference?: string
          provider_verified_at?: string | null
          reversal_of?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["payment_processing_status"]
          verified_at?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verified_payment_transactions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "merchant_payment_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_payment_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_payment_transactions_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "verified_payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_payment_transactions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_payment_transactions_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_school_admin_invitation: {
        Args: {
          p_auth_user_id: string
          p_confirmed_phone: string
          p_invitation_id: string
          p_privacy_version: string
          p_terms_version: string
        }
        Returns: string
      }
      create_school_internal_subject: {
        Args: {
          p_academic_year_id: string
          p_code: string
          p_learning_area: string
          p_name: string
          p_programme: Database["public"]["Enums"]["subject_programme"]
          p_school_id: string
        }
        Returns: string
      }
      has_active_school_membership: { Args: never; Returns: boolean }
      is_active_school_member: {
        Args: { target_school_id: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_from_auth: { Args: never; Returns: boolean }
      is_admin_or_bursar: { Args: never; Returns: boolean }
      is_platform_administrator: { Args: never; Returns: boolean }
      is_school_admin_for: {
        Args: { target_school_id: string }
        Returns: boolean
      }
      log_audit_event: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_new_value?: Json
          p_old_value?: Json
          p_user_id: string
          p_user_name: string
          p_user_role: string
        }
        Returns: string
      }
      normalized_subject_name: { Args: { value: string }; Returns: string }
      provision_registered_school: {
        Args: {
          p_actor_auth_user_id: string
          p_address: string
          p_admin_auth_user_id: string
          p_admin_email: string
          p_admin_name: string
          p_admin_phone: string
          p_admin_username: string
          p_billing_cadence: string
          p_district: string
          p_emis_number: string
          p_internal_notes: string
          p_invitation_expires_at: string
          p_plan_code: string
          p_requires_mfa?: boolean
          p_school_code: string
          p_school_email: string
          p_school_level: string
          p_school_name: string
          p_school_phone: string
          p_school_type: string
          p_subscription_start: string
          p_token_hash: string
          p_trial_days: number
        }
        Returns: Json
      }
      seed_school_setup_checklist: {
        Args: { target_school_id: string }
        Returns: undefined
      }
      get_school_subject_settings: {
        Args: { p_school_id: string; p_academic_year_id: string }
        Returns: Json
      }
      set_school_catalogue_subject_status: {
        Args: {
          p_academic_year_id: string
          p_active: boolean
          p_reason: string
          p_school_id: string
          p_system_subject_id: string
        }
        Returns: string
      }
    }
    Enums: {
      a_level_assignment_status: "ACTIVE" | "ENDED"
      a_level_subject_role:
        | "PRINCIPAL"
        | "SUBSIDIARY"
        | "GENERAL_PAPER"
        | "COMPULSORY"
      academic_year_status: "DRAFT" | "ACTIVE" | "CLOSED"
      cbc_level:
        | "Exceeding"
        | "Meeting"
        | "Outstanding"
        | "Approaching"
        | "Below"
      data_exchange_direction: "IMPORT" | "EXPORT" | "TEMPLATE"
      data_exchange_policy_state: "ALLOWED" | "DISABLED" | "APPROVAL_REQUIRED"
      data_exchange_scope:
        | "OWN"
        | "ASSIGNMENT"
        | "CLASS"
        | "DEPARTMENT"
        | "SCHOOL"
      delivery_lifecycle_status:
        | "QUEUED"
        | "SENDING"
        | "SENT"
        | "DELIVERED"
        | "FAILED"
        | "BOUNCED"
      gender_type: "Male" | "Female"
      invoice_lifecycle_status:
        | "DRAFT"
        | "ISSUED"
        | "PENDING"
        | "PAID"
        | "OVERDUE"
        | "CANCELLED"
        | "WAIVED"
      mark_state: "PRESENT" | "MISSING" | "ABSENT" | "EXEMPT"
      membership_status: "ACTIVE" | "INACTIVE" | "SUSPENDED"
      notification_channel: "sms" | "email" | "both"
      offering_status: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED"
      payment_method: "mtn_momo" | "airtel_money" | "cash" | "bank"
      payment_processing_status:
        | "PENDING"
        | "AWAITING_PAYMENT"
        | "AWAITING_VERIFICATION"
        | "PROCESSING"
        | "VERIFIED"
        | "PAID"
        | "FAILED"
        | "REJECTED"
        | "CANCELLED"
        | "EXPIRED"
        | "REVERSED"
        | "REFUNDED"
        | "REQUIRES_REVIEW"
      payment_provider_code: "MTN_MOMOPAY" | "AIRTEL_MONEY_MERCHANT"
      payment_status: "allocated" | "unallocated" | "failed" | "pending"
      reference_verification_status:
        | "VERIFIED"
        | "PENDING_VERIFICATION"
        | "RETIRED"
      report_comment_confidence:
        | "SUFFICIENT_EVIDENCE"
        | "LIMITED_EVIDENCE"
        | "INCOMPLETE_EVIDENCE"
      report_comment_role:
        | "SUBJECT_TEACHER"
        | "CLASS_TEACHER"
        | "HOD"
        | "DOS"
        | "HEAD_TEACHER"
        | "CUSTOM_REPORT_ROLE"
      report_comment_status:
        | "NOT_GENERATED"
        | "GENERATED"
        | "REVIEWED"
        | "EDITED"
        | "APPROVED"
        | "PUBLISHED"
        | "REQUIRES_ATTENTION"
      subject_component_type:
        | "THEORY"
        | "PRACTICAL"
        | "ORAL"
        | "AURAL"
        | "COURSEWORK"
        | "PROJECT"
        | "STUDIO"
        | "PERFORMANCE"
        | "ICT_PRACTICAL"
        | "OTHER"
      subject_level:
        | "ORDINARY"
        | "PRINCIPAL"
        | "SUBSIDIARY"
        | "GENERAL_PAPER"
        | "OTHER"
      subject_programme: "O_LEVEL" | "A_LEVEL"
      sync_conflict_status: "pending" | "resolved" | "ignored"
      sync_item_type: "mark" | "attendance" | "student"
      sync_status: "synced" | "pending" | "offline"
      term_lifecycle_status:
        | "DRAFT"
        | "OPEN"
        | "MARKS_OPEN"
        | "REVIEW"
        | "LOCKED"
        | "PUBLISHED"
        | "CLOSED"
      term_status: "open" | "locked" | "closed"
      user_role: "admin" | "teacher" | "bursar" | "student" | "parent"
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
    Enums: {
      a_level_assignment_status: ["ACTIVE", "ENDED"],
      a_level_subject_role: [
        "PRINCIPAL",
        "SUBSIDIARY",
        "GENERAL_PAPER",
        "COMPULSORY",
      ],
      academic_year_status: ["DRAFT", "ACTIVE", "CLOSED"],
      cbc_level: [
        "Exceeding",
        "Meeting",
        "Outstanding",
        "Approaching",
        "Below",
      ],
      data_exchange_direction: ["IMPORT", "EXPORT", "TEMPLATE"],
      data_exchange_policy_state: ["ALLOWED", "DISABLED", "APPROVAL_REQUIRED"],
      data_exchange_scope: [
        "OWN",
        "ASSIGNMENT",
        "CLASS",
        "DEPARTMENT",
        "SCHOOL",
      ],
      delivery_lifecycle_status: [
        "QUEUED",
        "SENDING",
        "SENT",
        "DELIVERED",
        "FAILED",
        "BOUNCED",
      ],
      gender_type: ["Male", "Female"],
      invoice_lifecycle_status: [
        "DRAFT",
        "ISSUED",
        "PENDING",
        "PAID",
        "OVERDUE",
        "CANCELLED",
        "WAIVED",
      ],
      mark_state: ["PRESENT", "MISSING", "ABSENT", "EXEMPT"],
      membership_status: ["ACTIVE", "INACTIVE", "SUSPENDED"],
      notification_channel: ["sms", "email", "both"],
      offering_status: ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"],
      payment_method: ["mtn_momo", "airtel_money", "cash", "bank"],
      payment_processing_status: [
        "PENDING",
        "AWAITING_PAYMENT",
        "AWAITING_VERIFICATION",
        "PROCESSING",
        "VERIFIED",
        "PAID",
        "FAILED",
        "REJECTED",
        "CANCELLED",
        "EXPIRED",
        "REVERSED",
        "REFUNDED",
        "REQUIRES_REVIEW",
      ],
      payment_provider_code: ["MTN_MOMOPAY", "AIRTEL_MONEY_MERCHANT"],
      payment_status: ["allocated", "unallocated", "failed", "pending"],
      reference_verification_status: [
        "VERIFIED",
        "PENDING_VERIFICATION",
        "RETIRED",
      ],
      report_comment_confidence: [
        "SUFFICIENT_EVIDENCE",
        "LIMITED_EVIDENCE",
        "INCOMPLETE_EVIDENCE",
      ],
      report_comment_role: [
        "SUBJECT_TEACHER",
        "CLASS_TEACHER",
        "HOD",
        "DOS",
        "HEAD_TEACHER",
        "CUSTOM_REPORT_ROLE",
      ],
      report_comment_status: [
        "NOT_GENERATED",
        "GENERATED",
        "REVIEWED",
        "EDITED",
        "APPROVED",
        "PUBLISHED",
        "REQUIRES_ATTENTION",
      ],
      subject_component_type: [
        "THEORY",
        "PRACTICAL",
        "ORAL",
        "AURAL",
        "COURSEWORK",
        "PROJECT",
        "STUDIO",
        "PERFORMANCE",
        "ICT_PRACTICAL",
        "OTHER",
      ],
      subject_level: [
        "ORDINARY",
        "PRINCIPAL",
        "SUBSIDIARY",
        "GENERAL_PAPER",
        "OTHER",
      ],
      subject_programme: ["O_LEVEL", "A_LEVEL"],
      sync_conflict_status: ["pending", "resolved", "ignored"],
      sync_item_type: ["mark", "attendance", "student"],
      sync_status: ["synced", "pending", "offline"],
      term_lifecycle_status: [
        "DRAFT",
        "OPEN",
        "MARKS_OPEN",
        "REVIEW",
        "LOCKED",
        "PUBLISHED",
        "CLOSED",
      ],
      term_status: ["open", "locked", "closed"],
      user_role: ["admin", "teacher", "bursar", "student", "parent"],
    },
  },
} as const

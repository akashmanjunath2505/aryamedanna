/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { createClient, Session, User, AuthError } from '@supabase/supabase-js';
import { TrainingPhase } from './geminiService';

// --- DATABASE SCHEMA (DEFINED FIRST FOR TYPE RESOLUTION) ---
export type Database = {
  public: {
    Tables: {
      documents: {
        Row: {
          id: number;
          file_name: string | null;
          created_at: string;
          user_id: string;
          status: "QUEUED" | "PROCESSING" | "INDEXED" | "ERROR";
          processing_error: string | null;
        };
        Insert: {
          file_name?: string | null;
          user_id: string;
          status?: "QUEUED" | "PROCESSING" | "INDEXED" | "ERROR";
        };
        Update: {
          status?: "QUEUED" | "PROCESSING" | "INDEXED" | "ERROR";
          processing_error?: string | null;
        };
        // FIX: Add missing Relationships property for schema consistency.
        Relationships: []
      };
      document_chunks: {
        Row: {
            id: number;
            document_id: number;
            content: string | null;
            embedding: any; // vector type
            metadata: any; // jsonb type
        };
        // FIX: Replaced empty Insert type with a proper definition.
        Insert: {
          content?: string | null
          document_id: number
          embedding?: any
          id?: number
          metadata?: any
        }
        // FIX: Replaced empty Update type with a proper definition.
        Update: {
          content?: string | null
          document_id?: number
          embedding?: any
          id?: number
          metadata?: any
        }
        // FIX: Add missing Relationships property for schema consistency.
        Relationships: []
      };
      notifications: {
        Row: {
          created_at: string
          id: number
          is_read: boolean
          link: string | null
          message: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          is_read?: boolean
          link?: string | null
          message: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          is_read?: boolean
          link?: string | null
          message?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          email: string
          full_name?: string | null
          id: string
        }
        Update: {
          email?: string
          full_name?: string | null
        }
        Relationships: []
      }
    }
    Views: {}
    Functions: {
        match_document_chunks: {
            Args: {
                query_embedding: any; // vector
                match_threshold: number;
                match_count: number;
            };
            Returns: {
                id: number;
                document_id: number;
                content: string;
                similarity: number;
            }[];
        };
    }
    Enums: {
      notification_type: "achievement" | "reminder" | "new_feature" | "system_message";
      document_status: "QUEUED" | "PROCESSING" | "INDEXED" | "ERROR";
    }
    CompositeTypes: {}
  }
};

export type NotificationType = Database["public"]["Enums"]["notification_type"];
export type Document = Database['public']['Tables']['documents']['Row'];

// --- SUPABASE CLIENT INITIALIZATION ---
const supabaseUrl = 'https://uianlejvqqjkyjetmieg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpYW5sZWp2cXFqa3lqZXRtaWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyMjQ0NjcsImV4cCI6MjA2OTgwMDQ2N30.er1YtxPovCJFDp0qyjBbuNCo9wyjCS5tokNnne6k8h8';

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL and Anon Key not found. Please ensure SUPABASE_URL and SUPABASE_ANON_KEY environment variables are set.");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// --- TYPE DEFINITIONS ---
// type TrainingPhase is imported from geminiService

// The Profile type extends the database row to include `training_phase` from auth metadata.
export type Profile = Database['public']['Tables']['profiles']['Row'] & {
  training_phase: TrainingPhase | null;
};

// The Notification type is derived from the database schema for type safety.
export type Notification = Database['public']['Tables']['notifications']['Row'];


// --- AUTHENTICATION FUNCTIONS ---
export const signUp = async ({ email, password, fullName }: { email: string, password: string, fullName: string }) => {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName,
            },
            emailRedirectTo: 'https://medannaweb.aivanahealth.com/auth/callback',
        },
    });
    if (error) throw error;
    return data;
};

export const signIn = async ({ email, password }: { email: string, password: string }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
};

export const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
};

// --- USER DATA FUNCTIONS ---
export const getUserProfile = async (userId: string): Promise<Database['public']['Tables']['profiles']['Row'] | null> => {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', userId)
        .single();
    if (error) {
        console.error('Error fetching profile:', error.message);
        return null;
    }
    return data;
};

export const updateUserProfile = async (userId: string, updates: Database['public']['Tables']['profiles']['Update']): Promise<Profile | null> => {
    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select('id, full_name, email')
        .single();

    if (error) {
        console.error('Error updating profile:', error.message);
        throw error;
    };
    if (!data) return null;


    // We need to return a full profile, so we get the training_phase from auth metadata
    const { data: { session } } = await supabase.auth.getSession();
    const training_phase = session?.user?.user_metadata?.training_phase ?? null;
    
    return { ...data, training_phase: training_phase as TrainingPhase | null };
};

// --- NOTIFICATION FUNCTIONS ---
export const getNotifications = async (userId: string): Promise<Notification[]> => {
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('Error fetching notifications:', error.message);
        return [];
    }

    return data || [];
};

export const markNotificationAsRead = async (notificationId: number, userId: string): Promise<boolean> => {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', userId);

    if (error) {
        console.error('Error marking notification as read:', error.message);
        return false;
    }
    return true;
};

export const markAllNotificationsAsRead = async (userId: string): Promise<boolean> => {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);

    if (error) {
        console.error('Error marking all notifications as read:', error.message);
        return false;
    }
    return true;
};

// --- KNOWLEDGE BASE (RAG) FUNCTIONS ---
const KNOWLEDGE_BASE_BUCKET = 'knowledge_base_documents';

export const uploadDocument = async (file: File, user: User) => {
    const filePath = `${user.id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
        .from(KNOWLEDGE_BASE_BUCKET)
        .upload(filePath, file);

    if (uploadError) {
        console.error('Error uploading document to storage:', uploadError);
        throw uploadError;
    }

    // This insert will trigger the backend processing via a database trigger or edge function
    const { error: insertError } = await supabase
        .from('documents')
        .insert({ user_id: user.id, file_name: file.name, status: 'QUEUED' });

    if (insertError) {
        console.error('Error creating document record:', insertError);
        // Attempt to clean up the orphaned file in storage
        await supabase.storage.from(KNOWLEDGE_BASE_BUCKET).remove([filePath]);
        throw insertError;
    }
};

export const getDocuments = async (userId: string): Promise<Document[]> => {
    const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching documents:', error);
        throw error;
    }
    return data || [];
};

export const deleteDocument = async (doc: Document, userId: string) => {
    const filePath = `${userId}/${doc.file_name}`; // NOTE: This reconstruction assumes the filename hasn't changed. A more robust system might store the full path.

    // 1. Delete from storage
    const { error: storageError } = await supabase.storage
        .from(KNOWLEDGE_BASE_BUCKET)
        .remove([filePath]);
    if (storageError) {
        console.error("Error deleting file from storage:", storageError.message);
        // Decide if you want to proceed with DB deletion or stop. For now, we'll proceed.
    }
    
    // 2. Delete from database (cascade will handle chunks)
    const { error: dbError } = await supabase
        .from('documents')
        .delete()
        .eq('id', doc.id)
        .eq('user_id', userId);

    if (dbError) {
        console.error("Error deleting document record from database:", dbError.message);
        throw dbError;
    }
};

export const subscribeToDocumentChanges = (handleChanges: (payload: any) => void) => {
    const subscription = supabase.channel('documents-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, (payload) => {
        handleChanges(payload);
      })
      .subscribe();
      
    return subscription;
};

export const matchDocumentChunks = async (embedding: number[]) => {
    const { data, error } = await supabase.rpc('match_document_chunks', {
        query_embedding: embedding,
        match_threshold: 0.7, // Adjust as needed
        match_count: 5 // Return top 5 most relevant chunks
    });

    if (error) {
        console.error('Error matching document chunks:', error);
        throw error;
    }
    return data;
};

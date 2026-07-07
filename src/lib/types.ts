export type ItemStatus = 'Pending' | 'Purchasing' | 'Issuing Item';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  line_user_id: string | null;
  link_code: string | null;
  link_code_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: ItemStatus;
  image_url: string | null;
  reminder_date: string | null; // ISO string
  po_date: string | null; // YYYY-MM-DD
  credit_term: 30 | 60 | 90 | null;
  budget_due_date: string | null; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          line_user_id?: string | null;
          link_code?: string | null;
          link_code_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          line_user_id?: string | null;
          link_code?: string | null;
          link_code_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      items: {
        Row: Item;
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          status?: ItemStatus;
          image_url?: string | null;
          reminder_date?: string | null;
          po_date?: string | null;
          credit_term?: 30 | 60 | 90 | null;
          budget_due_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          status?: ItemStatus;
          image_url?: string | null;
          reminder_date?: string | null;
          po_date?: string | null;
          credit_term?: 30 | 60 | 90 | null;
          budget_due_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

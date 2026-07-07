-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- PROFILES TABLE (Linked to auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  display_name text,
  line_user_id text unique,
  link_code text unique,
  link_code_expires_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ITEMS TABLE
create table public.items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  description text,
  status text default 'Pending' not null,
  image_url text,
  reminder_date timestamptz,
  po_date date,
  credit_term integer check (credit_term in (30, 60, 90)),
  budget_due_date date,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  
  constraint status_check check (status in ('Pending', 'Purchasing', 'Issuing Item'))
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.items enable row level security;

-- PROFILES RLS Policies
create policy "Users can view their own profile" 
  on public.profiles for select 
  using (auth.uid() = id);

create policy "Users can update their own profile" 
  on public.profiles for update 
  using (auth.uid() = id);

-- ITEMS RLS Policies
create policy "Users can view their own items" 
  on public.items for select 
  using (auth.uid() = user_id);

create policy "Users can insert their own items" 
  on public.items for insert 
  with check (auth.uid() = user_id);

create policy "Users can update their own items" 
  on public.items for update 
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own items" 
  on public.items for delete 
  using (auth.uid() = user_id);

-- TRIGGER for creating profile on auth user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'User')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

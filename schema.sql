-- Run this once in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- Food items table
CREATE TABLE IF NOT EXISTS food_items (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT '其他',
  quantity      TEXT DEFAULT '',
  price         NUMERIC(10,2) DEFAULT 0,
  purchase_date DATE DEFAULT CURRENT_DATE,
  expiry_date   DATE,
  status        TEXT DEFAULT 'fresh' CHECK (status IN ('fresh', 'soon', 'expired')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase history table
CREATE TABLE IF NOT EXISTS purchase_history (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT '其他',
  date       DATE DEFAULT CURRENT_DATE,
  price      NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS for single-user personal use (anon key has full access)
ALTER TABLE food_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_history DISABLE ROW LEVEL SECURITY;

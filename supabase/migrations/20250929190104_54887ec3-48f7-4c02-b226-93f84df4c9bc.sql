-- Create a test table with 2 random columns
CREATE TABLE public.test_table (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  test_column_1 TEXT,
  test_column_2 INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.test_table ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own test data"
ON public.test_table
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own test data"
ON public.test_table
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own test data"
ON public.test_table
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own test data"
ON public.test_table
FOR DELETE
USING (auth.uid() = user_id);
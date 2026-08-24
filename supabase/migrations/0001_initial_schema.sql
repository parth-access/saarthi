-- ==============================================================================
-- SAARTHI PSYCHOLOGY CONSULTANCY
-- Migration: 0001_initial_schema.sql
-- Purpose: Initial PostgreSQL Relational Schema & Row-Level Security (RLS)
-- Phase: 1B Database Schema Foundation
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 2. CUSTOM ENUMS & TYPES
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('client', 'therapist', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE booking_status AS ENUM (
        'pending',
        'pending_approval',
        'awaiting_payment',
        'pending_payment',
        'confirmed',
        'rejected',
        'cancelled',
        'completed',
        'draft',
        'locked',
        'slot_locked',
        'payment_initiated',
        'payment_started',
        'rescheduled',
        'expired',
        'no_show'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM (
        'unpaid',
        'pending',
        'initiated',
        'paid',
        'success',
        'failed',
        'refunded'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE calendar_status AS ENUM (
        'PENDING',
        'CREATED',
        'FAILED',
        'RETRY_REQUIRED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE reminder_status AS ENUM (
        'PENDING',
        'SENT',
        'FAILED',
        'SKIPPED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE email_delivery_status AS ENUM (
        'pending',
        'sent',
        'failed',
        'retrying'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE override_type AS ENUM (
        'blocked',
        'available'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE outbox_status AS ENUM (
        'pending',
        'processing',
        'processed',
        'failed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE outbox_aggregate_type AS ENUM (
        'booking',
        'payment'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. COMMON TRIGGER FUNCTION FOR UPDATED_AT
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 4. APPLICATION USERS / PROFILES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    role user_role NOT NULL DEFAULT 'client',
    bio TEXT,
    notifications BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

CREATE OR REPLACE TRIGGER trigger_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================================
-- 5. THERAPISTS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.therapists (
    id TEXT PRIMARY KEY,
    auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT,
    specialization TEXT NOT NULL DEFAULT '',
    experience TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    hourly_rate NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (hourly_rate >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_therapists_auth_id ON public.therapists(auth_id);
CREATE INDEX IF NOT EXISTS idx_therapists_is_active ON public.therapists(is_active);

CREATE OR REPLACE TRIGGER trigger_therapists_updated_at
BEFORE UPDATE ON public.therapists
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================================
-- 6. THERAPIST AVAILABILITY RULES (RECURRING SCHEDULE)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.therapist_availability_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id TEXT NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    is_active BOOLEAN NOT NULL DEFAULT true,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_duration INTEGER NOT NULL DEFAULT 60 CHECK (slot_duration > 0),
    cooldown_gap INTEGER NOT NULL DEFAULT 0 CHECK (cooldown_gap >= 0),
    breaks JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_valid_time_range CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_availability_rules_therapist_day ON public.therapist_availability_rules(therapist_id, day_of_week);

CREATE OR REPLACE TRIGGER trigger_availability_rules_updated_at
BEFORE UPDATE ON public.therapist_availability_rules
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================================
-- 7. THERAPIST AVAILABILITY OVERRIDES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.therapist_availability_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id TEXT NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    type override_type NOT NULL DEFAULT 'blocked',
    start_time TIME,
    end_time TIME,
    slot_duration INTEGER CHECK (slot_duration IS NULL OR slot_duration > 0),
    cooldown_gap INTEGER CHECK (cooldown_gap IS NULL OR cooldown_gap >= 0),
    breaks JSONB DEFAULT '[]'::jsonb,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_override_time_range CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_availability_overrides_therapist_date ON public.therapist_availability_overrides(therapist_id, date);

CREATE OR REPLACE TRIGGER trigger_availability_overrides_updated_at
BEFORE UPDATE ON public.therapist_availability_overrides
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================================
-- 8. LOCKED SLOTS (ATOMIC HOLD ENGINE)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.locked_slots (
    id TEXT PRIMARY KEY, -- Format: ${therapist_id}_${date}_${time}
    therapist_id TEXT NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    time TIME NOT NULL,
    user_id TEXT,
    lock_id TEXT NOT NULL,
    booking_id TEXT,
    is_permanent BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_therapist_slot UNIQUE (therapist_id, date, time)
);

CREATE INDEX IF NOT EXISTS idx_locked_slots_lookup ON public.locked_slots(therapist_id, date, time);
CREATE INDEX IF NOT EXISTS idx_locked_slots_expires_at ON public.locked_slots(expires_at);
CREATE INDEX IF NOT EXISTS idx_locked_slots_lock_id ON public.locked_slots(lock_id);

CREATE OR REPLACE TRIGGER trigger_locked_slots_updated_at
BEFORE UPDATE ON public.locked_slots
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================================
-- 9. BOOKINGS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.bookings (
    id TEXT PRIMARY KEY,
    therapist_id TEXT NOT NULL REFERENCES public.therapists(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    gender TEXT NOT NULL DEFAULT 'unspecified',
    age INTEGER CHECK (age IS NULL OR (age > 0 AND age < 150)),
    date DATE NOT NULL,
    time TIME NOT NULL,
    utc_date_time TIMESTAMPTZ,
    session_type TEXT NOT NULL DEFAULT 'Individual',
    session_mode TEXT NOT NULL DEFAULT 'online',
    message TEXT DEFAULT '',
    status booking_status NOT NULL DEFAULT 'pending',
    payment_status payment_status NOT NULL DEFAULT 'pending',
    payment_amount NUMERIC(10, 2) CHECK (payment_amount IS NULL OR payment_amount >= 0),
    payment_currency TEXT NOT NULL DEFAULT 'INR',
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    payment_id TEXT,
    booking_token TEXT UNIQUE,
    hold_expires_at TIMESTAMPTZ,
    payment_verified_at TIMESTAMPTZ,
    payment_link_sent_at TIMESTAMPTZ,
    original_date DATE,
    original_time TIME,
    rescheduled_at TIMESTAMPTZ,
    email_status email_delivery_status DEFAULT 'pending',
    email_attempts INTEGER NOT NULL DEFAULT 0,
    last_email_attempt_at TIMESTAMPTZ,
    last_email_error TEXT,
    decline_reason TEXT,
    decline_custom_note TEXT,
    declined_at TIMESTAMPTZ,
    declined_by TEXT,
    google_calendar_event_id TEXT,
    meeting_url TEXT,
    calendar_status calendar_status DEFAULT 'PENDING',
    calendar_created_at TIMESTAMPTZ,
    calendar_error TEXT,
    reminder_status reminder_status DEFAULT 'PENDING',
    reminder_scheduled_for TIMESTAMPTZ,
    reminder_sent_at TIMESTAMPTZ,
    reminder_error TEXT,
    student_reminder_sent_at TIMESTAMPTZ,
    therapist_reminder_sent_at TIMESTAMPTZ,
    review_rating INTEGER CHECK (review_rating IS NULL OR (review_rating >= 1 AND review_rating <= 5)),
    review_comment TEXT,
    reviewed_at TIMESTAMPTZ,
    review_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_therapist_date ON public.bookings(therapist_id, date);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON public.bookings(email);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON public.bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_razorpay_order_id ON public.bookings(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_token ON public.bookings(booking_token);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON public.bookings(created_at DESC);

CREATE OR REPLACE TRIGGER trigger_bookings_updated_at
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================================
-- 10. PAYMENTS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
    therapist_id TEXT NOT NULL REFERENCES public.therapists(id) ON DELETE RESTRICT,
    patient_email TEXT,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    razorpay_order_id TEXT NOT NULL,
    razorpay_payment_id TEXT,
    razorpay_signature TEXT,
    status payment_status NOT NULL DEFAULT 'pending',
    source TEXT,
    verified_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON public.payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id ON public.payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

CREATE OR REPLACE TRIGGER trigger_payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================================
-- 11. OUTBOX EVENTS (TRANSACTIONAL OUTBOX PATTERN)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.outbox_events (
    id TEXT PRIMARY KEY, -- Deterministic ID: outbox_${aggregateType}_${aggregateId}_${eventName}
    name TEXT NOT NULL,
    aggregate_type outbox_aggregate_type NOT NULL,
    aggregate_id TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status outbox_status NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    locked_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    error TEXT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_pending_claim ON public.outbox_events(status, next_attempt_at)
WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_outbox_events_aggregate ON public.outbox_events(aggregate_type, aggregate_id);

CREATE OR REPLACE TRIGGER trigger_outbox_events_updated_at
BEFORE UPDATE ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================================
-- 12. AUDIT LOGS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    event_type TEXT NOT NULL,
    actor_id TEXT NOT NULL DEFAULT 'system',
    target_id TEXT,
    booking_id TEXT REFERENCES public.bookings(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON public.audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_booking_id ON public.audit_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ==============================================================================
-- 13. REVIEWS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.reviews (
    id TEXT PRIMARY KEY, -- Format: review_${bookingId}
    booking_id TEXT NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
    therapist_id TEXT NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    student_name TEXT,
    student_email TEXT,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT NOT NULL DEFAULT '',
    is_approved BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_therapist_id ON public.reviews(therapist_id);
CREATE INDEX IF NOT EXISTS idx_reviews_booking_id ON public.reviews(booking_id);

CREATE OR REPLACE TRIGGER trigger_reviews_updated_at
BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================================
-- 14. SESSION REMINDERS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.session_reminders (
    id TEXT PRIMARY KEY, -- Format: rem_${bookingId}_${type}
    booking_id TEXT NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    reminder_type TEXT NOT NULL DEFAULT '5h',
    scheduled_for TIMESTAMPTZ NOT NULL,
    status reminder_status NOT NULL DEFAULT 'PENDING',
    sent_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_reminders_status_scheduled ON public.session_reminders(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_session_reminders_booking_id ON public.session_reminders(booking_id);

CREATE OR REPLACE TRIGGER trigger_session_reminders_updated_at
BEFORE UPDATE ON public.session_reminders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================================
-- 15. WEBHOOK EVENTS TABLE (RAZORPAY IDEMPOTENCY LEDGER)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.webhook_events (
    id TEXT PRIMARY KEY, -- Razorpay event ID
    signature TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON public.webhook_events(status);

-- ==============================================================================
-- 16. ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locked_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- USERS POLICIES
CREATE POLICY "Users can read own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- THERAPISTS POLICIES
CREATE POLICY "Therapists are publicly viewable" ON public.therapists
    FOR SELECT USING (is_active = true OR auth.uid() = auth_id);

CREATE POLICY "Therapist can update own record" ON public.therapists
    FOR UPDATE USING (auth.uid() = auth_id)
    WITH CHECK (auth.uid() = auth_id);

-- AVAILABILITY RULES & OVERRIDES POLICIES
CREATE POLICY "Availability rules are publicly readable" ON public.therapist_availability_rules
    FOR SELECT USING (true);

CREATE POLICY "Therapist can manage own availability rules" ON public.therapist_availability_rules
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.therapists
            WHERE id = therapist_availability_rules.therapist_id AND auth_id = auth.uid()
        )
    );

CREATE POLICY "Availability overrides are publicly readable" ON public.therapist_availability_overrides
    FOR SELECT USING (true);

CREATE POLICY "Therapist can manage own availability overrides" ON public.therapist_availability_overrides
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.therapists
            WHERE id = therapist_availability_overrides.therapist_id AND auth_id = auth.uid()
        )
    );

-- LOCKED SLOTS POLICIES
CREATE POLICY "Locked slots are publicly readable for booking check" ON public.locked_slots
    FOR SELECT USING (true);

-- BOOKINGS POLICIES
CREATE POLICY "Users can read own bookings" ON public.bookings
    FOR SELECT USING (
        auth.uid() = user_id OR
        email = (SELECT email FROM auth.users WHERE id = auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.therapists
            WHERE id = bookings.therapist_id AND auth_id = auth.uid()
        )
    );

-- PAYMENTS POLICIES
CREATE POLICY "Users can read own payments" ON public.payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.bookings
            WHERE id = payments.booking_id AND (
                user_id = auth.uid() OR
                email = (SELECT email FROM auth.users WHERE id = auth.uid())
            )
        )
    );

-- REVIEWS POLICIES
CREATE POLICY "Approved reviews are publicly viewable" ON public.reviews
    FOR SELECT USING (is_approved = true OR student_id = auth.uid()::text);

CREATE POLICY "Authenticated users can submit review for their booking" ON public.reviews
    FOR INSERT WITH CHECK (
        student_id = auth.uid()::text AND
        EXISTS (
            SELECT 1 FROM public.bookings
            WHERE id = reviews.booking_id AND (user_id = auth.uid() OR email = (SELECT email FROM auth.users WHERE id = auth.uid()))
        )
    );

CREATE POLICY "Users can update own review" ON public.reviews
    FOR UPDATE USING (student_id = auth.uid()::text)
    WITH CHECK (student_id = auth.uid()::text);

-- STRICT DEFAULT DENY FOR BACKEND INFRASTRUCTURE (SERVICE ROLE BYPASSES RLS)
-- outbox_events, audit_logs, session_reminders, webhook_events have no client policies (deny all anon/auth)

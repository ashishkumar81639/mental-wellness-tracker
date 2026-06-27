-- Seed data so the demo looks alive on first load.
-- JWT auth: demo_user / demo123.
-- Idempotent: clears demo rows then reinserts.

-- Clear existing demo data (cascades through FK references).
DELETE FROM users WHERE id = 'demo_user';

INSERT INTO users (id, name, password_hash, exam_type, exam_date, persona_pref)
VALUES (
  'demo_user',
  'Aarav',
  '$2a$10$K8MqZWJKSf57r1bE0VRSuOYIiS5Helx3KPI14WGL/Q21toBtySyIS',
  'JEE',
  CURRENT_DATE + INTERVAL '21 days',
  'adaptive'
);

-- Helper: insert a journal entry + mood + analysis + triggers as one coherent day.
-- Day 1 (5 days ago): overwhelmed before a mock test.
WITH e AS (
  INSERT INTO journal_entries (user_id, body, created_at)
  VALUES ('demo_user',
    'Mock test tomorrow and I have not finished the syllabus. Everyone in my batch seems ahead of me. Could not sleep, kept thinking I will mess it up.',
    now() - INTERVAL '5 days')
  RETURNING id
), m AS (
  INSERT INTO mood_logs (user_id, entry_id, mood, energy, sleep_hrs, created_at)
  SELECT 'demo_user', e.id, 2, 2, 4.5, now() - INTERVAL '5 days' FROM e
), a AS (
  INSERT INTO ai_analysis (entry_id, emotion, intensity, summary, reframe, coping_json, safety_flag, created_at)
  SELECT e.id, 'anxiety', 5,
    'High pre-test anxiety driven by syllabus pressure and peer comparison.',
    'Being behind on syllabus is information, not a verdict. One mock does not define your rank.',
    '{"strategy":"Pick the 3 highest-weight topics and revise only those tonight.","mindfulness":"4-7-8 breathing for 4 rounds before bed.","nudge":"You showed up to prepare. That already puts you ahead of who you were yesterday."}'::jsonb,
    false,
    now() - INTERVAL '5 days'
  FROM e RETURNING id
)
INSERT INTO triggers (analysis_id, label, category, sentiment)
SELECT a.id, t.label, t.category, t.sentiment FROM a,
  (VALUES ('mock test','academic',-2), ('peer comparison','social',-2), ('sleep loss','health',-1)) AS t(label,category,sentiment);

-- Day 2 (3 days ago): mixed, slightly better after a small win.
WITH e AS (
  INSERT INTO journal_entries (user_id, body, created_at)
  VALUES ('demo_user',
    'Test went okay, not great. Solved the physics section well but blanked on organic chemistry. Parents asked about my score at dinner and I felt small.',
    now() - INTERVAL '3 days')
  RETURNING id
), m AS (
  INSERT INTO mood_logs (user_id, entry_id, mood, energy, sleep_hrs, created_at)
  SELECT 'demo_user', e.id, 3, 3, 6.0, now() - INTERVAL '3 days' FROM e
), a AS (
  INSERT INTO ai_analysis (entry_id, emotion, intensity, summary, reframe, coping_json, safety_flag, created_at)
  SELECT e.id, 'self-doubt', 3,
    'Self-worth getting tied to a single score, with family pressure amplifying it.',
    'Physics going well is real evidence you can do this. Chemistry is a fixable gap, not a character flaw.',
    '{"strategy":"Block 30 min daily for organic chemistry reactions for the next week.","mindfulness":"Name one thing the test proved you can do.","nudge":"Your worth is not a percentile. Keep going."}'::jsonb,
    false,
    now() - INTERVAL '3 days'
  FROM e RETURNING id
)
INSERT INTO triggers (analysis_id, label, category, sentiment)
SELECT a.id, t.label, t.category, t.sentiment FROM a,
  (VALUES ('organic chemistry','academic',-1), ('family expectations','family',-2), ('small win: physics','academic',2)) AS t(label,category,sentiment);

-- Day 3 (today): calmer, building a routine.
WITH e AS (
  INSERT INTO journal_entries (user_id, body, created_at)
  VALUES ('demo_user',
    'Started the chemistry plan we talked about. Did two focused sessions and felt more in control. Still nervous about the real exam but less spiralled today.',
    now() - INTERVAL '2 hours')
  RETURNING id
), m AS (
  INSERT INTO mood_logs (user_id, entry_id, mood, energy, sleep_hrs, created_at)
  SELECT 'demo_user', e.id, 4, 4, 7.0, now() - INTERVAL '2 hours' FROM e
), a AS (
  INSERT INTO ai_analysis (entry_id, emotion, intensity, summary, reframe, coping_json, safety_flag, created_at)
  SELECT e.id, 'hopeful', 2,
    'Sense of agency returning as a concrete routine replaces rumination.',
    'You converted worry into action two days running. That is the exact skill that carries you through exam day.',
    '{"strategy":"Keep the two-session rhythm and add a 10-min recap before sleep.","mindfulness":"Box breathing for 3 rounds to lock in the calm.","nudge":"Look how far you moved in 5 days. Trust the routine."}'::jsonb,
    false,
    now() - INTERVAL '2 hours'
  FROM e RETURNING id
)
INSERT INTO triggers (analysis_id, label, category, sentiment)
SELECT a.id, t.label, t.category, t.sentiment FROM a,
  (VALUES ('study routine','self',2), ('exam day','academic',-1)) AS t(label,category,sentiment);

-- A short prior chat so the companion "remembers" the student.
INSERT INTO chat_messages (user_id, role, content, created_at) VALUES
  ('demo_user', 'user', 'I keep comparing myself to my batchmates and it wrecks me.', now() - INTERVAL '4 days'),
  ('demo_user', 'assistant', 'Comparison steals the focus you need for your own prep. Their timeline is not your timeline. What is one thing you did well today, just for you?', now() - INTERVAL '4 days');

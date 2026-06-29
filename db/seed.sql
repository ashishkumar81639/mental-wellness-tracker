-- Seed data so the demo looks alive on first load.
-- JWT auth: demo_user / demo123.
-- Non-destructive: uses ON CONFLICT to skip if data already exists.

INSERT INTO users (id, name, password_hash, exam_type, exam_date, persona_pref)
VALUES (
  'demo_user',
  'Aarav',
  '$2a$10$K8MqZWJKSf57r1bE0VRSuOYIiS5Helx3KPI14WGL/Q21toBtySyIS',
  'JEE',
  CURRENT_DATE + INTERVAL '21 days',
  'adaptive'
) ON CONFLICT (id) DO NOTHING;

-- Journal entries: one per day, Wednesday through Monday, covering a full week.
-- Day 1 (Wednesday 5 days ago): overwhelmed before a mock test.
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

-- Day 2 (Thursday 4 days ago): test day, went better than expected.
WITH e AS (
  INSERT INTO journal_entries (user_id, body, created_at)
  VALUES ('demo_user',
    'The mock test happened today. Physics went well - I could actually solve the numericals. Chemistry was rough, blanked on organic again. But overall not as bad as I imagined.',
    now() - INTERVAL '4 days')
  RETURNING id
), m AS (
  INSERT INTO mood_logs (user_id, entry_id, mood, energy, sleep_hrs, created_at)
  SELECT 'demo_user', e.id, 3, 3, 6.0, now() - INTERVAL '4 days' FROM e
), a AS (
  INSERT INTO ai_analysis (entry_id, emotion, intensity, summary, reframe, coping_json, safety_flag, created_at)
  SELECT e.id, 'mixed', 3,
    'Post-test relief mixed with frustration about organic chemistry. Physics is a confidence anchor.',
    'You focused on what went wrong, but look at physics - that section went well. That is real evidence you can do this.',
    '{"strategy":"Spend 20 minutes reviewing the organic chemistry questions you got wrong. Turn each mistake into a flashcard.","mindfulness":"3 rounds of box breathing to let the test adrenaline settle.","nudge":"One bad section does not cancel out one good one. You are not a single score."}'::jsonb,
    false,
    now() - INTERVAL '4 days'
  FROM e RETURNING id
)
INSERT INTO triggers (analysis_id, label, category, sentiment)
SELECT a.id, t.label, t.category, t.sentiment FROM a,
  (VALUES ('mock test result','academic',-1), ('physics win','academic',2), ('organic chemistry','academic',-2)) AS t(label,category,sentiment);

-- Day 3 (Friday 3 days ago): post-test reflection, family pressure.
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

-- Day 4 (Saturday 2 days ago): guilt about taking a break.
WITH e AS (
  INSERT INTO journal_entries (user_id, body, created_at)
  VALUES ('demo_user',
    'Took the day off from studying. Watched a movie with my sister. It felt nice in the moment but now I feel like I wasted a whole day. Everyone else was probably studying.',
    now() - INTERVAL '2 days')
  RETURNING id
), m AS (
  INSERT INTO mood_logs (user_id, entry_id, mood, energy, sleep_hrs, created_at)
  SELECT 'demo_user', e.id, 3, 3, 8.0, now() - INTERVAL '2 days' FROM e
), a AS (
  INSERT INTO ai_analysis (entry_id, emotion, intensity, summary, reframe, coping_json, safety_flag, created_at)
  SELECT e.id, 'guilt', 3,
    'Rest guilt after taking a needed break, amplified by comparison habits.',
    'Rest is part of prep, not a distraction from it. Your brain consolidates learning during downtime. One day off a week is how you avoid burnout.',
    '{"strategy":"Schedule one guilt-free rest day every week so it feels intentional, not accidental.","mindfulness":"Notice the guilt without judging it. Let it pass like a cloud.","nudge":"Rest is not wasted time. It is invested time that pays back in focus."}'::jsonb,
    false,
    now() - INTERVAL '2 days'
  FROM e RETURNING id
)
INSERT INTO triggers (analysis_id, label, category, sentiment)
SELECT a.id, t.label, t.category, t.sentiment FROM a,
  (VALUES ('taking a break','self',1), ('peer comparison','social',-2), ('guilt','emotional',-2)) AS t(label,category,sentiment);

-- Day 5 (Sunday 1 day ago): back to studying, feeling recharged.
WITH e AS (
  INSERT INTO journal_entries (user_id, body, created_at)
  VALUES ('demo_user',
    'Got back to studying today after yesterday''s break. The rest actually helped - I could focus better. Covered three chapters of inorganic chemistry. Made notes for coordination compounds. Starting to feel like I have a system.',
    now() - INTERVAL '1 day')
  RETURNING id
), m AS (
  INSERT INTO mood_logs (user_id, entry_id, mood, energy, sleep_hrs, created_at)
  SELECT 'demo_user', e.id, 4, 4, 7.5, now() - INTERVAL '1 day' FROM e
), a AS (
  INSERT INTO ai_analysis (entry_id, emotion, intensity, summary, reframe, coping_json, safety_flag, created_at)
  SELECT e.id, 'motivated', 2,
    'Productive day after rest - clear evidence that breaks fuel focus rather than derail it.',
    'You came back sharper after a rest day. That is not luck - that is how brains work. Rest is a study strategy, not a weakness.',
    '{"strategy":"Keep the post-rest momentum: start tomorrow with the hardest topic first while your mind is fresh.","mindfulness":"Take 2 minutes to appreciate the three chapters you covered today. Write them down.","nudge":"A system beats motivation every time. And you are building one."}'::jsonb,
    false,
    now() - INTERVAL '1 day'
  FROM e RETURNING id
)
INSERT INTO triggers (analysis_id, label, category, sentiment)
SELECT a.id, t.label, t.category, t.sentiment FROM a,
  (VALUES ('study routine','self',2), ('inorganic chemistry','academic',1), ('focus','self',2)) AS t(label,category,sentiment);

-- Day 6 (today): calmer, building a routine.
INSERT INTO journal_entries (user_id, body, created_at)
SELECT 'demo_user',
  'Started the chemistry plan we talked about. Did two focused sessions and felt more in control. Still nervous about the real exam but less spiralled today.',
  now() - INTERVAL '2 hours'
WHERE NOT EXISTS (
  SELECT 1 FROM journal_entries
  WHERE user_id = 'demo_user' AND body LIKE 'Started the chemistry plan%'
    AND created_at > now() - INTERVAL '3 hours'
);

WITH e AS (
  SELECT id FROM journal_entries
  WHERE user_id = 'demo_user' AND body LIKE 'Started the chemistry plan%'
    AND created_at > now() - INTERVAL '3 hours'
  ORDER BY created_at DESC LIMIT 1
)
INSERT INTO mood_logs (user_id, entry_id, mood, energy, sleep_hrs, created_at)
SELECT 'demo_user', e.id, 4, 4, 7.0, now() - INTERVAL '2 hours'
FROM e
WHERE NOT EXISTS (
  SELECT 1 FROM mood_logs WHERE entry_id = e.id
);

WITH e AS (
  SELECT id FROM journal_entries
  WHERE user_id = 'demo_user' AND body LIKE 'Started the chemistry plan%'
    AND created_at > now() - INTERVAL '3 hours'
  ORDER BY created_at DESC LIMIT 1
)
INSERT INTO ai_analysis (entry_id, emotion, intensity, summary, reframe, coping_json, safety_flag, created_at)
SELECT e.id, 'hopeful', 2,
  'Sense of agency returning as a concrete routine replaces rumination.',
  'You converted worry into action two days running. That is the exact skill that carries you through exam day.',
  '{"strategy":"Keep the two-session rhythm and add a 10-min recap before sleep.","mindfulness":"Box breathing for 3 rounds to lock in the calm.","nudge":"Look how far you moved in 5 days. Trust the routine."}'::jsonb,
  false,
  now() - INTERVAL '2 hours'
FROM e
WHERE NOT EXISTS (
  SELECT 1 FROM ai_analysis WHERE entry_id = e.id
);

WITH e AS (
  SELECT id FROM journal_entries
  WHERE user_id = 'demo_user' AND body LIKE 'Started the chemistry plan%'
    AND created_at > now() - INTERVAL '3 hours'
  ORDER BY created_at DESC LIMIT 1
), a AS (
  SELECT id FROM ai_analysis WHERE entry_id = (SELECT id FROM e)
)
INSERT INTO triggers (analysis_id, label, category, sentiment)
SELECT a.id, t.label, t.category, t.sentiment FROM a,
  (VALUES ('study routine','self',2), ('exam day','academic',-1)) AS t(label,category,sentiment)
WHERE NOT EXISTS (
  SELECT 1 FROM triggers WHERE analysis_id = a.id
);

-- Chat history: multi-day conversation spanning Wednesday through Sunday.
INSERT INTO chat_messages (user_id, role, content, created_at) VALUES
  ('demo_user', 'user', 'I keep comparing myself to my batchmates and it wrecks me.', now() - INTERVAL '5 days'),
  ('demo_user', 'assistant', 'Comparison steals the focus you need for your own prep. Their timeline is not your timeline. What is one thing you did well today, just for you?', now() - INTERVAL '5 days'),
  ('demo_user', 'user', 'Physics went well in the mock today but I blanked on organic chemistry. I feel like an idiot.', now() - INTERVAL '4 days'),
  ('demo_user', 'assistant', 'Physics going well is real proof you can do this, beta. Organic chemistry is a fixable gap - you have 21 days to close it. What specific reaction types do you want to tackle first?', now() - INTERVAL '4 days'),
  ('demo_user', 'user', 'My parents asked about my score at dinner. I could not even look at them. They did not say anything bad but I know they are disappointed.', now() - INTERVAL '4 days'),
  ('demo_user', 'assistant', 'That silence is heavy, and I hear how much it weighs on you. Sometimes parents do not know how to say they care without it sounding like pressure. Your score is a snapshot, not your worth.', now() - INTERVAL '4 days'),
  ('demo_user', 'user', 'Yaar I took the whole day off today. Watched a movie with my sister. Now I feel guilty. Everyone else must be studying.', now() - INTERVAL '2 days'),
  ('demo_user', 'assistant', 'Rest is not cheating, beta. Your brain needs downtime to consolidate what you have learned. One guilt-free day a week prevents burnout. Did you enjoy the movie at least?', now() - INTERVAL '2 days'),
  ('demo_user', 'user', 'Actually yeah it was fun. We watched 3 Idiots and laughed a lot. Haven''t done that in months.', now() - INTERVAL '2 days'),
  ('demo_user', 'assistant', 'See? That laughter is fuel. You have been running on empty - today you filled the tank. Tomorrow you will study sharper because of it, not despite it.', now() - INTERVAL '2 days'),
  ('demo_user', 'user', 'I got back to studying today and I actually covered three chapters. The break helped. I am starting to feel like I can build a system.', now() - INTERVAL '1 day'),
  ('demo_user', 'assistant', 'Three chapters after a rest day - that is the rhythm, beta. Burnout is the real enemy, not the syllabus. Build one small win a day and watch them stack up.', now() - INTERVAL '1 day'),
  ('demo_user', 'user', 'Still nervous about the actual JEE though. 20 days feels so close.', now() - INTERVAL '1 day'),
  ('demo_user', 'assistant', '20 days is four cycles of 5-day blocks. Plenty of time to sharpen, not enough time to panic. Which topic do you want to conquer next?', now() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

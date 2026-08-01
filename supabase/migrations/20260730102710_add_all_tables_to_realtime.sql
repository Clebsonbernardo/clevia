-- Add all tables used in realtime subscriptions to the supabase_realtime publication
-- Without this, .on('postgres_changes') subscriptions never fire and the UI
-- only updates when the user manually refreshes.

ALTER PUBLICATION supabase_realtime ADD TABLE public.work_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.machines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mechanics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.preventive_plans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.production_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_order_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.branches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.monitor_screens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.push_subscriptions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.companies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.company_members;

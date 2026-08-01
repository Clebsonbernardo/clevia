-- Add ceo_grants table to the realtime publication so the useGrants hook can subscribe to changes
ALTER PUBLICATION supabase_realtime ADD TABLE ceo_grants;

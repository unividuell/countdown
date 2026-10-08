-- Every stored session holds countdown's old JDK-serialized principal, which the auth lib replaces.
-- Left in place, each would fail to deserialize and answer 500 instead of 401; this way everyone
-- signs in once more. spring_session_attributes follows through ON DELETE CASCADE.
DELETE FROM spring_session;

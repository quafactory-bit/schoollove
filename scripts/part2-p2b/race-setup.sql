-- Two fresh flows for the same never-seen Google subject (7), raced by race-runner.mjs.
SELECT set_config('request.jwt.claim.role','service_role',false);
DELETE FROM p2b_test.flows;
SELECT p2b_test.launch(true);
SELECT p2b_test.flow('raceA');
SELECT p2b_test.flow('raceB');

import { meetingHttp } from './meeting-plan-http.js';

const fixture = await meetingHttp(async () => 'pops:contacts/contact/canonical');
process.stdout.write(JSON.stringify({ origin: fixture.origin, tripId: fixture.trip.id }) + '\n');
process.once('SIGTERM', () => {
  void fixture.close().then(() => process.exit(0));
});

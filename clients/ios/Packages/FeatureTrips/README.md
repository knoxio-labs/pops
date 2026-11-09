# FeatureTrips

`TripsRootView(repository:)` contains the approved native Today and trip-navigation content. The app supplies an authenticated `TripsReading`; this package imports neither the generated client nor another feature. `BFMTripsRepository(client:)` implements that seam in BFMClient.

Trip selection is explicit and shared across the native tabs. The selected source snapshot supplies route order, source sheets, the calendar and bookings. Now uses valid active intervals; Next includes known future starts across supported record kinds in chronological order. Missing clocks or zones never acquire a midnight or UTC fallback. Ambiguous and nonexistent local clocks stay unresolved.

Visits retain the service's order. Today, Plan and Calendar exclude alternatives only through explicit group membership. Bookings and search retain every original, including alternatives; purchase never selects a journey. Booking intention, arrangement and purchase stay independent. Past bookings use explicit source end times, not audit timestamps. Source endpoints and their original zones remain visible in their own record.

The current read contract supplies trips, places, visits, journeys and stays. It does not supply events, linked people, a document catalogue, offline file availability or change history. The Documents tab presents recorded stay document references and states its file-access limitation. People states the missing capability. Neither implies that a reference is an accessible file or that unreturned data is empty.

Tests use fictional records only inside test resources. Production has no fixture fallback, write path, persisted cache or simulated upload/download operation.

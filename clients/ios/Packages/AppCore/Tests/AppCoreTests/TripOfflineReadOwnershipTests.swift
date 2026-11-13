import Foundation
import Testing

@testable import AppCore

@Suite("Offline read lifetime and deferred ownership")
@MainActor
internal struct TripOfflineReadOwnershipTests {
    @Test("retired A remains retired after B→A; late A cannot persist or deliver its response")
    internal func accountABA() async throws {
        let fixture = try TripOfflineReadFixture()
        let context = fixture.context()
        let reader = fixture.coordinator(context: context)
        fixture.remote.deferDetails = true
        let task = Task { try await reader.trip(id: 7) }
        var starts = fixture.remote.started.stream.makeAsyncIterator()
        _ = await starts.next()
        context.retire()
        fixture.current = TripDocumentOfflineOwner(
            device: PairedDevice(
                id: "phone", baseURL: try #require(URL(string: "https://other.example")),
                credentialRevision: 2))
        fixture.current = fixture.owner
        fixture.remote.pending.removeFirst().resume(returning: TripOfflineReadFixture.snapshot())
        await #expect(throws: TripDocumentOfflineError.ownerChanged) { try await task.value }
        #expect(fixture.store.value == nil)
        let calls = fixture.remote.calls
        await #expect(throws: TripDocumentOfflineError.ownerChanged) { try await reader.trips() }
        #expect(fixture.remote.calls == calls)
    }

    @Test("late same-resource results cannot overwrite a newer accepted generation")
    internal func staleRequest() async throws {
        let fixture = try TripOfflineReadFixture()
        let reader = fixture.coordinator()
        fixture.remote.deferDetails = true
        var starts = fixture.remote.started.stream.makeAsyncIterator()
        let old = Task { try await reader.trip(id: 7) }
        _ = await starts.next()
        let new = Task { try await reader.trip(id: 7) }
        _ = await starts.next()
        fixture.remote.pending.removeLast().resume(
            returning: TripOfflineReadFixture.snapshot(name: "New"))
        #expect(try await new.value?.trip.name == "New")
        let accepted = fixture.store.value
        fixture.remote.pending.removeFirst().resume(returning: TripOfflineReadFixture.snapshot())
        await #expect(throws: CancellationError.self) { try await old.value }
        #expect(fixture.store.value == accepted)
    }

    @Test("owner mismatch refuses disk fallback and transport before any call")
    internal func replacement() async throws {
        let fixture = try TripOfflineReadFixture()
        let reader = fixture.coordinator()
        _ = try await reader.trip(id: 7)
        fixture.current = TripDocumentOfflineOwner(
            device: PairedDevice(id: "other", baseURL: fixture.owner.baseURL, credentialRevision: 1)
        )
        let calls = fixture.remote.calls
        await #expect(throws: TripDocumentOfflineError.ownerChanged) {
            try await reader.trip(id: 7)
        }
        #expect(fixture.remote.calls == calls)
    }

    @Test("cancelled remote delivery cannot publish a last verified snapshot")
    internal func cancelled() async throws {
        let fixture = try TripOfflineReadFixture()
        let reader = fixture.coordinator()
        fixture.remote.deferDetails = true
        let task = Task { try await reader.trip(id: 7) }
        var starts = fixture.remote.started.stream.makeAsyncIterator()
        _ = await starts.next()
        task.cancel()
        fixture.remote.pending.removeFirst().resume(returning: TripOfflineReadFixture.snapshot())
        await #expect(throws: CancellationError.self) { try await task.value }
        #expect(fixture.store.value == nil)
    }
}

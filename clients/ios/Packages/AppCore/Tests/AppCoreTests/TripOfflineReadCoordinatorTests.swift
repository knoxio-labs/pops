import Foundation
import Testing

@testable import AppCore

@Suite("Owner-bound last verified Trip reads")
@MainActor
internal struct TripOfflineReadCoordinatorTests {
    @Test(
        "fresh coordinators restore the explicit selection and preserve original verification dates"
    )
    internal func reconstruction() async throws {
        let fixture = try TripOfflineReadFixture()
        let reader = fixture.coordinator()
        #expect(try await reader.trips() == [TripOfflineReadFixture.snapshot().trip])
        #expect(try reader.selectedTripID() == nil)
        #expect(try await reader.trip(id: 7) == TripOfflineReadFixture.snapshot())
        try reader.selectTrip(7)
        fixture.remote.catalogue = .failure(.unavailable)
        fixture.remote.detail = .failure(.unavailable)
        let restored = fixture.coordinator()
        #expect(try restored.selectedTripID() == 7)
        #expect(try await restored.trips() == [TripOfflineReadFixture.snapshot().trip])
        #expect(try await restored.trip(id: 7) == TripOfflineReadFixture.snapshot())
        #expect(restored.provenance[.catalogue] == .lastVerified(verifiedAt: fixture.verifiedAt))
        #expect(restored.provenance[.trip(7)] == .lastVerified(verifiedAt: fixture.verifiedAt))
    }

    @Test(
        "missing Trip tombstones survive reconstruction and only a verified detail restores eligibility"
    )
    internal func missingTrip() async throws {
        let fixture = try TripOfflineReadFixture()
        let reader = fixture.coordinator()
        _ = try await reader.trips()
        _ = try await reader.trip(id: 7)
        try reader.selectTrip(7)
        fixture.remote.detail = .success(nil)
        #expect(try await reader.trip(id: 7) == nil)
        #expect(try reader.selectedTripID() == nil)
        fixture.remote.catalogue = .failure(.unavailable)
        fixture.remote.detail = .failure(.unavailable)
        let restored = fixture.coordinator()
        #expect(try await restored.trips().isEmpty)
        await #expect(throws: RepositoryError.unavailable) { try await restored.trip(id: 7) }
        fixture.remote.detail = .success(TripOfflineReadFixture.snapshot())
        _ = try await restored.trip(id: 7)
        fixture.remote.detail = .failure(.unavailable)
        #expect(try await restored.trip(id: 7) != nil)
    }

    @Test(
        "a complete successful empty catalogue invalidates old details rather than returning false old trips"
    )
    internal func emptyCatalogue() async throws {
        let fixture = try TripOfflineReadFixture()
        let reader = fixture.coordinator()
        _ = try await reader.trip(id: 7)
        try reader.selectTrip(7)
        fixture.remote.catalogue = .success([])
        #expect(try await reader.trips().isEmpty)
        fixture.remote.detail = .failure(.unavailable)
        await #expect(throws: RepositoryError.unavailable) { try await reader.trip(id: 7) }
        #expect(try reader.selectedTripID() == nil)
    }

    @Test(
        "authorization, malformed responses and source changes never fall back",
        arguments: [
            RepositoryError.unauthorized, .featureUnavailable, .contractMismatch, .requestRejected,
            .rateLimited(retryAfterSeconds: nil), .conflict("changed"), .transport("unknown"),
        ])
    internal func refused(error: RepositoryError) async throws {
        let fixture = try TripOfflineReadFixture()
        let reader = fixture.coordinator()
        _ = try await reader.trip(id: 7)
        fixture.remote.detail = .failure(error)
        await #expect(throws: error) { try await reader.trip(id: 7) }
        #expect(reader.provenance[.trip(7)] == nil)
    }

    @Test("foreign successful IDs are rejected without replacing last verified data")
    internal func foreignSuccess() async throws {
        let fixture = try TripOfflineReadFixture()
        let reader = fixture.coordinator()
        _ = try await reader.trip(id: 7)
        let before = fixture.store.value
        fixture.remote.detail = .success(TripOfflineReadFixture.snapshot(id: 8))
        await #expect(throws: RepositoryError.contractMismatch) { try await reader.trip(id: 7) }
        #expect(fixture.store.value?.trips == before?.trips)
        #expect(fixture.store.value?.invalidatedResources?.contains(.trip(7)) == true)
    }

    @Test("failed tombstone persistence is an error and does not report a successful missing read")
    internal func failedInvalidation() async throws {
        let fixture = try TripOfflineReadFixture()
        let reader = fixture.coordinator()
        _ = try await reader.trip(id: 7)
        let before = fixture.store.value
        fixture.store.failReplacement = true
        fixture.remote.detail = .success(nil)
        await #expect(throws: CocoaError.self) { try await reader.trip(id: 7) }
        #expect(fixture.store.value == before)
        fixture.store.failReplacement = false
        fixture.remote.detail = .failure(.unavailable)
        await #expect(throws: RepositoryError.unavailable) { try await reader.trip(id: 7) }
    }
}

import Foundation
import Testing

@testable import AppCore

@Suite("Last verified document metadata eligibility")
@MainActor
internal struct TripOfflineReadDocumentsTests {
    @Test("metadata does not establish file availability and retains its own verifiedAt")
    internal func metadataOnly() async throws {
        let fixture = try TripOfflineReadFixture()
        let reader = fixture.coordinator()
        fixture.remote.metadata = .success(TripOfflineReadFixture.document())
        _ = try await reader.document(id: 12)
        fixture.remote.metadata = .failure(.unavailable)
        let restored = fixture.coordinator()
        #expect(try await restored.document(id: 12) == TripOfflineReadFixture.document())
        #expect(restored.provenance[.document(12)] == .lastVerified(verifiedAt: fixture.verifiedAt))
        await #expect(throws: RepositoryError.unavailable) { try await restored.file(id: 12) }
        #expect(restored.provenance[.file(12)] == nil)
    }

    @Test(
        "missing metadata invalidates both metadata and file, and successful metadata cannot revive the file"
    )
    internal func missingMetadata() async throws {
        let fixture = try TripOfflineReadFixture()
        let reader = fixture.coordinator()
        fixture.remote.metadata = .success(TripOfflineReadFixture.document())
        _ = try await reader.document(id: 12)
        fixture.remote.metadata = .success(nil)
        #expect(try await reader.document(id: 12) == nil)
        #expect(fixture.store.value?.invalidatedResources == [.document(12), .file(12)])
        fixture.remote.metadata = .failure(.unavailable)
        await #expect(throws: RepositoryError.unavailable) {
            try await fixture.coordinator().document(id: 12)
        }
        fixture.remote.metadata = .success(TripOfflineReadFixture.document())
        _ = try await reader.document(id: 12)
        #expect(fixture.store.value?.invalidatedResources == [.file(12)])
    }

    @Test("file missing persists independently of metadata and transient preview state")
    internal func missingFile() async throws {
        let fixture = try TripOfflineReadFixture()
        let reader = fixture.coordinator()
        fixture.remote.fileFailure = DocumentAccessError.notFound
        await #expect(throws: DocumentAccessError.notFound) { try await reader.file(id: 12) }
        #expect(fixture.store.value?.invalidatedResources == [.file(12)])
    }

    @Test("a grant refusal cannot be followed by an offline revival after reconstruction")
    internal func refusedMetadata() async throws {
        let fixture = try TripOfflineReadFixture()
        let reader = fixture.coordinator()
        fixture.remote.metadata = .success(TripOfflineReadFixture.document())
        _ = try await reader.document(id: 12)
        fixture.remote.metadata = .failure(.featureUnavailable)
        await #expect(throws: RepositoryError.featureUnavailable) {
            try await reader.document(id: 12)
        }
        fixture.remote.metadata = .failure(.unavailable)
        await #expect(throws: RepositoryError.unavailable) {
            try await fixture.coordinator().document(id: 12)
        }
    }
}

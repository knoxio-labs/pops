import Foundation
import Testing

@testable import BFMClient

@Suite("Ego stream credential revisions")
internal struct BFMEgoByteTransportRevisionTests {
    @Test("a retry revocation is bound to the revision returned by refresh")
    func retryRevocationUsesRefreshedRevision() async throws {
        let source = ScriptedBFMByteSource(replies: [
            .init(statusCode: 401),
            .init(statusCode: 403, body: Data(#"{"code":"device_revoked"}"#.utf8)),
        ])
        let authorizer = RecordingBFMStreamAuthorizer(accessToken: "access-1")
        let transport = BFMEgoByteTransport(
            baseURL: try #require(URL(string: "https://bfm.example")),
            authorizer: authorizer,
            source: source
        )

        let opening = try await transport.open(body: Data())

        guard case .rejected(let status, _, _) = opening else {
            Issue.record("expected the retry refusal to be returned")
            return
        }
        #expect(status == 403)
        #expect(await authorizer.revokedRevisions() == [2])
    }
}

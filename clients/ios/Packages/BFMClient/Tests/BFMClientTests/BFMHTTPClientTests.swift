import Foundation
import Testing

@testable import BFMClient

@Suite("BFMHTTPClient URLSession")
internal struct BFMHTTPClientTests {
    @Test("the public initializer's session does not read or store cached responses")
    func publicSessionDoesNotCacheResponses() throws {
        let baseURL = try #require(URL(string: "https://example.test"))
        let client = BFMHTTPClient(baseURL: baseURL)
        let session = try #require(client.urlSession)
        let configuration = session.configuration

        #expect(configuration.urlCache == nil)
        #expect(configuration.requestCachePolicy == .reloadIgnoringLocalCacheData)
    }
}

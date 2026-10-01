import Foundation
import Testing

@testable import BFMClient

@Suite("BFMHTTPClient URLSession")
internal struct BFMHTTPClientTests {
    @Test("the default session does not read or store cached responses")
    func sessionDoesNotCacheResponses() {
        let configuration = BFMHTTPClient.makeUncachedURLSession().configuration

        #expect(configuration.urlCache == nil)
        #expect(configuration.requestCachePolicy == .reloadIgnoringLocalCacheData)
    }
}

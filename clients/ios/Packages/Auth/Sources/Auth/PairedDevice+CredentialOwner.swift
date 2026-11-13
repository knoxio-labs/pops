import AppCore
import Foundation

extension PairedDevice {
    internal func assertCredentialOwner(_ snapshot: CredentialTokenSnapshot?, baseURL: URL) throws {
        guard baseURL == self.baseURL, snapshot?.revision == credentialRevision else {
            throw SessionRefreshError.unavailable("paired client identity changed")
        }
    }
}

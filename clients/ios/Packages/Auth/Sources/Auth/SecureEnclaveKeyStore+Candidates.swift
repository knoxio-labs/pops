import Foundation
import Synchronization

extension SecureEnclaveKeyStore {
    /// Generates an Enclave key without changing the key that currently signs requests.
    public func createCandidateKey() throws -> DeviceKeyCandidate {
        try Self.mutationLock.withLock { _ in
            let identifier = UUID()
            var identifiers = candidateIdentifiers
            identifiers.append(identifier.uuidString)
            UserDefaults.standard.set(identifiers, forKey: candidateDefaultsKey)

            do {
                let publicKey = try createKey(at: candidateTag(for: identifier))
                return DeviceKeyCandidate(
                    publicKey: publicKey,
                    identifier: identifier,
                    namespace: applicationTag
                )
            } catch {
                try? deleteKey(at: candidateTag(for: identifier))
                removeCandidate(identifier)
                throw error
            }
        }
    }

    /// Makes a staged key active and removes the previous active key.
    public func activateCandidate(_ candidate: DeviceKeyCandidate) throws {
        try Self.mutationLock.withLock { _ in
            guard candidate.namespace == applicationTag,
                candidateIdentifiers.contains(candidate.identifier.uuidString),
                try loadPrivateKey(at: candidateTag(for: candidate.identifier)) != nil
            else {
                throw DeviceKeyStoreError.candidateNotFound
            }

            let previousIdentifier = UserDefaults.standard.string(
                forKey: activeCandidateDefaultsKey)
            let previousTag: Data
            if let previousIdentifier, let previousUUID = UUID(uuidString: previousIdentifier) {
                previousTag = candidateTag(for: previousUUID)
            } else {
                previousTag = tag
            }
            let selectedTag = candidateTag(for: candidate.identifier)
            UserDefaults.standard.set(
                candidate.identifier.uuidString, forKey: activeCandidateDefaultsKey)

            do {
                if previousTag != selectedTag { try deleteKey(at: previousTag) }
            } catch {
                if let previousIdentifier {
                    UserDefaults.standard.set(
                        previousIdentifier, forKey: activeCandidateDefaultsKey)
                } else {
                    UserDefaults.standard.removeObject(forKey: activeCandidateDefaultsKey)
                }
                throw error
            }

            removeCandidate(candidate.identifier)
            if let previousIdentifier,
                let previousUUID = UUID(uuidString: previousIdentifier),
                previousUUID != candidate.identifier
            {
                removeCandidate(previousUUID)
            }
        }
    }

    /// Removes a staged key while preserving the active key.
    public func discardCandidate(_ candidate: DeviceKeyCandidate) throws {
        try Self.mutationLock.withLock { _ in
            guard candidate.namespace == applicationTag else {
                throw DeviceKeyStoreError.candidateNotFound
            }
            guard
                UserDefaults.standard.string(forKey: activeCandidateDefaultsKey)
                    != candidate.identifier.uuidString
            else {
                throw DeviceKeyStoreError.candidateAlreadyActive
            }
            try deleteKey(at: candidateTag(for: candidate.identifier))
            removeCandidate(candidate.identifier)
        }
    }

    /// Deletes every key in this store's Keychain namespace, including staged keys.
    public func deleteKey() throws {
        try Self.mutationLock.withLock { _ in
            var candidateTags = Set(
                candidateIdentifiers.compactMap(UUID.init(uuidString:)).map(candidateTag(for:))
            )
            if let activeIdentifier = UserDefaults.standard.string(
                forKey: activeCandidateDefaultsKey),
                let activeUUID = UUID(uuidString: activeIdentifier)
            {
                candidateTags.insert(candidateTag(for: activeUUID))
            }
            var failure: (any Error)?
            do {
                candidateTags.formUnion(try matchingCandidateTags())
            } catch {
                failure = error
            }
            for candidateTag in candidateTags {
                do {
                    try deleteKey(at: candidateTag)
                } catch {
                    failure = error
                }
            }
            do {
                try deleteKey(at: tag)
            } catch {
                failure = error
            }
            if let failure { throw failure }
            UserDefaults.standard.removeObject(forKey: activeCandidateDefaultsKey)
            UserDefaults.standard.removeObject(forKey: candidateDefaultsKey)
        }
    }
}

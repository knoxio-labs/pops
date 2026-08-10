import AppCore
import Foundation
import Testing

@testable import FeatureTransactions

/// The words, and the one pair of them that must never converge.
///
/// A missing case is caught by the compiler rather than here — `message(for:)`
/// switches exhaustively, so a new `RepositoryError` fails the build. What is
/// checked here is what a compiler cannot see: that the sentences are actually
/// different from one another, and that the one about an outage does not read
/// like the one about having nothing.
@Suite("Transactions copy")
internal struct TransactionsCopyTests {
    private static let everyFailure: [RepositoryError] = [
        .unavailable,
        .unauthorized,
        .contractMismatch,
        .transport("URLError -1009"),
        .dependencyNotBound,
    ]

    @Test("every failure says something, and no two say the same thing")
    func everyFailureHasItsOwnSentence() {
        let messages = Self.everyFailure.map(TransactionsCopy.message(for:))

        #expect(messages.allSatisfy { !$0.trimmingCharacters(in: .whitespaces).isEmpty })
        #expect(Set(messages).count == messages.count)
    }

    /// The distinction the BFM returns a typed unavailable response to preserve.
    /// If these ever read alike, the app is telling somebody their money is
    /// gone because a container restarted.
    /// Case-insensitively, because the phrase this must never contain is just
    /// as wrong at the start of a sentence — and a copy edit that capitalises
    /// it is exactly the change that would slip past a literal match.
    @Test("an outage does not read like an empty account")
    func outageIsNotEmptiness() {
        let outage = TransactionsCopy.message(for: .unavailable)

        #expect(outage != TransactionsCopy.empty)
        #expect(!outage.lowercased().contains("no transactions"))
    }

    /// The diagnostic in a transport failure is for a log. Nobody holding a
    /// phone can act on a URLError code, and putting one on screen reads as the
    /// app having broken rather than the network having.
    @Test("a transport failure's diagnostic does not reach the reader")
    func diagnosticsStayOutOfCopy() {
        #expect(!TransactionsCopy.message(for: .transport("URLError -1009")).contains("-1009"))
    }

    @Test("the tail says both what failed and why")
    func loadMoreCarriesTheReason() {
        let sentence = TransactionsCopy.loadMoreFailure(.unavailable)

        #expect(sentence.hasPrefix(TransactionsCopy.loadMoreFailed))
        #expect(sentence.contains(TransactionsCopy.message(for: .unavailable)))
    }

    @Test("the refresh banner says both what failed and why")
    func refreshCarriesTheReason() {
        let sentence = TransactionsCopy.refreshFailure(.unauthorized)

        #expect(sentence.hasPrefix(TransactionsCopy.refreshFailed))
        #expect(sentence.contains(TransactionsCopy.message(for: .unauthorized)))
    }

    /// "coffee, weekly" after an amount and a date sounds like two more
    /// transactions. The word is what makes the sentence parse.
    @Test("tags are announced as tags")
    func tagsAreLabelled() {
        #expect(TransactionsCopy.tagList(["coffee", "weekly"]) == "tagged coffee, weekly")
    }
}

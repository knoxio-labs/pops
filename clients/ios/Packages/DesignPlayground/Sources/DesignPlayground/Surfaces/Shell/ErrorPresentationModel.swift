import Foundation

internal struct PresentedError: Identifiable, Equatable, Sendable {
    internal enum BannerLifetime: Equatable, Sendable {
        case automatic
        case untilDismissed
    }

    internal let message: String
    internal let code: String
    internal let requestID: String
    internal let operation: String
    internal let occurredAt: String
    internal let build: String
    internal let retryable: Bool

    internal var id: String { requestID }

    internal var bannerLifetime: BannerLifetime {
        retryable ? .automatic : .untilDismissed
    }

    internal var copiedDetails: String {
        """
        \(message)
        Code: \(code)
        Request: \(requestID)
        Operation: \(operation)
        Time: \(occurredAt)
        Build: \(build)
        """
    }
}

internal enum ErrorPresentationFixtures {
    internal static let retryable = PresentedError(
        message: "The purchase could not be saved. Try again.",
        code: "purchases.records.unavailable",
        requestID: "01K62M7WRY8ZEP4RPK6F0QME48",
        operation: "Save purchase",
        occurredAt: "27 Sep 2026 at 2:41 pm",
        build: "Pops 1.8 (412)",
        retryable: true
    )

    internal static let nonRetryable = PresentedError(
        message: "Name the item before asking for a code.",
        code: "inventory.codes.name_required",
        requestID: "01K62M5J38VZ3A2ADG9K7H31RF",
        operation: "Suggest inventory code",
        occurredAt: "27 Sep 2026 at 2:38 pm",
        build: "Pops 1.8 (412)",
        retryable: false
    )

    internal static let recent: [PresentedError] = (0..<52).map { offset in
        PresentedError(
            message: offset.isMultiple(of: 3)
                ? "The purchase could not be saved. Try again."
                : "The server could not be reached.",
            code: offset.isMultiple(of: 3)
                ? "purchases.records.unavailable"
                : "ios.net.offline",
            requestID: String(format: "01K62M%04dPLAYGROUNDERROR", 5200 - offset),
            operation: offset.isMultiple(of: 3) ? "Save purchase" : "Refresh transactions",
            occurredAt: offset == 0 ? "Today at 2:41 pm" : "26 Sep at \(11 - offset % 8):24 am",
            build: "Pops 1.8 (412)",
            retryable: true
        )
    }
}

internal struct RecentErrors: Equatable, Sendable {
    internal static let limit = 50
    internal let entries: [PresentedError]

    internal init(_ entries: [PresentedError]) {
        self.entries = Array(entries.prefix(Self.limit))
    }
}

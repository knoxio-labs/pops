import Foundation
import SwiftUI

/// Whether a failure happened while a person was waiting for the operation.
public enum ErrorPresentationContext: Hashable, Sendable {
    /// The failed operation was initiated in the visible interface.
    case foreground
    /// The failed operation ran without a person waiting for an answer.
    case background
}

/// A recorded failure with the local context needed to report it.
public struct PresentedError: Codable, Hashable, Identifiable, Sendable {
    /// How long the root banner remains visible.
    public enum BannerLifetime: Hashable, Sendable {
        /// The banner leaves after a short delay.
        case automatic
        /// The banner remains until explicitly dismissed.
        case untilDismissed
    }

    /// Stable identity for this occurrence, including failures without request ids.
    public let id: UUID
    /// The user-safe ADR-054 failure.
    public let error: PopsError
    /// The action that failed.
    public let operation: String
    /// When the failure occurred on this device.
    public let occurredAt: Date
    /// The app version and build that observed the failure.
    public let build: String

    /// Creates one locally contextualized failure occurrence.
    public init(
        id: UUID = UUID(),
        error: PopsError,
        operation: String,
        occurredAt: Date = .now,
        build: String
    ) {
        self.id = id
        self.error = error
        self.operation = operation
        self.occurredAt = occurredAt
        self.build = build
    }

    /// Whether the root banner leaves automatically or waits for dismissal.
    public var bannerLifetime: BannerLifetime {
        error.retryable ? .automatic : .untilDismissed
    }

    /// The request id shown in diagnostics when the failure was local.
    public var requestID: String {
        error.requestID ?? "Not provided"
    }

    /// The human-readable local time shown in details and copied diagnostics.
    public var occurredAtText: String {
        occurredAt.formatted(date: .abbreviated, time: .shortened)
    }

    /// The complete user-safe block copied for a support report.
    public var copiedDetails: String {
        """
        \(error.message)
        Code: \(error.code)
        Request: \(requestID)
        Operation: \(operation)
        Time: \(occurredAtText)
        Build: \(build)
        """
    }
}

/// Receives user-safe failures from features without coupling them to root presentation.
@MainActor
public protocol ErrorPresenter: AnyObject {
    /// Records a failure and presents it when it happened in the foreground.
    func present(
        _ error: PopsError,
        operation: String,
        context: ErrorPresentationContext
    )

    /// Opens the persisted device-local failure history.
    func showRecentErrors()
}

@MainActor
private final class DiscardingErrorPresenter: ErrorPresenter {
    func present(
        _ error: PopsError,
        operation: String,
        context: ErrorPresentationContext
    ) {}

    func showRecentErrors() {}
}

extension EnvironmentValues {
    /// The process-wide failure presenter installed by the app composition root.
    @Entry public var errorPresenter: any ErrorPresenter = DiscardingErrorPresenter()
}

extension View {
    /// Adds the app menu entry that opens device-local recent failures.
    public func errorDiagnosticsMenu() -> some View {
        modifier(ErrorDiagnosticsMenuModifier())
    }
}

private struct ErrorDiagnosticsMenuModifier: ViewModifier {
    @Environment(\.errorPresenter) private var errorPresenter

    func body(content: Content) -> some View {
        content.toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button {
                        errorPresenter.showRecentErrors()
                    } label: {
                        Label("Recent errors", systemImage: "exclamationmark.bubble")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("App menu")
            }
        }
    }
}

import DesignSystem
import SwiftUI

/// The seven non-ordinary conditions an Inventory screen can be in.
///
/// Built on the DesignSystem's own state primitives rather than beside them, so
/// an Inventory empty state and a Transactions empty state are the same
/// component saying different things. What this adds is the words, each one
/// says what happened in Inventory's terms and what a person can do next,
/// which is the part a generic primitive cannot know.
internal enum InventoryStateNoticeKind: String, CaseIterable, Identifiable {
    case empty
    case loading
    case unavailable
    case stale
    case partial
    case permission
    case repair

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .empty: "Empty"
        case .loading: "Loading"
        case .unavailable: "Unavailable"
        case .stale: "Stale"
        case .partial: "Partly loaded"
        case .permission: "Permission needed"
        case .repair: "Needs repair"
        }
    }
}

internal struct InventoryStateNotice: View {
    internal let kind: InventoryStateNoticeKind

    @ViewBuilder internal var body: some View {
        switch kind {
        case .empty:
            EmptyStateView(
                message: "Nothing in here yet. Add something new, or put an existing item here.")
        case .loading:
            LoadingStateView(message: "Loading your catalogue")
        case .unavailable:
            ErrorStateView(
                message: "The catalogue could not be opened on this phone.",
                retryTitle: "Try again"
            ) {}
        case .stale, .partial, .permission, .repair:
            PopsStatusHeader(tone: tone, title: headline, message: message, caption: caption)
        }
    }

    private var tone: PopsStatusHeader.Tone {
        switch kind {
        case .repair: .danger
        case .permission: .information
        case .empty, .loading, .unavailable, .stale, .partial: .warning
        }
    }

    private var headline: String {
        switch kind {
        case .stale: "May be out of date"
        case .partial: "Some of this did not load"
        case .permission: "Camera access is off"
        case .repair: "3 changes need you"
        case .empty, .loading, .unavailable: ""
        }
    }

    private var message: String {
        switch kind {
        case .stale:
            "Last synced 2 hours ago. Anything you change is saved on this phone and sent when it can be."
        case .partial:
            "Photos for 4 items are still on the server. Everything else is here and usable."
        case .permission:
            "Scanning a label needs the camera. You can still find items by name."
        case .repair:
            "The server disagreed with 3 changes made on this phone. Nothing is lost; each one needs a choice."
        case .empty, .loading, .unavailable:
            ""
        }
    }

    private var caption: String? {
        switch kind {
        case .permission: "Settings → Privacy → Camera"
        case .repair: "Open Sync & repair"
        case .empty, .loading, .unavailable, .stale, .partial: nil
        }
    }
}

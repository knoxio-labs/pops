import DesignSystem
import SwiftUI

/// The receipt pages added in this sitting, and where their reading stands.
internal struct GuestReceiptState: Hashable, Sendable {
    internal var pages: [Data] = []
    internal var reading: GuestReceiptReading = .none
}

internal enum GuestReceiptCopy {
    internal static let title = "Receipt"
    internal static let add = "Add a receipt"
    internal static let camera = "Take a photo"
    internal static let photos = "Choose photos"
    internal static let file = "Choose a file"
    internal static let remove = "Remove this page"
    internal static let reading = "Reading the receipt…"
    internal static let applied = "Filled in from the receipt."
    internal static let unreadable = "This receipt could not be read. It stays attached."
    internal static let unavailable = "Receipt reading is unavailable. It stays attached."
    internal static let suggestionTitle = "From the receipt"
    internal static let use = "Use these"
    internal static let dismiss = "Dismiss"
    internal static let unread = "Not found"

    internal static func mismatch(receipt: String, account: String) -> String {
        "The receipt is in \(receipt) and this account is in \(account). Enter the amount yourself."
    }
}

/// The form's receipt strip: pages already saved, pages added now, the one
/// button that adds more, and whatever reading them offered.
internal struct GuestReceiptSection: View {
    @Binding internal var receipt: GuestReceiptState
    @Binding internal var draft: GuestTransactionDraft
    internal let accounts: [GuestAccount]
    internal let existing: [GuestAttachment]

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            HStack(spacing: PopsSpacing.sm) {
                Text(GuestReceiptCopy.title)
                    .font(.popsSectionLabel)
                    .foregroundStyle(Color.popsMutedForeground)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: PopsSpacing.sm)
                addMenu
            }
            if !existing.isEmpty || !receipt.pages.isEmpty { strip }
            GuestReceiptReadingView(receipt: $receipt, draft: $draft, accounts: accounts)
        }
    }

    private var addMenu: some View {
        Menu {
            Button(GuestReceiptCopy.camera, systemImage: "camera") { attach(1) }
            Button(GuestReceiptCopy.photos, systemImage: "photo.on.rectangle") { attach(2) }
            Button(GuestReceiptCopy.file, systemImage: "folder") { attach(3) }
        } label: {
            Label(GuestReceiptCopy.add, systemImage: "paperclip")
                .labelStyle(.iconOnly)
                .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
        }
        .disabled(receipt.reading == .reading)
    }

    private var strip: some View {
        ScrollView(.horizontal) {
            HStack(spacing: PopsSpacing.sm) {
                ForEach(existing) { attachment in
                    GuestReceiptThumbnail(data: attachment.pages.first)
                        .accessibilityLabel(attachment.name)
                }
                ForEach(Array(receipt.pages.enumerated()), id: \.offset) { index, page in
                    GuestReceiptThumbnail(data: page)
                        .overlay(alignment: .topTrailing) { remove(index) }
                        .accessibilityLabel(GuestCopy.pageCount(index + 1))
                }
            }
        }
        .scrollIndicators(.hidden)
    }

    private func remove(_ index: Int) -> some View {
        Button(GuestReceiptCopy.remove, systemImage: "xmark.circle.fill") {
            receipt.pages.remove(at: index)
            if receipt.pages.isEmpty { receipt.reading = .none }
        }
        .labelStyle(.iconOnly)
        .foregroundStyle(Color.popsForeground, Color.popsSurface)
        .buttonStyle(.plain)
        .padding(PopsSpacing.xs)
    }

    /// The playground's stand-in for a capture: sample pages arrive, the
    /// reading runs for a beat, and a suggestion comes back.
    private func attach(_ pages: Int) {
        receipt.pages += GuestFixtures.paper(pages)
        receipt.reading = .reading
        Task {
            try? await Task.sleep(for: InventoryMotion.stagedBeat)
            guard receipt.reading == .reading else { return }
            receipt.reading = .suggested(GuestFixtures.receiptSuggestion)
        }
    }
}

internal struct GuestReceiptThumbnail: View {
    internal let data: Data?

    @ScaledMetric(relativeTo: .body) private var width = PopsSize.countField

    internal var body: some View {
        PopsPhoto(data: data, placeholderSymbol: "doc.text")
            .frame(width: width, height: width * PopsSize.pageHeight / PopsSize.pageWidth)
    }
}

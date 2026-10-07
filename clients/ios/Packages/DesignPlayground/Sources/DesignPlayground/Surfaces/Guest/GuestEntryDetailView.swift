import DesignSystem
import SwiftUI

/// One ledger entry, read-only: the figure, who paid, when, and the receipts
/// behind it. Editing opens the form; nothing here deletes the entry or
/// removes a receipt.
internal struct GuestEntryDetailView: View {
    internal let entry: GuestEntry
    internal let account: GuestAccount
    internal let offline: Bool

    @State private var viewing: GuestAttachment?
    @State private var editing = false
    private let presentation = GuestPresentation()

    internal init(
        entry: GuestEntry, account: GuestAccount, viewing: GuestAttachment? = nil,
        offline: Bool = false
    ) {
        self.entry = entry
        self.account = account
        self.offline = offline
        _viewing = State(initialValue: viewing)
    }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                heading
                receipts
            }
            .padding(PopsSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .vertical)
        .background(Color.popsBackground)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                history
                if account.canEdit { edit }
            }
        }
        .sheet(item: $viewing) { GuestAttachmentViewer(attachment: $0) }
        .sheet(isPresented: $editing) {
            NavigationStack {
                GuestTransactionFormView(
                    stage: GuestFormStage(accounts: [account], mode: .edit(entry)))
            }
        }
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text(entry.description)
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
            Text(presentation.amount(entry, in: account))
                .font(.popsAmount)
                .foregroundStyle(Color.popsForeground)
            Text(presentation.subtitle(entry, in: account))
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
            if !account.isPersonLedger {
                Text(presentation.title(account))
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var receipts: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text(GuestCopy.receipts)
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityAddTraits(.isHeader)
            if entry.attachments.isEmpty {
                Text(GuestCopy.noReceipts)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsMutedForeground)
            } else {
                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: PopsSpacing.md) {
                        ForEach(entry.attachments) { attachment in
                            Button {
                                viewing = attachment
                            } label: {
                                GuestAttachmentTile(attachment: attachment)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }
        }
    }

    private var history: some View {
        NavigationLink {
            GuestHistoryView(scope: .entry, state: .loaded(GuestFixtures.ticketsHistory))
                .navigationTitle(GuestHistoryCopy.entryTitle)
        } label: {
            Image(systemName: "clock.arrow.circlepath")
        }
        .accessibilityLabel(GuestHistoryCopy.entryTitle)
    }

    private var edit: some View {
        Button("Edit", systemImage: "pencil") { editing = true }
            .labelStyle(.iconOnly)
            .disabled(offline)
    }
}

/// One receipt in the strip: its first page, its name, and how much of it
/// there is.
internal struct GuestAttachmentTile: View {
    internal let attachment: GuestAttachment

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            page
                .frame(width: PopsSize.pageWidth, height: PopsSize.pageHeight)
            Text(attachment.name)
                .font(.popsCaption)
                .foregroundStyle(Color.popsForeground)
                .lineLimit(1)
            Text(GuestAttachmentCopy.detail(attachment))
                .font(.popsCaption)
                .foregroundStyle(detailColor)
                .lineLimit(1)
        }
        .frame(width: PopsSize.pageWidth, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder private var page: some View {
        switch attachment.availability {
        case .ready:
            PopsPhoto(data: attachment.pages.first, placeholderSymbol: "doc.text")
        case .loading:
            PopsPhoto(data: nil, placeholderSymbol: "doc.text").popsShimmer()
        case .failed:
            PopsPhoto(data: nil, placeholderSymbol: "exclamationmark.triangle")
        }
    }

    private var detailColor: Color {
        attachment.availability == .failed ? .popsDestructive : .popsMutedForeground
    }
}

internal enum GuestAttachmentCopy {
    internal static let close = "Close"
    internal static let loading = "Loading receipt…"
    internal static let failed = "This receipt could not be loaded."
    internal static let retry = "Retry"

    internal static func detail(_ attachment: GuestAttachment) -> String {
        switch attachment.availability {
        case .loading: return "Loading"
        case .failed: return "Could not load"
        case .ready:
            let pages = GuestCopy.pageCount(attachment.pages.count)
            return attachment.media == .pdf ? "PDF · \(pages)" : "Photo"
        }
    }

    internal static func position(page: Int, of count: Int) -> String {
        count > 1 ? "Page \(page + 1) of \(count)" : ""
    }
}

/// A receipt opened to read: pinch to zoom, swipe between pages. It closes
/// and does nothing else, because the phone does not remove attachments.
internal struct GuestAttachmentViewer: View {
    internal let attachment: GuestAttachment

    @Environment(\.dismiss) private var dismiss
    @State private var page = 0

    internal var body: some View {
        NavigationStack {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.popsBackground)
                .navigationTitle(attachment.name)
                .navigationSubtitle(
                    GuestAttachmentCopy.position(page: page, of: attachment.pages.count)
                )
                .playgroundTitleDisplay(large: false)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(GuestAttachmentCopy.close, systemImage: "xmark") { dismiss() }
                            .labelStyle(.iconOnly)
                    }
                }
        }
    }

    @ViewBuilder private var content: some View {
        switch attachment.availability {
        case .ready:
            PopsPagedPhotoViewer(
                images: attachment.pages, placeholderSymbol: "doc.text", contentMode: .fit
            ) { page = $0 }
        case .loading:
            LoadingStateView(message: GuestAttachmentCopy.loading)
        case .failed:
            ErrorStateView(
                message: GuestAttachmentCopy.failed, retryTitle: GuestAttachmentCopy.retry
            ) {}
        }
    }
}

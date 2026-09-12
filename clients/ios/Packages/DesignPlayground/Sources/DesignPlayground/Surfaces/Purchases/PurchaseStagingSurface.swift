import AppCore
import DesignSystem
import SwiftUI

/// One file a person picked, before anything has read it.
internal struct StagedPage: Identifiable, Hashable {
    internal let id: String
    /// What the file is called where it came from. Shown because after four
    /// photographs of four receipts the thumbnails are the only thing telling
    /// them apart, and thumbnails of paper all look alike.
    internal let label: String
    internal let media: ReceiptMediaType
    internal let bytes: Data?
}

/// A group of pages that will be sent as one receipt and one call.
internal struct StagedReceipt: Identifiable, Hashable {
    internal let id: String
    internal var pages: [StagedPage]
}

/// What was picked, before it is read — one row per file, each its own receipt
/// until somebody says otherwise.
///
/// The default is the one that matches how people actually use a phone: a
/// camera roll holds four receipts from four shops far more often than it
/// holds four pages of one. The camera is the exception and keeps its own
/// rule — `VNDocumentCameraScan` collects pages of a single document, so a
/// scan arrives already grouped and this screen shows it as one receipt.
///
/// Grouping is therefore the gesture, not splitting: select the rows that are
/// pages of one thing and combine them. Inside a group the order is the page
/// order, and it is draggable, because a receipt read bottom-up adds up to a
/// total nobody printed.
///
/// The cap is per receipt rather than per pick. `ReceiptPart.maxPerReceipt` is
/// eight and the BFM refuses more, so a group that grows past it is refused
/// here, with the count, before any bytes are sent.
internal struct PurchaseStagingSurface: View {
    internal let receipts: [StagedReceipt]
    internal var selection: Set<String> = []

    @State private var selected: Set<String>

    internal init(receipts: [StagedReceipt], selection: Set<String> = []) {
        self.receipts = receipts
        self.selection = selection
        _selected = State(initialValue: selection)
    }

    private let thumbWidth: CGFloat = 46

    private var overCap: [StagedReceipt] {
        receipts.filter { $0.pages.count > ReceiptPart.maxPerReceipt }
    }

    internal var body: some View {
        List {
            // Every receipt that is one page shares a section. Four
            // photographs of four shops are the commonest thing a library
            // pick produces, and giving each of them its own card and its own
            // "1 receipt" header turns the ordinary case into the loudest one.
            if !singles.isEmpty {
                Section {
                    ForEach(singles) { receipt in
                        ForEach(receipt.pages) { page in
                            row(page, in: receipt)
                        }
                    }
                } header: {
                    Text(singles.count == 1 ? "1 receipt" : "\(singles.count) separate receipts")
                        .font(.popsSectionLabel)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            // A group gets its own section, because that is the thing the
            // section is for: saying which pages are one receipt.
            ForEach(grouped) { receipt in
                Section {
                    ForEach(receipt.pages) { page in
                        row(page, in: receipt)
                    }
                } header: {
                    header(for: receipt)
                } footer: {
                    footer(for: receipt)
                }
            }
        }
        .playgroundInsetGroupedList()
        .scrollContentBackground(.hidden)
        .background(Color.popsBackground)
        .safeAreaInset(edge: .bottom) { actions }
    }

    private var singles: [StagedReceipt] { receipts.filter { $0.pages.count == 1 } }

    private var grouped: [StagedReceipt] { receipts.filter { $0.pages.count > 1 } }

    private func header(for receipt: StagedReceipt) -> some View {
        Text("1 receipt · \(receipt.pages.count) pages")
            .font(.popsSectionLabel)
            .foregroundStyle(Color.popsMutedForeground)
    }

    /// Said against the group it is about rather than in a banner, because a
    /// banner naming a count does not say which of four groups is the one to
    /// take a page out of.
    @ViewBuilder private func footer(for receipt: StagedReceipt) -> some View {
        if receipt.pages.count > ReceiptPart.maxPerReceipt {
            Text(
                "A receipt can be at most \(ReceiptPart.maxPerReceipt) pages. "
                    + "Remove \(receipt.pages.count - ReceiptPart.maxPerReceipt) or split this group."
            )
            .font(.popsCaption)
            .foregroundStyle(Color.popsDestructive)
        }
    }

    private func row(_ page: StagedPage, in receipt: StagedReceipt) -> some View {
        HStack(spacing: PopsSpacing.md) {
            Button {
                toggle(page.id)
            } label: {
                Image(
                    systemName: selected.contains(page.id)
                        ? "checkmark.circle.fill" : "circle"
                )
                .font(.popsHeadline)
                .foregroundStyle(
                    selected.contains(page.id) ? Color.popsAccent : Color.popsSeparator
                )
            }
            .buttonStyle(.plain)
            PopsPhoto(data: page.bytes, placeholderSymbol: glyph(for: page.media))
                .frame(width: thumbWidth, height: thumbWidth * pageRatio)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(page.label)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                if receipt.pages.count > 1, let index = receipt.pages.firstIndex(of: page) {
                    Text("Page \(index + 1)")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            Spacer(minLength: PopsSpacing.sm)
        }
        .padding(.vertical, PopsSpacing.xs)
    }

    private let pageRatio: CGFloat = PopsSize.pageHeight / PopsSize.pageWidth

    /// A page that is not a picture still has to occupy the plate, and say
    /// which kind it is — the rule `ReceiptPageMedia` already follows on the
    /// result screen.
    private func glyph(for media: ReceiptMediaType) -> String {
        switch media {
        case .jpeg, .png, .webp, .gif: "doc.text.image"
        case .pdf: "doc.richtext"
        case .plainText: "doc.plaintext"
        }
    }

    private func toggle(_ id: String) {
        if selected.contains(id) {
            selected.remove(id)
        } else {
            selected.insert(id)
        }
    }

    /// Combine is the prominent action only while something is selected. The
    /// rest of the time the one thing this screen is for is reading what was
    /// picked, and that button must not be the one that moves.
    private var actions: some View {
        PopsActionBar {
            if selected.isEmpty {
                PopsButton(readTitle, prominence: .prominent) {}
                    .disabled(!overCap.isEmpty)
            } else {
                PopsButton("Combine \(selected.count) into one receipt", prominence: .prominent) {}
                PopsButton("Clear selection") { selected.removeAll() }
            }
        }
    }

    private var readTitle: String {
        receipts.count == 1 ? "Read this receipt" : "Read \(receipts.count) receipts"
    }
}

import AppCore
import DesignSystem
import SwiftUI

/// One file a person picked, before anything has read it.
internal struct StagedPage: Identifiable, Hashable {
    internal let id: String
    /// What the file is called where it came from. Shown small and below the
    /// picture, because at this point it is the least useful fact about the
    /// file — but it is the only one that tells two photographs of two till
    /// receipts apart when both look like paper.
    internal let label: String
    internal let media: ReceiptMediaType
    internal let bytes: Data?
}

/// Pages that will be sent as one receipt and one call.
internal struct StagedReceipt: Identifiable, Hashable {
    internal let id: String
    internal var pages: [StagedPage]
}

/// What was picked, as the files themselves.
///
/// A list was the wrong shape here and the reason is worth keeping: at this
/// point nothing has been read. There is no merchant, no date and no total —
/// the only thing that identifies a receipt is the picture of it, and a row
/// spending its full width on `IMG_4821.HEIC` is a row showing the least
/// useful fact about the file at the largest size on screen.
///
/// So: a grid, and grouping by direct manipulation rather than by a selection
/// mode and a button.
///
/// - Drag one page onto another and the two become one receipt.
/// - Drag a page onto a receipt card and it joins it.
/// - Drag a page out of a card, onto the loose area, and it leaves.
///
/// Which means there is no Combine button, no Ungroup button and no selection
/// state to be in or out of — the same gesture reads forwards and backwards,
/// which is the property that makes iOS home-screen folders learnable without
/// anybody explaining them.
///
/// The loose area stays on screen even when it is empty, because it is the
/// drop target that ungroups, and a target you cannot see is a gesture with no
/// way back.
internal struct PurchaseStagingGrid: View {
    @State private var receipts: [StagedReceipt]
    @State private var viewing: StagedPage?

    internal init(receipts: [StagedReceipt]) {
        _receipts = State(initialValue: receipts)
    }

    private let columns = [
        GridItem(.flexible(), spacing: PopsSpacing.md),
        GridItem(.flexible(), spacing: PopsSpacing.md),
        GridItem(.flexible(), spacing: PopsSpacing.md),
    ]
    private let tileWidth: CGFloat = 96
    private let groupTile: CGFloat = 64
    private let ratio: CGFloat = PopsSize.pageHeight / PopsSize.pageWidth

    private var groups: [StagedReceipt] { receipts.filter { $0.pages.count > 1 } }
    private var loose: [StagedPage] { receipts.filter { $0.pages.count == 1 }.flatMap(\.pages) }
    private var everyPage: [StagedPage] { receipts.flatMap(\.pages) }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                ForEach(groups) { group in
                    groupCard(group)
                }
                looseArea
            }
            .padding(PopsSpacing.lg)
        }
        .background(Color.popsBackground)
        .safeAreaInset(edge: .bottom) { actions }
        .playgroundStage(item: $viewing) { page in
            PurchasePageViewer(
                pages: everyPage,
                showing: page,
                onDelete: { delete($0) }
            )
        }
    }

    /// A receipt is a card with its pages in it, rather than a folder glyph
    /// that hides them. Hiding them would make the pages undraggable, and
    /// dragging a page out is the only way to ungroup.
    private func groupCard(_ group: StagedReceipt) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Text("1 receipt · \(group.pages.count) pages")
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: PopsSpacing.md) {
                    ForEach(Array(group.pages.enumerated()), id: \.element.id) { index, page in
                        tile(page, width: groupTile, caption: "Page \(index + 1)")
                    }
                }
                .padding(.vertical, PopsSpacing.xs)
            }
        }
        .padding(PopsSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.popsSurface, in: .rect(cornerRadius: PopsRadius.card))
        .overlay(
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .strokeBorder(Color.popsSeparator, lineWidth: PopsBorder.hairline)
        )
        .dropDestination(for: String.self) { ids, _ in
            move(ids, into: group.id)
            return true
        }
    }

    @ViewBuilder private var looseArea: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Text(looseTitle)
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
            if loose.isEmpty {
                emptyLoose
            } else {
                LazyVGrid(columns: columns, spacing: PopsSpacing.lg) {
                    ForEach(loose) { page in
                        tile(page, width: tileWidth, caption: page.label)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .dropDestination(for: String.self) { ids, _ in
            separate(ids)
            return true
        }
    }

    private var looseTitle: String {
        switch loose.count {
        case 0: "On their own"
        case 1: "1 on its own"
        default: "\(loose.count) on their own"
        }
    }

    /// Visible at zero, because this is the target that ungroups and a gesture
    /// whose destination disappears is a gesture with no way back.
    private var emptyLoose: some View {
        Text("Drag a page here to take it out of its receipt.")
            .font(.popsCaption)
            .foregroundStyle(Color.popsMutedForeground)
            .frame(maxWidth: .infinity)
            .padding(.vertical, PopsSpacing.xl)
            .background(
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .strokeBorder(
                        Color.popsSeparator,
                        style: StrokeStyle(lineWidth: PopsBorder.hairline, dash: [PopsSpacing.sm])
                    )
            )
    }

    private func tile(_ page: StagedPage, width: CGFloat, caption: String) -> some View {
        VStack(spacing: PopsSpacing.xs) {
            PopsPhoto(data: page.bytes, placeholderSymbol: glyph(for: page.media))
                .frame(width: width, height: width * ratio)
            Text(caption)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(width: width)
        }
        .contentShape(.rect)
        .onTapGesture { viewing = page }
        .draggable(page.id) {
            PopsPhoto(data: page.bytes, placeholderSymbol: glyph(for: page.media))
                .frame(width: width, height: width * ratio)
        }
        .dropDestination(for: String.self) { ids, _ in
            combine(ids, with: page.id)
            return true
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(caption)
        .accessibilityAddTraits(.isButton)
    }

    private func glyph(for media: ReceiptMediaType) -> String {
        switch media {
        case .jpeg, .png, .webp, .gif: "doc.text.image"
        case .pdf: "doc.richtext"
        case .plainText: "doc.plaintext"
        }
    }

    /// Pulls `ids` out of whatever receipts hold them, dropping any receipt
    /// left with nothing. Every rearrangement below is this plus a decision
    /// about where the pages land.
    private func takePages(_ ids: Set<String>) -> [StagedPage] {
        var taken: [StagedPage] = []
        var remaining: [StagedReceipt] = []
        for receipt in receipts {
            let moving = receipt.pages.filter { ids.contains($0.id) }
            let staying = receipt.pages.filter { !ids.contains($0.id) }
            taken.append(contentsOf: moving)
            if !staying.isEmpty {
                remaining.append(StagedReceipt(id: receipt.id, pages: staying))
            }
        }
        receipts = remaining
        return taken
    }

    /// Dropped onto another page: the two become one receipt, the target's
    /// order first.
    private func combine(_ ids: [String], with targetID: String) {
        let moving = Set(ids).subtracting([targetID])
        guard !moving.isEmpty,
            let target = receipts.first(where: { $0.pages.contains { $0.id == targetID } })
        else { return }
        let taken = takePages(moving)
        guard !taken.isEmpty else { return }
        if let index = receipts.firstIndex(where: { $0.id == target.id }) {
            receipts[index].pages.append(contentsOf: taken)
        }
    }

    /// Dropped onto a receipt card: the pages join it. The card can have been
    /// emptied by the take — dragging a two-page receipt's pages onto itself —
    /// so it is rebuilt rather than assumed to still be there.
    private func move(_ ids: [String], into receiptID: String) {
        let taken = takePages(Set(ids))
        guard !taken.isEmpty else { return }
        if let index = receipts.firstIndex(where: { $0.id == receiptID }) {
            receipts[index].pages.append(contentsOf: taken)
        } else {
            receipts.append(StagedReceipt(id: receiptID, pages: taken))
        }
    }

    /// Dropped on the loose area: each page becomes a receipt of its own.
    private func separate(_ ids: [String]) {
        let taken = takePages(Set(ids))
        receipts.append(contentsOf: taken.map { StagedReceipt(id: "r-\($0.id)", pages: [$0]) })
    }

    private func delete(_ page: StagedPage) {
        _ = takePages([page.id])
        viewing = nil
    }

    private var actions: some View {
        PopsActionBar {
            PopsButton(readTitle, prominence: .prominent) {}
                .disabled(receipts.isEmpty)
        }
    }

    private var readTitle: String {
        receipts.count == 1 ? "Read this receipt" : "Read \(receipts.count) receipts"
    }
}
